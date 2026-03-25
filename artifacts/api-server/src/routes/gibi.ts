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
  relatedResults?: ComicResultData[];
}

function buildResult(data: ComicResultData, id: string, searchType: string, images: string[] = []) {
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
    images,
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
    // Non-fatal: log but don't throw
    console.error("Supabase save error:", err);
  }
}

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
    await saveToSupabase(mainResult, `[${images.length} image(s)]`, response);

    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao identificar o gibi";
    res.status(500).json({ error: "gemini_error", message });
  }
});

// POST /api/search - text search
router.post("/search", async (req: Request, res: Response) => {
  try {
    const { query } = req.body as { query?: string };

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      res.status(400).json({ error: "invalid_input", message: "Forneça uma descrição para buscar" });
      return;
    }

    const geminiResult = await searchByText(query) as ComicResultData;
    const mainId = randomUUID();
    const mainResult = buildResult(geminiResult, mainId, "text");
    const relatedResults = (geminiResult.relatedResults || []).map((r: ComicResultData) =>
      buildResult(r, randomUUID(), "text")
    );

    const response = { mainResult, relatedResults };
    await saveToSupabase(mainResult, query, response);

    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro na busca";
    res.status(500).json({ error: "search_error", message });
  }
});

// POST /api/character-search
router.post("/character-search", async (req: Request, res: Response) => {
  try {
    const { character } = req.body as { character?: string };

    if (!character || typeof character !== "string" || character.trim().length === 0) {
      res.status(400).json({ error: "invalid_input", message: "Forneça o nome de um personagem" });
      return;
    }

    const geminiResult = await searchByCharacter(character) as ComicResultData;
    const mainId = randomUUID();
    const mainResult = buildResult(geminiResult, mainId, "character");
    const relatedResults = (geminiResult.relatedResults || []).map((r: ComicResultData) =>
      buildResult(r, randomUUID(), "character")
    );

    const response = { mainResult, relatedResults };
    await saveToSupabase(mainResult, character, response);

    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro na busca por personagem";
    res.status(500).json({ error: "character_search_error", message });
  }
});

// POST /api/quote-search - search stored balloon text
router.post("/quote-search", async (req: Request, res: Response) => {
  try {
    const { quote } = req.body as { quote?: string };

    if (!quote || typeof quote !== "string" || quote.trim().length === 0) {
      res.status(400).json({ error: "invalid_input", message: "Forneça uma fala para buscar" });
      return;
    }

    let items: ComicResultData[] = [];

    if (supabase) {
      const { data } = await supabase
        .from("search_history")
        .select("*")
        .ilike("balloon_text", `%${quote}%`)
        .limit(10);
      items = data || [];
    }

    // If no stored results, also use Gemini
    if (items.length === 0) {
      const geminiResult = await searchByText(`história com a fala: "${quote}"`) as ComicResultData;
      const mainId = randomUUID();
      const mainResult = buildResult(geminiResult, mainId, "quote");
      const relatedResults = (geminiResult.relatedResults || []).map((r: ComicResultData) =>
        buildResult(r, randomUUID(), "quote")
      );
      const response = { mainResult, relatedResults };
      await saveToSupabase(mainResult, quote, response);
      res.json(response);
      return;
    }

    const [first, ...rest] = items;
    const mainResult = buildResult(first as ComicResultData, (first as { id?: string }).id || randomUUID(), "quote");
    const relatedResults = rest.map((r: ComicResultData) =>
      buildResult(r, (r as { id?: string }).id || randomUUID(), "quote")
    );

    res.json({ mainResult, relatedResults });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro na busca por fala";
    res.status(500).json({ error: "quote_search_error", message });
  }
});

// GET /api/history
router.get("/history", async (req: Request, res: Response) => {
  try {
    const { titulo, editora, limit = "50", offset = "0" } = req.query as Record<string, string>;

    if (!supabase) {
      res.json({ items: [], total: 0 });
      return;
    }

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
      // Table may not exist yet — return empty gracefully
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        res.json({ items: [], total: 0 });
        return;
      }
      throw error;
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
    const message = err instanceof Error ? err.message : "Erro ao buscar histórico";
    res.status(500).json({ error: "history_error", message });
  }
});

// GET /api/ranking
router.get("/ranking", async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      res.json({ items: [], week_start: new Date().toISOString() });
      return;
    }

    // Get start of current week (Monday)
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
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        res.json({ items: [], week_start: weekStart.toISOString() });
        return;
      }
      throw error;
    }

    // Group by revista+titulo and count
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
        if (row.created_at > existing.last_searched) {
          existing.last_searched = row.created_at;
        }
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
  try {
    const { result_id, is_correct, correction_text } = req.body as {
      result_id?: string;
      is_correct?: boolean;
      correction_text?: string;
    };

    if (!result_id || typeof is_correct !== "boolean") {
      res.status(400).json({ error: "invalid_input", message: "Dados de feedback inválidos" });
      return;
    }

    if (!supabase) {
      res.json({ success: true, id: randomUUID() });
      return;
    }

    const feedbackId = randomUUID();
    const { error } = await supabase.from("result_feedback").insert({
      id: feedbackId,
      result_id,
      is_correct,
      correction_text: correction_text || null,
    });

    if (error) throw error;

    res.json({ success: true, id: feedbackId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao salvar feedback";
    res.status(500).json({ error: "feedback_error", message });
  }
});

export default router;
