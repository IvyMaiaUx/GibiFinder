import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { logger } from "./logger";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

const WIKI_HEADERS = {
  "User-Agent": "GibiFinder/1.0 (https://gibifinder.app; contact@gibifinder.app)",
  "Accept": "application/json",
};

export async function fetchWikipediaImage(query: string): Promise<string | null> {
  const tryLang = async (lang: string): Promise<string | null> => {
    try {
      const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`;
      const searchRes = await withTimeout(fetch(searchUrl, { headers: WIKI_HEADERS }), 6000);
      if (!searchRes.ok) return null;
      const searchData = await searchRes.json() as { query?: { search?: { title: string }[] } };
      const firstTitle = searchData?.query?.search?.[0]?.title;
      if (!firstTitle) return null;

      const imgUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(firstTitle)}&prop=pageimages&format=json&pithumbsize=600`;
      const imgRes = await withTimeout(fetch(imgUrl, { headers: WIKI_HEADERS }), 6000);
      if (!imgRes.ok) return null;
      const imgData = await imgRes.json() as { query?: { pages?: Record<string, { thumbnail?: { source: string } }> } };
      const pages = imgData?.query?.pages;
      if (!pages) return null;
      const page = Object.values(pages)[0];
      return page?.thumbnail?.source || null;
    } catch (e) {
      logger.warn({ msg: "Wikipedia image fetch failed", lang, query, err: String(e) });
      return null;
    }
  };

  return (await tryLang("pt")) || (await tryLang("en"));
}

const modelName = process.env["GEMINI_MODEL"] || "gemini-2.5-flash";

// Support multiple keys separated by comma for rate-limit rotation
const rawKeys = process.env["GEMINI_API_KEY"] || "";
const apiKeys = rawKeys.split(",").map(k => k.trim()).filter(Boolean);

if (apiKeys.length === 0) {
  logger.warn("GEMINI_API_KEY not set — AI features will be unavailable");
} else {
  logger.info({ msg: `Gemini: ${apiKeys.length} API key(s) configured` });
}

const clients = apiKeys.map(key => new GoogleGenerativeAI(key));

let currentKeyIndex = 0;

function getNextClient(): GoogleGenerativeAI | null {
  if (clients.length === 0) return null;
  return clients[currentKeyIndex];
}

function rotateKey() {
  if (clients.length <= 1) return;
  currentKeyIndex = (currentKeyIndex + 1) % clients.length;
  logger.warn({ msg: `Gemini: rotating to key index ${currentKeyIndex}` });
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("429") || msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("quota");
}

export const genAI = clients[0] || null;

export function getModel() {
  const client = getNextClient();
  if (!client) throw new Error("GEMINI_API_KEY não configurada");
  return client.getGenerativeModel({ model: modelName });
}

