import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { logger } from "./logger";

const apiKey = process.env["GEMINI_API_KEY"];
const modelName = process.env["GEMINI_MODEL"] || "gemini-2.5-flash";

if (!apiKey) {
  logger.warn("GEMINI_API_KEY not set — AI features will be unavailable");
}

export const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export function getModel() {
  if (!genAI) throw new Error("GEMINI_API_KEY não configurada");
  return genAI.getGenerativeModel({ model: modelName });
}

const COMIC_EXPERT_CONTEXT = `Você é um especialista em histórias em quadrinhos brasileiras, com profundo conhecimento sobre:
- Turma da Mônica, Cebolinha, Cascão, Magali, Bidu e toda a turma do Mauricio de Sousa
- Gibis da Editora Abril (Monica, Cebolinha, Pato Donald, Homem-Aranha, etc.)
- Gibis da Panini Comics Brasil
- Gibis da Editora Globo
- HQs nacionais e internacionais publicadas no Brasil
- Turma da Mônica Jovem
- Clássicos do quadrinho brasileiro`;

export async function identifyFromImages(base64Images: string[]): Promise<unknown> {
  const model = getModel();

  const imageParts: Part[] = base64Images.map((b64) => {
    const mimeMatch = b64.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const data = b64.replace(/^data:[^;]+;base64,/, "");
    return {
      inlineData: { data, mimeType },
    };
  });

  const prompt = `${COMIC_EXPERT_CONTEXT}

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

  const result = await model.generateContent([prompt, ...imageParts]);
  const text = result.response.text().trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Resposta do Gemini não contém JSON válido");

  return JSON.parse(jsonMatch[0]);
}

export async function searchByText(query: string): Promise<unknown> {
  const model = getModel();

  const prompt = `${COMIC_EXPERT_CONTEXT}

Um usuário está procurando uma história em quadrinhos com esta descrição: "${query}"

Identifique a melhor correspondência e resultados relacionados. Retorne APENAS um objeto JSON válido:

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

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Resposta do Gemini não contém JSON válido");
  return JSON.parse(jsonMatch[0]);
}

export async function searchByCharacter(character: string): Promise<unknown> {
  const model = getModel();

  const prompt = `${COMIC_EXPERT_CONTEXT}

Liste as principais histórias em quadrinhos brasileiras onde o personagem "${character}" aparece. Inclua pelo menos 8-10 resultados se disponíveis.

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

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Resposta do Gemini não contém JSON válido");
  return JSON.parse(jsonMatch[0]);
}
