import { Router, type IRouter, type Request, type Response } from "express";
import { identifyFromImages, searchByText, searchByCharacter } from "../lib/gemini";
import { fetchFandomContext } from "../lib/fandom";
import { supabase } from "../lib/supabase";
import { randomUUID } from "crypto";

const router: IRouter = Router();

const ADMIN_KEY = process.env["ADMIN_KEY"] || "gibi-admin-2024";

function isAdmin(req: Request): boolean {
  return req.headers["x-admin-key"] === ADMIN_KEY;
}

function requireAdmin(req: Request, res: Response): boolean {
  if (!isAdmin(req)) {
    res.status(401).json({ error: "unauthorized", message: "Chave de administrador inválida" });
    return false;
  }
  return true;
}

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
  // Only include cover images for photo/image searches — never for text, character, quote searches
  const coverImages = images.length > 0 ? images : (searchType === "image" && data.imagem_url ? [data.imagem_url] : []);
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

async function searchCollection(terms: string[]): Promise<ComicResultData[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("gibis")
      .select("*")
      .eq("status", "approved")
      .or(
        terms.map(t =>
          `titulo.ilike.%${t}%,revista.ilike.%${t}%,editora.ilike.%${t}%,descricao.ilike.%${t}%`
        ).join(",")
      )
      .limit(10);
    if (error) { console.error("Collection search error:", JSON.stringify(error)); return []; }
    return data || [];
  } catch { return []; }
}

async function searchCollectionByCharacter(character: string): Promise<ComicResultData[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("gibis")
      .select("*")
      .eq("status", "approved")
      .contains("personagens", [character])
      .limit(10);
    if (error || !data?.length) {
      const { data: data2, error: e2 } = await supabase
        .from("gibis")
        .select("*")
        .eq("status", "approved")
        .ilike("titulo", `%${character}%`)
        .limit(10);
      if (!e2 && data2) return data2;
      return [];
    }
    return data;
  } catch { return []; }
}

// ============================================================
// COLLECTION CRUD — public submit (goes to pending)
// ============================================================

// GET /api/colecao — list approved comics (public)
router.get("/colecao", async (req: Request, res: Response) => {
  if (!supabase) { res.json({ items: [], total: 0 }); return; }
  try {
    const { q, editora, limit = "100", offset = "0" } = req.query as Record<string, string>;

    let query = supabase
      .from("gibis")
      .select("*", { count: "exact" })
      .eq("status", "approved")
      .order("revista", { ascending: true })
      .order("titulo", { ascending: true })
      .limit(parseInt(limit))
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (q) query = query.or(`titulo.ilike.%${q}%,revista.ilike.%${q}%,editora.ilike.%${q}%`);
    if (editora) query = query.ilike("editora", `%${editora}%`);

    const { data, count, error } = await query;
    if (error) { console.error("Colecao list error:", JSON.stringify(error)); res.json({ items: [], total: 0 }); return; }
    res.json({ items: data || [], total: count || 0 });
  } catch (err) { console.error("Colecao list exception:", err); res.json({ items: [], total: 0 }); }
});

// POST /api/colecao — submit for review (status: pending)
router.post("/colecao", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable", message: "Banco de dados não configurado" }); return; }
  try {
    const body = req.body as {
      titulo?: string; revista?: string; editora?: string; ano?: string;
      numero?: string; personagens?: string[]; descricao?: string;
      imagem_url?: string; drive_url?: string; tags?: string[]; notas?: string;
    };
    if (!body.titulo?.trim()) { res.status(400).json({ error: "invalid_input", message: "Título é obrigatório" }); return; }

    // Admins can submit directly as approved
    const status = isAdmin(req) ? "approved" : "pending";

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
        drive_url: body.drive_url?.trim() || null,
        tags: body.tags || [],
        notas: body.notas?.trim() || null,
        status,
      })
      .select()
      .single();

    if (error) { console.error("Colecao insert error:", JSON.stringify(error)); res.status(500).json({ error: "db_error", message: error.message }); return; }
    res.status(201).json({ item: data, status });
  } catch (err) {
    res.status(500).json({ error: "insert_error", message: err instanceof Error ? err.message : "Erro ao adicionar gibi" });
  }
});

