import { logger } from "./logger";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.0-flash";

if (!GEMINI_API_KEY) {
  logger.warn("GEMINI_API_KEY is not set");
}

export interface ComicAlternative {
  rank: number;
  encontrado: boolean;
  titulo: string;
  editora: string;
  anoLancamento: string;
  numeroPagina: string;
  personagens: string[];
  descricao: string;
  confianca: number;
  nota: string;
  balloonText: string;
}

function parseJsonFromText(text: string): unknown {
  const codeBlock = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeBlock) return JSON.parse(codeBlock[1]!);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  throw new Error("No JSON found in Gemini response");
}

function sanitizeAlternative(r: Record<string, unknown>, rank: number): ComicAlternative {
  return {
    rank,
    encontrado: Boolean(r.encontrado ?? true),
    titulo: String(r.titulo ?? ""),
    editora: String(r.editora ?? ""),
    anoLancamento: String(r.anoLancamento ?? ""),
    numeroPagina: String(r.numeroPagina ?? ""),
    personagens: Array.isArray(r.personagens) ? r.personagens.map(String) : [],
    descricao: String(r.descricao ?? ""),
    confianca: Math.min(100, Math.max(0, Number(r.confianca ?? 0))),
    nota: String(r.nota ?? ""),
    balloonText: String(r.balloonText ?? ""),
  };
}

async function callGemini(parts: unknown[]): Promise<string> {
  const url = `${GEMINI_BASE_URL}/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${err}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

const THREE_RESULTS_SCHEMA = `{
  "alternativas": [
    {
      "rank": 1,
      "encontrado": true,
      "titulo": "Título exato da revista",
      "editora": "Nome da editora",
      "anoLancamento": "1963",
      "numeroPagina": "12",
      "personagens": ["Personagem 1"],
      "descricao": "Descrição detalhada",
      "confianca": 90,
      "nota": "Curiosidades, autores, edição",
      "balloonText": ""
    },
    { "rank": 2, "encontrado": true, "titulo": "...", "editora": "...", "anoLancamento": "", "numeroPagina": "", "personagens": [], "descricao": "...", "confianca": 65, "nota": "", "balloonText": "" },
    { "rank": 3, "encontrado": true, "titulo": "...", "editora": "...", "anoLancamento": "", "numeroPagina": "", "personagens": [], "descricao": "...", "confianca": 40, "nota": "", "balloonText": "" }
  ]
}`;

function parseAlternatives(text: string): ComicAlternative[] {
  const parsed = parseJsonFromText(text) as { alternativas?: Record<string, unknown>[] };
  const alternativas = Array.isArray(parsed.alternativas) ? parsed.alternativas : [parsed as Record<string, unknown>];
  return alternativas.slice(0, 3).map((a, i) => sanitizeAlternative(a, i + 1));
}

export async function identifyComicFromImages(
  images: string[],
  mimeTypes: string[]
): Promise<ComicAlternative[]> {
  const prompt = `Você é um especialista em quadrinhos brasileiros e internacionais. Analise as imagens e forneça 3 alternativas ranqueadas por probabilidade.
Para "numeroPagina": informe a página aproximada visível na imagem.
Para "balloonText" da 1ª alternativa: extraia TODO o texto dos balões de fala visíveis.
Responda SOMENTE com JSON válido:
${THREE_RESULTS_SCHEMA}`;

  const parts: unknown[] = [{ text: prompt }];
  for (let i = 0; i < images.length; i++) {
    parts.push({
      inlineData: {
        mimeType: mimeTypes[i] ?? "image/jpeg",
        data: images[i],
      },
    });
  }

  const text = await callGemini(parts);
  return parseAlternatives(text);
}

export async function searchComicByText(query: string): Promise<ComicAlternative[]> {
  const prompt = `Você é um especialista em quadrinhos. Com base na busca "${query}", forneça 3 alternativas ranqueadas de gibis/quadrinhos.
Se for personagem, liste os quadrinhos mais famosos. Ordene da mais provável para a menos provável.
Responda SOMENTE com JSON válido:
${THREE_RESULTS_SCHEMA}`;

  const text = await callGemini([{ text: prompt }]);
  return parseAlternatives(text);
}

export async function searchComicByDescription(description: string): Promise<ComicAlternative[]> {
  const prompt = `Você é um especialista em quadrinhos. O usuário descreve uma cena ou história: "${description}"
Identifique e forneça 3 alternativas ranqueadas de gibis/quadrinhos que correspondam.
Responda SOMENTE com JSON válido:
${THREE_RESULTS_SCHEMA}`;

  const text = await callGemini([{ text: prompt }]);
  return parseAlternatives(text);
}
