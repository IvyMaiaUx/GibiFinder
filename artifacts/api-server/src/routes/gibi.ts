import { Router, type IRouter, type Request, type Response } from "express";
import { identifyFromImages, searchByText, searchByCharacter } from "../lib/gemini";
import { supabase } from "../lib/supabase";
import { randomUUID } from "crypto";

const router: IRouter = Router();

interface ComicResultData {
  encontrado?: boolean;
  revista?: string;
  titulo?: string;
  editora?: string;
  ano?: string;
  pagina?: string;
  personagens?: string[];
  descricao?: string;
  confianca?: number;
  nota?: string;
  balloon_text?: string;
  imagem_url?: string;
  relatedResults?: ComicResultData[];
}

function buildResult(data: ComicResultData, id: string, searchType: string, images: string[] = []) {
  const coverImages = images.length > 0 ? images : (data.imagem_url ? [data.imagem_url] : []);
  return {
    id,
    encontrado: data.encontrado ?? true,
    revista: data.revista || "",
    titulo: data.titulo || "",
    editora: data.editora || "",
    ano: data.ano || "",
    pagina: data.pagina || "",
    personagens: data.personagens || [],
    descricao: data.descricao || "",
    confianca: data.confianca || 0,
    nota: data.nota || "",
    balloon_text: data.balloon_text || "",
    images: coverImages,
    search_type: searchType,
    created_at: new Date().toISOString(),
  };
}

async function saveToSupabase(result: ReturnType<typeof buildResult>, query: string, resultJson: unknown) {
  if (!supabase) return;
  try {
    await supabase.from("search_history").insert({
      id: result.id,
      search_type: result.search_type,
      query,
      images: result.images,
      revista: result.revista,
      titulo: result.titulo,
      editora: result.editora,
      ano: result.ano,
      pagina: result.pagina,
      personagens: result.personagens,
      descricao: result.descricao,
      confianca: result.confianca,
      nota: result.nota,
      balloon_text: result.balloon_text,
      result_json: resultJson,
    });
  } catch (err) {
    console.error("Supabase save error:", err);
  }
}

// Search the gibis collection in DB
async function searchCollection(terms: string[]): Promise<ComicResultData[]> {
  if (!supabase) return [];
  try {
    const query = terms.join(" ");
    const { data, error } = await supabase
      .from("gibis")
      .select("*")
      .or(
        terms.map(t =>
          `titulo.ilike.%${t}%,revista.ilike.%${t}%,editora.ilike.%${t}%,descricao.ilike.%${t}%`
        ).join(",")
      )
      .limit(10);
    if (error) {
      console.error("Collection search error:", JSON.stringify(error));
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("Collection search exception:", err);
    return [];
  }
}

async function searchCollectionByCharacter(character: string): Promise<ComicResultData[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("gibis")
      .select("*")
      .contains("personagens", [character])
      .limit(10);
    if (error || !data?.length) {
      // fallback: text match in personagens array using ilike on text cast
      const { data: data2, error: error2 } = await supabase
        .from("gibis")
        .select("*")
        .ilike("titulo", `%${character}%`)
        .limit(10);
      if (!error2 && data2) return data2;
      return [];
    }
    return data;
  } catch {
    return [];
  }
}

// ============================================================
// COLLECTION CRUD ROUTES
// ============================================================

// GET /api/colecao — list all comics
router.get("/colecao", async (req: Request, res: Response) => {
  if (!supabase) {
    res.json({ items: [], total: 0 });
    return;
  }
  try {
    const { q, editora, limit = "100", offset = "0" } = req.query as Record<string, string>;

    let query = supabase
      .from("gibis")
      .select("*", { count: "exact" })
      .order("revista", { ascending: true })
      .order("titulo", { ascending: true })
      .limit(parseInt(limit))
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (q) {
      query = query.or(`titulo.ilike.%${q}%,revista.ilike.%${q}%,editora.ilike.%${q}%`);
    }
    if (editora) query = query.ilike("editora", `%${editora}%`);

    const { data, count, error } = await query;
    if (error) {
      console.error("Colecao list error:", JSON.stringify(error));
      res.json({ items: [], total: 0 });
      return;
    }
    res.json({ items: data || [], total: count || 0 });
  } catch (err) {
    console.error("Colecao list exception:", err);
    res.json({ items: [], total: 0 });
  }
});