// PUT /api/colecao/:id — update (admin only)
router.put("/colecao/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.status(503).json({ error: "db_unavailable", message: "Banco não configurado" }); return; }
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const { data, error } = await supabase
      .from("gibis")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) { res.status(500).json({ error: "db_error", message: error.message }); return; }
    if (!data) { res.status(404).json({ error: "not_found", message: "Gibi não encontrado" }); return; }
    res.json({ item: data });
  } catch (err) {
    res.status(500).json({ error: "update_error", message: err instanceof Error ? err.message : "Erro ao atualizar" });
  }
});

// DELETE /api/colecao/:id — delete (admin only)
router.delete("/colecao/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.status(503).json({ error: "db_unavailable", message: "Banco não configurado" }); return; }
  try {
    const { id } = req.params;
    const { error } = await supabase.from("gibis").delete().eq("id", id);
    if (error) { res.status(500).json({ error: "db_error", message: error.message }); return; }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "delete_error", message: err instanceof Error ? err.message : "Erro ao remover" });
  }
});

// ============================================================
// ADMIN ROUTES
// ============================================================

// GET /api/admin/pending — list pending submissions
router.get("/admin/pending", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.json({ items: [], total: 0 }); return; }
  try {
    const { data, count, error } = await supabase
      .from("gibis")
      .select("*", { count: "exact" })
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) { console.error("Admin pending error:", JSON.stringify(error)); res.json({ items: [], total: 0 }); return; }
    res.json({ items: data || [], total: count || 0 });
  } catch (err) { console.error("Admin pending exception:", err); res.json({ items: [], total: 0 }); }
});

// PUT /api/admin/review/:id — approve or reject
router.put("/admin/review/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.status(503).json({ error: "db_unavailable", message: "Banco não configurado" }); return; }
  try {
    const { id } = req.params;
    const { action } = req.body as { action: "approve" | "reject" };
    if (!["approve", "reject"].includes(action)) {
      res.status(400).json({ error: "invalid_action", message: "Ação deve ser 'approve' ou 'reject'" });
      return;
    }
    const status = action === "approve" ? "approved" : "rejected";
    const { data, error } = await supabase
      .from("gibis")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) { res.status(500).json({ error: "db_error", message: error.message }); return; }
    res.json({ item: data, status });
  } catch (err) {
    res.status(500).json({ error: "review_error", message: err instanceof Error ? err.message : "Erro ao revisar" });
  }
});

// GET /api/admin/verify — check if admin key is valid
router.get("/admin/verify", (req: Request, res: Response) => {
  res.json({ valid: isAdmin(req) });
});