async function withKeyRotation<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = Math.max(clients.length, 1);
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err) && clients.length > 1) {
        rotateKey();
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

const COMIC_EXPERT_CONTEXT = `Você é um especialista em histórias em quadrinhos brasileiras, com profundo conhecimento sobre:
- Turma da Mônica, Cebolinha, Cascão, Magali, Bidu e toda a turma do Mauricio de Sousa
- Gibis da Editora Abril (Monica, Cebolinha, Pato Donald, Homem-Aranha, etc.)
- Gibis da Panini Comics Brasil
- Gibis da Editora Globo
- HQs nacionais e internacionais publicadas no Brasil
- Turma da Mônica Jovem
- Clássicos do quadrinho brasileiro`;

const IDENTIFY_PROMPT = `${COMIC_EXPERT_CONTEXT}

Analise as imagens fornecidas e identifique a história em quadrinhos. Retorne APENAS um objeto JSON válido, sem markdown, sem explicações, com exatamente esta estrutura:

{
  "encontrado": true,
  "revista": "Nome da revista/gibi",
  "titulo": "Título da história",
  "editora": "Nome da editora",
  "ano": "Ano de publicação",
  "pagina": "Número da página ou intervalo",
  "personagens": ["Personagem 1", "Personagem 2"],
  "descricao": "Descrição detalhada da cena ou história",
  "confianca": 85,
  "nota": "Informações adicionais relevantes",
  "balloon_text": "Texto de balões de fala visíveis nas imagens",
  "relatedResults": [
    {
      "revista": "Outra revista relacionada",
      "titulo": "Outro título relacionado",
      "editora": "Editora",
      "ano": "Ano",
      "pagina": "",
      "personagens": [],
      "descricao": "Por que pode ser esta",
      "confianca": 40
    }
  ]
}

Se não conseguir identificar, retorne encontrado: false mas tente fornecer pistas com base nos personagens ou estilo visual.
O campo "confianca" deve ser um número de 0 a 100 indicando sua certeza.`;

export async function identifyFromImages(base64Images: string[]): Promise<unknown> {
  const imageParts: Part[] = base64Images.map((b64) => {
    const mimeMatch = b64.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const data = b64.replace(/^data:[^;]+;base64,/, "");
    return { inlineData: { data, mimeType } };
  });

  return withKeyRotation(async () => {
    const model = getModel();
    const result = await model.generateContent([IDENTIFY_PROMPT, ...imageParts]);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Resposta do Gemini não contém JSON válido");
    return JSON.parse(jsonMatch[0]);
  });
}

export async function searchByText(query: string, fandomContext?: string): Promise<unknown> {
  const contextBlock = fandomContext
    ? `\n\nINFORMAÇÕES DE REFERÊNCIA (use como base factual prioritária):\n${fandomContext}\n`
    : "";

  const prompt = `${COMIC_EXPERT_CONTEXT}${contextBlock}

Um usuário está procurando uma história em quadrinhos com esta descrição: "${query}"

Identifique a melhor correspondência e resultados relacionados. Se as informações de referência acima forem relevantes, priorize os dados factual delas (títulos, editorias, anos, personagens). Retorne APENAS um objeto JSON válido:

{
  "encontrado": true,
  "revista": "Nome da revista/gibi",
  "titulo": "Título da história",
  "editora": "Nome da editora",
  "ano": "Ano de publicação",
  "pagina": "",
  "personagens": ["Personagem 1"],
  "descricao": "Descrição da história",
  "confianca": 80,
  "nota": "Informações adicionais",
  "balloon_text": "",
  "relatedResults": [
    {
      "revista": "Outra opção",
      "titulo": "Outro título",
      "editora": "Editora",
      "ano": "Ano",
      "pagina": "",
      "personagens": [],
      "descricao": "Por que pode ser esta",
      "confianca": 50
    }
  ]
}`;

  return withKeyRotation(async () => {
    const model = getModel();
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Resposta do Gemini não contém JSON válido");
    return JSON.parse(jsonMatch[0]);
  });
}

export async function searchByCharacter(character: string, fandomContext?: string): Promise<unknown> {
  const contextBlock = fandomContext
    ? `\n\nINFORMAÇÕES DE REFERÊNCIA (use como base factual prioritária):\n${fandomContext}\n`
    : "";

  const prompt = `${COMIC_EXPERT_CONTEXT}${contextBlock}

Liste as principais histórias em quadrinhos brasileiras onde o personagem "${character}" aparece. Inclua pelo menos 8-10 resultados se disponíveis.
Se as informações de referência acima forem relevantes, priorize os dados factuais delas.

Retorne APENAS um objeto JSON válido:

{
  "encontrado": true,
  "revista": "Revista principal do personagem",
  "titulo": "História mais famosa",
  "editora": "Editora principal",
  "ano": "",
  "pagina": "",
  "personagens": ["${character}"],
  "descricao": "Descrição geral do personagem nas HQs",
  "confianca": 95,
  "nota": "Informações sobre o personagem",
  "balloon_text": "",
  "relatedResults": [
    {
      "revista": "Nome da revista",
      "titulo": "Título da história",
      "editora": "Editora",
      "ano": "Ano",
      "pagina": "",
      "personagens": ["${character}"],
      "descricao": "O que acontece nesta história",
      "confianca": 80
    }
  ]
}`;

  return withKeyRotation(async () => {
    const model = getModel();
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Resposta do Gemini não contém JSON válido");
    return JSON.parse(jsonMatch[0]);
  });
}