// POST /api/colecao — add a comic
router.post("/colecao", async (req: Request, res: Response) => {
  if (!supabase) {
    res.status(503).json({ error: "db_unavailable", message: "Banco de dados não configurado" });
    return;
  }
  try {
    const body = req.body as {
      titulo?: string;
      revista?: string;
      editora?: string;
      ano?: string;
      numero?: string;
      personagens?: string[];
      descricao?: string;
      imagem_url?: string;
      tags?: string[];
      notas?: string;
    };

    if (!body.titulo?.trim()) {
      res.status(400).json({ error: "invalid_input", message: "Título é obrigatório" });
      return;
    }

    const { data, error } = await supabase
      .from("gibis")
      .insert({
        titulo: body.titulo.trim(),
        revista: body.revista?.trim() || null,
        editora: body.editora?.trim() || null,
        ano: body.ano?.trim() || null,
        numero: body.numero?.trim() || null,
        personagens: body.personagens || [],
        descricao: body.descricao?.trim() || null,
        imagem_url: body.imagem_url?.trim() || null,
        tags: body.tags || [],
        notas: body.notas?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Colecao insert error:", JSON.stringify(error));
      res.status(500).json({ error: "db_error", message: error.message });
      return;
    }
    res.status(201).json({ item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao adicionar gibi";
    res.status(500).json({ error: "insert_error", message });
  }
});

// PUT /api/colecao/:id — update a comic
router.put("/colecao/:id", async (req: Request, res: Response) => {
  if (!supabase) {
    res.status(503).json({ error: "db_unavailable", message: "Banco de dados não configurado" });
    return;
  }
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;

    const { data, error } = await supabase
      .from("gibis")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: "db_error", message: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "not_found", message: "Gibi não encontrado" });
      return;
    }
    res.json({ item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar gibi";
    res.status(500).json({ error: "update_error", message });
  }
});

// DELETE /api/colecao/:id — delete a comic
router.delete("/colecao/:id", async (req: Request, res: Response) => {
  if (!supabase) {
    res.status(503).json({ error: "db_unavailable", message: "Banco de dados não configurado" });
    return;
  }
  try {
    const { id } = req.params;
    const { error } = await supabase.from("gibis").delete().eq("id", id);
    if (error) {
      res.status(500).json({ error: "db_error", message: error.message });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao remover gibi";
    res.status(500).json({ error: "delete_error", message });
  }
});

// ============================================================
// SEARCH ROUTES (DB first, then Gemini fallback)
// ============================================================

// POST /api/identify - identify from images
router.post("/identify", async (req: Request, res: Response) => {
  try {
    const { images } = req.body as { images?: string[] };

    if (!images || !Array.isArray(images) || images.length === 0) {
      res.status(400).json({ error: "invalid_input", message: "Envie pelo menos uma imagem" });
      return;
    }
    if (images.length > 3) {
      res.status(400).json({ error: "too_many_images", message: "Máximo de 3 imagens por busca" });
      return;
    }

    const geminiResult = await identifyFromImages(images) as ComicResultData;
    const mainId = randomUUID();
    const mainResult = buildResult(geminiResult, mainId, "image", images);
    const relatedResults = (geminiResult.relatedResults || []).map((r: ComicResultData) =>
      buildResult(r, randomUUID(), "image")
    );

    const response = { mainResult, relatedResults };
    await saveToSupabase(mainResult, `[${images.length} imagem(ns)]`, response);

    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao identificar o gibi";
    res.status(500).json({ error: "gemini_error", message });
  }
});

// POST /api/search - text search (DB first)
router.post("/search", async (req: Request, res: Response) => {
  try {
    const { query } = req.body as { query?: string };

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      res.status(400).json({ error: "invalid_input", message: "Forneça uma descrição para buscar" });
      return;
    }

    // Search real collection first
    const terms = query.trim().split(/\s+/).filter(t => t.length > 2);
    const dbResults = await searchCollection(terms.length > 0 ? terms : [query.trim()]);

    if (dbResults.length > 0) {
      const [first, ...rest] = dbResults;
      const mainResult = buildResult({ ...first, encontrado: true, confianca: 100 }, (first as { id?: string }).id || randomUUID(), "text");
      const relatedResults = rest.slice(0, 4).map((r) =>
        buildResult({ ...r, encontrado: true, confianca: 90 }, (r as { id?: string }).id || randomUUID(), "text")
      );
      res.json({ mainResult, relatedResults, source: "colecao" });
      return;
    }

    // Fallback to Gemini
    const geminiResult = await searchByText(query) as ComicResultData;
    const mainId = randomUUID();
    const mainResult = buildResult(geminiResult, mainId, "text");
    const relatedResults = (geminiResult.relatedResults || []).map((r: ComicResultData) =>
      buildResult(r, randomUUID(), "text")
    );

    const response = { mainResult, relatedResults, source: "gemini" };
    await saveToSupabase(mainResult, query, response);
    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro na busca";
    res.status(500).json({ error: "search_error", message });
  }
});

// POST /api/character-search (DB first)
router.post("/character-search", async (req: Request, res: Response) => {
  try {
    const { character } = req.body as { character?: string };

    if (!character || typeof character !== "string" || character.trim().length === 0) {
      res.status(400).json({ error: "invalid_input", message: "Forneça o nome de um personagem" });
      return;
    }

    // Search real collection first
    const dbResults = await searchCollectionByCharacter(character.trim());

    if (dbResults.length > 0) {
      const [first, ...rest] = dbResults;
      const mainResult = buildResult({ ...first, encontrado: true, confianca: 100 }, (first as { id?: string }).id || randomUUID(), "character");
      const relatedResults = rest.slice(0, 4).map((r) =>
        buildResult({ ...r, encontrado: true, confianca: 90 }, (r as { id?: string }).id || randomUUID(), "character")
      );
      res.json({ mainResult, relatedResults, source: "colecao" });
      return;
    }

    // Fallback to Gemini
    const geminiResult = await searchByCharacter(character) as ComicResultData;
    const mainId = randomUUID();
    const mainResult = buildResult(geminiResult, mainId, "character");
    const relatedResults = (geminiResult.relatedResults || []).map((r: ComicResultData) =>
      buildResult(r, randomUUID(), "character")
    );

    const response = { mainResult, relatedResults, source: "gemini" };
    await saveToSupabase(mainResult, character, response);
    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro na busca por personagem";
    res.status(500).json({ error: "character_search_error", message });
  }
});

// POST /api/quote-search (DB first)
router.post("/quote-search", async (req: Request, res: Response) => {
  try {
    const { quote } = req.body as { quote?: string };

    if (!quote || typeof quote !== "string" || quote.trim().length === 0) {
      res.status(400).json({ error: "invalid_input", message: "Forneça uma fala para buscar" });
      return;
    }

    // Search DB collection first for matching descriptions/notes
    const dbResults = await searchCollection([quote.trim()]);

    if (dbResults.length > 0) {
      const [first, ...rest] = dbResults;
      const mainResult = buildResult({ ...first, encontrado: true, confianca: 100, balloon_text: quote }, (first as { id?: string }).id || randomUUID(), "quote");
      const relatedResults = rest.slice(0, 4).map((r) =>
        buildResult({ ...r, encontrado: true, confianca: 90 }, (r as { id?: string }).id || randomUUID(), "quote")
      );
      res.json({ mainResult, relatedResults, source: "colecao" });
      return;
    }

    // Fallback to Gemini
    const geminiResult = await searchByText(`história com a fala: "${quote}"`) as ComicResultData;
    const mainId = randomUUID();
    const mainResult = buildResult(geminiResult, mainId, "quote");
    const relatedResults = (geminiResult.relatedResults || []).map((r: ComicResultData) =>
      buildResult(r, randomUUID(), "quote")
    );
    const response = { mainResult, relatedResults, source: "gemini" };
    await saveToSupabase(mainResult, quote, response);
    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro na busca por fala";
    res.status(500).json({ error: "quote_search_error", message });
  }
});

// ============================================================
// HISTORY / RANKING / RESULT ROUTES
// ============================================================

// GET /api/history
router.get("/history", async (req: Request, res: Response) => {
  const { titulo, editora, limit = "50", offset = "0" } = req.query as Record<string, string>;

  if (!supabase) {
    res.json({ items: [], total: 0 });
    return;
  }

  try {
    let query = supabase
      .from("search_history")
      .select("*, result_feedback(id, is_correct)", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(parseInt(limit))
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (titulo) query = query.ilike("titulo", `%${titulo}%`);
    if (editora) query = query.ilike("editora", `%${editora}%`);

    const { data, count, error } = await query;

    if (error) {
      console.error("Supabase history error:", JSON.stringify(error));
      res.json({ items: [], total: 0 });
      return;
    }

    const items = (data || []).map((row: Record<string, unknown>) => {
      const feedback = (row.result_feedback as { is_correct: boolean }[]) || [];
      return {
        ...row,
        feedback_count: feedback.length,
        correct_count: feedback.filter((f: { is_correct: boolean }) => f.is_correct).length,
        result_feedback: undefined,
      };
    });

    res.json({ items, total: count || 0 });
  } catch (err: unknown) {
    console.error("History exception:", err);
    res.json({ items: [], total: 0 });
  }
});

// GET /api/ranking
router.get("/ranking", async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      res.json({ items: [], week_start: new Date().toISOString() });
      return;
    }

    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diff);
    weekStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from("search_history")
      .select("revista, titulo, editora, images, created_at")
      .gte("created_at", weekStart.toISOString())
      .not("revista", "is", null)
      .not("revista", "eq", "");

    if (error) {
      console.error("Ranking error:", JSON.stringify(error));
      res.json({ items: [], week_start: weekStart.toISOString() });
      return;
    }

    const counts = new Map<string, {
      revista: string;
      titulo: string;
      editora: string;
      images: string[];
      search_count: number;
      last_searched: string;
    }>();

    for (const row of data || []) {
      const key = `${row.revista}||${row.titulo}`;
      const existing = counts.get(key);
      if (existing) {
        existing.search_count++;
        if (row.created_at > existing.last_searched) existing.last_searched = row.created_at;
      } else {
        counts.set(key, {
          revista: row.revista,
          titulo: row.titulo,
          editora: row.editora,
          images: row.images || [],
          search_count: 1,
          last_searched: row.created_at,
        });
      }
    }

    const items = Array.from(counts.values())
      .sort((a, b) => b.search_count - a.search_count)
      .slice(0, 20);

    res.json({ items, week_start: weekStart.toISOString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao buscar ranking";
    res.status(500).json({ error: "ranking_error", message });
  }
});