// POST /api/admin/import-drive — bulk import from Google Drive folder
router.post("/admin/import-drive", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.status(503).json({ error: "db_unavailable", message: "Banco não configurado" }); return; }

  const driveApiKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!driveApiKey) {
    res.status(503).json({ error: "no_drive_key", message: "GOOGLE_DRIVE_API_KEY não configurada no servidor" });
    return;
  }

  try {
    const { folderUrl, importStatus = "pending" } = req.body as { folderUrl?: string; importStatus?: string };
    if (!folderUrl || typeof folderUrl !== "string") {
      res.status(400).json({ error: "invalid_input", message: "URL da pasta é obrigatória" }); return;
    }

    const folderIdMatch = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (!folderIdMatch) {
      res.status(400).json({ error: "invalid_url", message: "URL de pasta do Drive inválida. Use o link de compartilhamento da pasta." }); return;
    }
    const folderId = folderIdMatch[1];

    // List PDF files in folder
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents+and+trashed%3Dfalse+and+mimeType%3D%27application%2Fpdf%27&key=${driveApiKey}&fields=files(id,name,mimeType)&pageSize=50`;
    const listRes = await fetch(listUrl);
    if (!listRes.ok) {
      const errText = await listRes.text();
      console.error("Drive API error:", errText);
      res.status(502).json({ error: "drive_api_error", message: "Erro ao listar arquivos do Drive. Verifique se a pasta é pública e a chave da API é válida." });
      return;
    }
    const listData = await listRes.json() as { files?: { id: string; name: string; mimeType: string }[] };
    const files = listData.files || [];

    if (files.length === 0) {
      res.json({ imported: 0, skipped: 0, results: [], message: "Nenhum PDF encontrado na pasta" });
      return;
    }

    const MAX_FILES = 20;
    const toProcess = files.slice(0, MAX_FILES);
    const results: { file: string; titulo: string; status: string; id?: string; error?: string }[] = [];
    let imported = 0;
    let skipped = 0;

    for (const file of toProcess) {
      try {
        const thumbnailUrl = `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`;
        const driveViewUrl = `https://drive.google.com/file/d/${file.id}/view`;

        // Fetch thumbnail as base64
        const thumbRes = await fetch(thumbnailUrl);
        if (!thumbRes.ok) {
          results.push({ file: file.name, titulo: "", status: "skipped", error: "Thumbnail inacessível" });
          skipped++;
          continue;
        }
        const thumbBuffer = await thumbRes.arrayBuffer();
        const base64 = Buffer.from(thumbBuffer).toString("base64");
        const contentType = thumbRes.headers.get("content-type") || "image/jpeg";
        const dataUrl = `data:${contentType};base64,${base64}`;

        // Identify with Gemini
        const { identifyFromImages } = await import("../lib/gemini");
        const identified = await (identifyFromImages as (imgs: string[]) => Promise<ComicResultData>)([dataUrl]);

        const titulo = identified.titulo || file.name.replace(".pdf", "");

        // Insert into collection
        const { data: inserted, error: insertErr } = await supabase
          .from("gibis")
          .insert({
            titulo,
            revista: identified.revista || null,
            editora: identified.editora || null,
            ano: identified.ano || null,
            personagens: identified.personagens || [],
            descricao: identified.descricao || null,
            imagem_url: thumbnailUrl,
            drive_url: driveViewUrl,
            status: importStatus === "approved" ? "approved" : "pending",
          })
          .select()
          .single();

        if (insertErr) {
          results.push({ file: file.name, titulo, status: "error", error: insertErr.message });
          skipped++;
        } else {
          results.push({ file: file.name, titulo, status: "ok", id: (inserted as { id: string }).id });
          imported++;
        }
      } catch (err) {
        results.push({ file: file.name, titulo: "", status: "error", error: err instanceof Error ? err.message : "Erro desconhecido" });
        skipped++;
      }
    }

    const message = files.length > MAX_FILES
      ? `Processados ${MAX_FILES} de ${files.length} arquivos (limite por importação).`
      : undefined;

    res.json({ imported, skipped, results, message });
  } catch (err) {
    console.error("Import drive error:", err);
    res.status(500).json({ error: "import_error", message: err instanceof Error ? err.message : "Erro na importação" });
  }
});

// ============================================================
// SEARCH ROUTES (DB approved first, Gemini fallback)
// ============================================================

router.post("/identify", async (req: Request, res: Response) => {
  try {
    const { images } = req.body as { images?: string[] };
    if (!images || !Array.isArray(images) || images.length === 0) {
      res.status(400).json({ error: "invalid_input", message: "Envie pelo menos uma imagem" }); return;
    }
    if (images.length > 3) {
      res.status(400).json({ error: "too_many_images", message: "Máximo de 3 imagens por busca" }); return;
    }
    const geminiResult = await identifyFromImages(images) as ComicResultData;
    const mainId = randomUUID();
    const mainResult = buildResult(geminiResult, mainId, "image", images);
    const relatedResults = (geminiResult.relatedResults || []).map((r) => buildResult(r, randomUUID(), "image"));
    const response = { mainResult, relatedResults };
    await saveToSupabase(mainResult, `[${images.length} imagem(ns)]`, response);
    res.json(response);
  } catch (err: unknown) {
    res.status(500).json({ error: "gemini_error", message: err instanceof Error ? err.message : "Erro ao identificar" });
  }
});

router.post("/search", async (req: Request, res: Response) => {
  try {
    const { query } = req.body as { query?: string };
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      res.status(400).json({ error: "invalid_input", message: "Forneça uma descrição para buscar" }); return;
    }
    const terms = query.trim().split(/\s+/).filter(t => t.length > 2);

    // Search DB and Fandom in parallel
    const [dbResults, fandomCtx] = await Promise.all([
      searchCollection(terms.length > 0 ? terms : [query.trim()]),
      fetchFandomContext(query, "gibi"),
    ]);

    if (dbResults.length > 0) {
      const [first, ...rest] = dbResults;
      const mainResult = buildResult({ ...first, encontrado: true, confianca: 100 }, (first as { id?: string }).id || randomUUID(), "text");
      const relatedResults = rest.slice(0, 4).map((r) => buildResult({ ...r, encontrado: true, confianca: 90 }, (r as { id?: string }).id || randomUUID(), "text"));
      res.json({ mainResult, relatedResults, source: "colecao" }); return;
    }

    const geminiResult = await searchByText(query, fandomCtx.text || undefined) as ComicResultData;

    const mainId = randomUUID();
    const mainResult = buildResult(geminiResult, mainId, "text", []);
    const relatedResults = (geminiResult.relatedResults || []).map((r) => buildResult(r, randomUUID(), "text"));
    const response = { mainResult, relatedResults, source: "gemini" };
    await saveToSupabase(mainResult, query, response);
    res.json(response);
  } catch (err: unknown) {
    res.status(500).json({ error: "search_error", message: err instanceof Error ? err.message : "Erro na busca" });
  }
});

router.post("/character-search", async (req: Request, res: Response) => {
  try {
    const { character } = req.body as { character?: string };
    if (!character || typeof character !== "string" || character.trim().length === 0) {
      res.status(400).json({ error: "invalid_input", message: "Forneça o nome de um personagem" }); return;
    }

    const [dbResults, fandomCtx] = await Promise.all([
      searchCollectionByCharacter(character.trim()),
      fetchFandomContext(character, "character"),
    ]);

    if (dbResults.length > 0) {
      const [first, ...rest] = dbResults;
      const mainResult = buildResult({ ...first, encontrado: true, confianca: 100 }, (first as { id?: string }).id || randomUUID(), "character");
      const relatedResults = rest.slice(0, 4).map((r) => buildResult({ ...r, encontrado: true, confianca: 90 }, (r as { id?: string }).id || randomUUID(), "character"));
      res.json({ mainResult, relatedResults, source: "colecao" }); return;
    }

    const geminiResult = await searchByCharacter(character, fandomCtx.text || undefined) as ComicResultData;

    const mainId = randomUUID();
    const mainResult = buildResult(geminiResult, mainId, "character", []);
    const relatedResults = (geminiResult.relatedResults || []).map((r) => buildResult(r, randomUUID(), "character"));
    const response = { mainResult, relatedResults, source: "gemini" };
    await saveToSupabase(mainResult, character, response);
    res.json(response);
  } catch (err: unknown) {
    res.status(500).json({ error: "character_search_error", message: err instanceof Error ? err.message : "Erro na busca por personagem" });
  }
});