// GET /api/result/:id
router.get("/result/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!supabase) {
      res.status(404).json({ error: "not_found", message: "Resultado não encontrado" });
      return;
    }

    // Check gibis collection first
    const { data: gibiData } = await supabase
      .from("gibis")
      .select("*")
      .eq("id", id)
      .single();

    if (gibiData) {
      const result = buildResult(gibiData as ComicResultData, gibiData.id as string, "colecao", gibiData.imagem_url ? [gibiData.imagem_url as string] : []);
      res.json({ result, feedback: [] });
      return;
    }

    const { data: resultData, error: resultError } = await supabase
      .from("search_history")
      .select("*")
      .eq("id", id)
      .single();

    if (resultError || !resultData) {
      res.status(404).json({ error: "not_found", message: "Resultado não encontrado" });
      return;
    }

    const { data: feedbackData } = await supabase
      .from("result_feedback")
      .select("*")
      .eq("result_id", id)
      .order("created_at", { ascending: false });

    const result = buildResult(
      resultData as ComicResultData,
      resultData.id as string,
      resultData.search_type as string,
      resultData.images as string[] || []
    );

    res.json({ result, feedback: feedbackData || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao buscar resultado";
    res.status(500).json({ error: "result_error", message });
  }
});

// POST /api/feedback
router.post("/feedback", async (req: Request, res: Response) => {
  const { result_id, is_correct, correction_text } = req.body as {
    result_id?: string;
    is_correct?: boolean;
    correction_text?: string;
  };

  if (!result_id || typeof is_correct !== "boolean") {
    res.status(400).json({ error: "invalid_input", message: "Dados de feedback inválidos" });
    return;
  }

  const feedbackId = randomUUID();

  if (!supabase) {
    res.json({ success: true, id: feedbackId });
    return;
  }

  try {
    const { error } = await supabase.from("result_feedback").insert({
      id: feedbackId,
      result_id,
      is_correct,
      correction_text: correction_text || null,
    });

    if (error) console.error("Supabase feedback error:", JSON.stringify(error));
    res.json({ success: true, id: feedbackId });
  } catch (err: unknown) {
    console.error("Feedback exception:", err);
    res.json({ success: true, id: feedbackId });
  }
});

export default router;