router.post("/quote-search", async (req: Request, res: Response) => {
  try {
    const { quote } = req.body as { quote?: string };
    if (!quote || typeof quote !== "string" || quote.trim().length === 0) {
      res.status(400).json({ error: "invalid_input", message: "Forneça uma fala para buscar" }); return;
    }

    const [dbResults, fandomCtx] = await Promise.all([
      searchCollection([quote.trim()]),
      fetchFandomContext(quote),
    ]);

    if (dbResults.length > 0) {
      const [first, ...rest] = dbResults;
      const mainResult = buildResult({ ...first, encontrado: true, confianca: 100, balloon_text: quote }, (first as { id?: string }).id || randomUUID(), "quote");
      const relatedResults = rest.slice(0, 4).map((r) => buildResult({ ...r, encontrado: true, confianca: 90 }, (r as { id?: string }).id || randomUUID(), "quote"));
      res.json({ mainResult, relatedResults, source: "colecao" }); return;
    }

    const geminiResult = await searchByText(`história com a fala: "${quote}"`, fandomCtx.text || undefined) as ComicResultData;

    const mainId = randomUUID();
    const mainResult = buildResult(geminiResult, mainId, "quote", []);
    const relatedResults = (geminiResult.relatedResults || []).map((r) => buildResult(r, randomUUID(), "quote"));
    const response = { mainResult, relatedResults, source: "gemini" };
    await saveToSupabase(mainResult, quote, response);
    res.json(response);
  } catch (err: unknown) {
    res.status(500).json({ error: "quote_search_error", message: err instanceof Error ? err.message : "Erro na busca por fala" });
  }
});

// ============================================================
// HISTORY / RANKING / RESULT / FEEDBACK
// ============================================================

router.delete("/history/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  try {
    const { id } = req.params;
    const { error } = await supabase.from("search_history").delete().eq("id", id);
    if (error) { res.status(500).json({ error: "db_error", message: error.message }); return; }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "delete_error", message: err instanceof Error ? err.message : "Erro" });
  }
});

router.get("/history", async (req: Request, res: Response) => {
  const { titulo, editora, limit = "50", offset = "0" } = req.query as Record<string, string>;
  if (!supabase) { res.json({ items: [], total: 0 }); return; }
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
    if (error) { console.error("History error:", JSON.stringify(error)); res.json({ items: [], total: 0 }); return; }
    const items = (data || []).map((row: Record<string, unknown>) => {
      const feedback = (row.result_feedback as { is_correct: boolean }[]) || [];
      return { ...row, feedback_count: feedback.length, correct_count: feedback.filter((f) => f.is_correct).length, result_feedback: undefined };
    });
    res.json({ items, total: count || 0 });
  } catch (err) { console.error("History exception:", err); res.json({ items: [], total: 0 }); }
});

router.get("/ranking", async (req: Request, res: Response) => {
  try {
    if (!supabase) { res.json({ items: [], week_start: new Date().toISOString() }); return; }
    const now = new Date();
    const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diff);
    weekStart.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from("search_history")
      .select("revista, titulo, editora, images, created_at")
      .gte("created_at", weekStart.toISOString())
      .not("revista", "is", null)
      .not("revista", "eq", "");
    if (error) { console.error("Ranking error:", JSON.stringify(error)); res.json({ items: [], week_start: weekStart.toISOString() }); return; }
    const counts = new Map<string, { revista: string; titulo: string; editora: string; images: string[]; search_count: number; last_searched: string }>();
    for (const row of data || []) {
      const key = `${row.revista}||${row.titulo}`;
      const ex = counts.get(key);
      if (ex) { ex.search_count++; if (row.created_at > ex.last_searched) ex.last_searched = row.created_at; }
      else counts.set(key, { revista: row.revista, titulo: row.titulo, editora: row.editora, images: row.images || [], search_count: 1, last_searched: row.created_at });
    }
    res.json({ items: Array.from(counts.values()).sort((a, b) => b.search_count - a.search_count).slice(0, 20), week_start: weekStart.toISOString() });
  } catch (err) { res.status(500).json({ error: "ranking_error", message: err instanceof Error ? err.message : "Erro" }); }
});

router.get("/result/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!supabase) { res.status(404).json({ error: "not_found", message: "Resultado não encontrado" }); return; }
    const { data: gibiData } = await supabase.from("gibis").select("*").eq("id", id).eq("status", "approved").single();
    if (gibiData) {
      res.json({ result: buildResult(gibiData as ComicResultData, gibiData.id as string, "colecao", gibiData.imagem_url ? [gibiData.imagem_url as string] : []), feedback: [] });
      return;
    }
    const { data: resultData, error } = await supabase.from("search_history").select("*").eq("id", id).single();
    if (error || !resultData) { res.status(404).json({ error: "not_found", message: "Resultado não encontrado" }); return; }
    const { data: feedbackData } = await supabase.from("result_feedback").select("*").eq("result_id", id).order("created_at", { ascending: false });
    res.json({ result: buildResult(resultData as ComicResultData, resultData.id as string, resultData.search_type as string, resultData.images as string[] || []), feedback: feedbackData || [] });
  } catch (err) { res.status(500).json({ error: "result_error", message: err instanceof Error ? err.message : "Erro" }); }
});

// ============================================================
// SUGGESTIONS (public submit, admin read)
// ============================================================

router.post("/suggestion", async (req: Request, res: Response) => {
  const { type, message, nome, email } = req.body as { type?: string; message?: string; nome?: string; email?: string };
  if (!message || typeof message !== "string" || message.trim().length < 5) {
    res.status(400).json({ error: "invalid_input", message: "Mensagem muito curta" }); return;
  }
  if (!supabase) { res.json({ success: true }); return; }
  try {
    const { error } = await supabase.from("suggestions").insert({
      type: type === "bug" ? "bug" : "sugestao",
      message: message.trim(),
      nome: nome?.trim() || null,
      email: email?.trim() || null,
      status: "novo",
    });
    if (error) { console.error("Suggestion insert error:", JSON.stringify(error)); res.status(500).json({ error: "db_error", message: error.message }); return; }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "insert_error", message: err instanceof Error ? err.message : "Erro ao salvar" });
  }
});

router.get("/admin/suggestions", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.json({ items: [], total: 0 }); return; }
  try {
    const { status } = req.query as { status?: string };
    let query = supabase.from("suggestions").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data, count, error } = await query;
    if (error) { console.error("Suggestions list error:", JSON.stringify(error)); res.json({ items: [], total: 0 }); return; }
    res.json({ items: data || [], total: count || 0 });
  } catch (err) { console.error("Suggestions list exception:", err); res.json({ items: [], total: 0 }); }
});

router.put("/admin/suggestions/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  try {
    const { id } = req.params;
    const { status } = req.body as { status: string };
    if (!["novo", "visto", "arquivado"].includes(status)) {
      res.status(400).json({ error: "invalid_status" }); return;
    }
    const { error } = await supabase.from("suggestions").update({ status }).eq("id", id);
    if (error) { res.status(500).json({ error: "db_error", message: error.message }); return; }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "update_error", message: err instanceof Error ? err.message : "Erro" });
  }
});

router.delete("/admin/suggestions/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  try {
    const { id } = req.params;
    const { error } = await supabase.from("suggestions").delete().eq("id", id);
    if (error) { res.status(500).json({ error: "db_error", message: error.message }); return; }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "delete_error", message: err instanceof Error ? err.message : "Erro" });
  }
});

router.post("/feedback", async (req: Request, res: Response) => {
  const { result_id, is_correct, correction_text } = req.body as { result_id?: string; is_correct?: boolean; correction_text?: string };
  if (!result_id || typeof is_correct !== "boolean") { res.status(400).json({ error: "invalid_input", message: "Dados inválidos" }); return; }
  const feedbackId = randomUUID();
  if (!supabase) { res.json({ success: true, id: feedbackId }); return; }
  try {
    const { error } = await supabase.from("result_feedback").insert({ id: feedbackId, result_id, is_correct, correction_text: correction_text || null });
    if (error) console.error("Feedback error:", JSON.stringify(error));
    res.json({ success: true, id: feedbackId });
  } catch { res.json({ success: true, id: feedbackId }); }
});

export default router;
