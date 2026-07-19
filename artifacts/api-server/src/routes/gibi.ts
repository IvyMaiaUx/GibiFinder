import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { identifyFromImages, searchByText, searchByCharacter } from "../lib/gemini";
import { fetchFandomContext } from "../lib/fandom";
import { supabase } from "../lib/supabase";
import { nextDriveKey } from "../lib/driveKeys";
import { listOverrides, upsertOverride, deleteOverride } from "../lib/catalogOverrides";
import { randomUUID, createHash } from "crypto";

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
  drive_url?: string;
  relatedResults?: ComicResultData[];
}

const driveLibraryItems: (ComicResultData & { id: string; numero?: string; imagem_url?: string; status?: string })[] = [
  ["DC All In Especial #01 (2024)", "DC All In Especial", "2024", "01", "1OGaL4MLX0gqbK8q70AvgklV232G5Cdsy"],
  ["Batman Absoluto #1 (2024)", "Batman Absoluto", "2024", "1", "1OOxWMYv8sovWuOsC-hljvVaI4PZGiBmH"],
  ["Batman Absoluto #2 (2024)", "Batman Absoluto", "2024", "2", "1jaAd2TB8QMUUpjhiQkskuWxc6m6UJm3S"],
  ["Batman Absoluto #3 (2024)", "Batman Absoluto", "2024", "3", "1x5nEoVnh0hon-wtwH4Bbi-qV5DmEJdQr"],
  ["Batman Absoluto #4 (2024)", "Batman Absoluto", "2024", "4", "14YJ5S5cNH8JebMDeZmUuLj1YXwGgsOtj"],
  ["Batman Absoluto #5 (2025)", "Batman Absoluto", "2025", "5", "1EO7gxw3_fmvwQH4sj0ca-_oSdtvQuFJi"],
  ["Batman Absoluto #6 (2025)", "Batman Absoluto", "2025", "6", "1VzU1DBBkuYBSa6bcjIEuySCRgk94lU_e"],
  ["Mulher Maravilha Absoluta #1 (2024)", "Mulher Maravilha Absoluta", "2024", "1", "1anvKEV_7wDCUftzzAXOoclKtiTr0wl6J"],
  ["Mulher Maravilha Absoluta #2 (2024)", "Mulher Maravilha Absoluta", "2024", "2", "1pIAtrJAz-1hHXjZIsMhR-6v3zLrP4yt7"],
  ["Mulher Maravilha Absoluta #3 (2024)", "Mulher Maravilha Absoluta", "2024", "3", "1zI_D19uQXfw1qraY4tpPbXsGXFvckH25"],
  ["Mulher Maravilha Absoluta #4 (2024)", "Mulher Maravilha Absoluta", "2024", "4", "17GgZEkmRjotSnjloFRxqNgKnb7yTw4A9"],
  ["Mulher Maravilha Absoluta #5 (2024)", "Mulher Maravilha Absoluta", "2024", "5", "1LYWG7v3EgNE22FqQ_wuu2bT5JDus0Bxu"],
  ["Mulher Maravilha Absoluta #6 (2024)", "Mulher Maravilha Absoluta", "2024", "6", "1Z51TDTJPEbfVQiayqsBRpItaAKxwkfQv"],
  ["Superman Absoluto #1 (2024)", "Superman Absoluto", "2024", "1", "1eiwTpb70Y1Wc_uaKuoakUbF2qptUiXnx"],
  ["Superman Absoluto #2 (2024)", "Superman Absoluto", "2024", "2", "1st34J89isVR-yPIGBR90hFht_Psegfas"],
  ["Superman Absoluto #3 (2024)", "Superman Absoluto", "2024", "3", "12ExMeF7J6C6fbDW1xGPb46Tk0VSsWiKL"],
  ["Superman Absoluto #4 (2024)", "Superman Absoluto", "2024", "4", "1EdWIwKEir_RZhwpNQpXhLBFzG5ziQu4o"],
  ["Flash Absoluto #1 (2025)", "Flash Absoluto", "2025", "1", "1W22MUOphauFEbhFyM5VWvQDd-luGZa3J"]
].map(([titulo, revista, ano, numero, fileId]) => ({
  id: `drive-${fileId}`,
  encontrado: true,
  titulo,
  revista,
  editora: "DC Comics",
  ano,
  numero,
  personagens: [],
  descricao: "Importado da biblioteca Google Drive informada.",
  imagem_url: `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`,
  drive_url: `https://drive.google.com/file/d/${fileId}/view`,
  status: "approved"
}));

function searchDriveLibrary(terms: string[]): ComicResultData[] {
  const normalizedTerms = terms.map(term => term.toLowerCase()).filter(Boolean);
  if (normalizedTerms.length === 0) return driveLibraryItems;
  return driveLibraryItems.filter(item => {
    const haystack = [item.titulo, item.revista, item.editora, item.ano, item.numero, item.descricao]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return normalizedTerms.every(term => haystack.includes(term));
  });
}

function normalizeCollectionText(value = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function rankCollectionResults(terms: string[], results: ComicResultData[]) {
  const normalizedTerms = terms.map(normalizeCollectionText).filter(Boolean);
  const wordTerms = normalizedTerms.filter(term => !/^\d+$/.test(term));
  const issueTerm = normalizedTerms.find(term => /^\d+$/.test(term));
  return results
    .map(result => {
      const text = normalizeCollectionText([result.titulo, result.revista, result.editora, result.ano, result.descricao].filter(Boolean).join(" "));
      const resultIssue = String((result as ComicResultData & { numero?: string }).numero || result.titulo?.match(/#\s*([0-9]+)/)?.[1] || "");
      const wordsMatch = wordTerms.every(term => text.includes(term));
      const issueMatches = !issueTerm || resultIssue === issueTerm || new RegExp(`#\\s*${issueTerm}\\b`).test(text);
      let score = 0;
      if (wordsMatch) score += 100;
      if (issueMatches) score += 50;
      score += wordTerms.filter(term => text.includes(term)).length * 5;
      return { result, wordsMatch, issueMatches, score };
    })
    .filter(item => item.wordsMatch && item.issueMatches)
    .sort((a, b) => b.score - a.score)
    .map(item => item.result);
}

function buildResult(data: ComicResultData, id: string, searchType: string, images: string[] = []) {
  // Always include cover images if available
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
    drive_url: data.drive_url || null,
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
    logger.error({ err: err }, "Supabase save error:");
  }
}

async function searchCollection(terms: string[]): Promise<ComicResultData[]> {
  const driveMatches = rankCollectionResults(terms, searchDriveLibrary(terms));
  if (!supabase) return driveMatches;
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
    if (error) { logger.error({ err: error }, "Collection search error:"); return driveMatches; }
    const dbResults = rankCollectionResults(terms, data || []);
    const driveOnly = driveMatches.filter(item => !dbResults.some(db => db.drive_url && db.drive_url === item.drive_url));
    return [...dbResults, ...driveOnly].slice(0, 20);
  } catch { return driveMatches; }
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
  const { q, editora, limit = "100", offset = "0" } = req.query as Record<string, string>;
  const terms = q ? q.split(/\s+/).map(term => term.replace(/[%(),]/g, "").trim()).filter(Boolean) : [];
  const requestedLimit = parseInt(limit);
  const requestedOffset = parseInt(offset);
  const staticItems = searchDriveLibrary(terms)
    .filter(item => !editora || item.editora?.toLowerCase().includes(editora.toLowerCase()));
  if (!supabase) {
    const start = requestedOffset;
    const end = start + requestedLimit;
    res.json({ items: staticItems.slice(start, end), total: staticItems.length });
    return;
  }
  try {
    let query = supabase
      .from("gibis")
      .select("*", { count: "exact" })
      .eq("status", "approved")
      .order("revista", { ascending: true })
      .order("titulo", { ascending: true })
      .limit(terms.length > 0 ? 200 : requestedLimit);

    if (terms.length > 0) {
      query = query.or(
        terms.flatMap(term => [
          `titulo.ilike.%${term}%`,
          `revista.ilike.%${term}%`,
          `editora.ilike.%${term}%`,
          `descricao.ilike.%${term}%`
        ]).join(",")
      );
    } else {
      query = query.range(requestedOffset, requestedOffset + requestedLimit - 1);
    }
    if (editora) query = query.ilike("editora", `%${editora}%`);

    const { data, count, error } = await query;
    if (error) {
      logger.error({ err: JSON.stringify(error) }, "Colecao list error:");
      res.json({ items: staticItems, total: staticItems.length });
      return;
    }
    let dbItems = data || [];
    let total = count || 0;
    if (terms.length > 0) {
      dbItems = rankCollectionResults(terms, dbItems);
      total = dbItems.length;
      dbItems = dbItems.slice(requestedOffset, requestedOffset + requestedLimit);
    }
    const driveOnly = staticItems.filter(item => !dbItems.some(db => db.drive_url && db.drive_url === item.drive_url));
    res.json({ items: [...dbItems, ...driveOnly], total: total + driveOnly.length });
  } catch (err) { logger.error({ err: err }, "Colecao list exception:"); res.json({ items: staticItems, total: staticItems.length }); }
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

    if (error) { logger.error({ err: error }, "Colecao insert error:"); req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
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
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
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
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
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
    if (error) { logger.error({ err: error }, "Admin pending error:"); res.json({ items: [], total: 0 }); return; }
    res.json({ items: data || [], total: count || 0 });
  } catch (err) { logger.error({ err: err }, "Admin pending exception:"); res.json({ items: [], total: 0 }); }
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
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
    res.json({ item: data, status });
  } catch (err) {
    res.status(500).json({ error: "review_error", message: err instanceof Error ? err.message : "Erro ao revisar" });
  }
});

// GET /api/admin/verify — check if admin key is valid
router.get("/admin/verify", (req: Request, res: Response) => {
  res.json({ valid: isAdmin(req) });
});

// ---- Catalog overrides (admin curation of live catalog/provider items) ----
// GET /api/admin/catalog-overrides — list all overrides
router.get("/admin/catalog-overrides", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json(await listOverrides());
  } catch (err) {
    res.status(500).json({ error: "list_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// PUT /api/admin/catalog-overrides — upsert one override
//   body: { providerId, itemId, hidden?, coverUrl?, description?, title? }
router.put("/admin/catalog-overrides", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const { providerId, itemId, hidden, coverUrl, description, title } = req.body || {};
  if (!providerId || !itemId) {
    res.status(400).json({ error: "missing_params", message: "providerId e itemId são obrigatórios" });
    return;
  }
  try {
    await upsertOverride({
      providerId: String(providerId),
      itemId: String(itemId),
      hidden: !!hidden,
      coverUrl: typeof coverUrl === "string" ? coverUrl.trim() || null : null,
      description: typeof description === "string" ? description.trim() || null : null,
      title: typeof title === "string" ? title.trim() || null : null,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "save_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/admin/catalog-overrides/:id — remove an override (id = providerId:itemId)
router.delete("/admin/catalog-overrides/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    await deleteOverride(String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "delete_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/admin/test-drive — test Drive API key connectivity
router.get("/admin/test-drive", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const driveApiKey = nextDriveKey();
  if (!driveApiKey) { res.json({ ok: false, error: "GOOGLE_DRIVE_API_KEY não configurada" }); return; }
  try {
    // Use a known public Google sample folder
    const testUrl = `https://www.googleapis.com/drive/v3/files?q=trashed%3Dfalse&key=${driveApiKey}&pageSize=1&fields=files(id,name)`;
    const r = await fetch(testUrl);
    const text = await r.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    res.json({ ok: r.ok, status: r.status, body: parsed, keyPrefix: driveApiKey.slice(0, 8) + "..." });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/admin/import-drive — bulk import from Google Drive folder
// POST /api/admin/import-drive-library - recursive Drive import for PDF/CBR/CBZ libraries
router.post("/admin/import-drive-library", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.status(503).json({ error: "db_unavailable", message: "Banco nao configurado" }); return; }

  const driveApiKey = nextDriveKey();
  if (!driveApiKey) {
    res.status(503).json({ error: "no_drive_key", message: "GOOGLE_DRIVE_API_KEY nao configurada no servidor" });
    return;
  }

  type DriveFile = { id: string; name: string; mimeType: string; path: string };
  const folderMime = "application/vnd.google-apps.folder";
  const supportedFile = (file: Pick<DriveFile, "name" | "mimeType">) =>
    /\.(?:pdf|cbr|cbz)$/i.test(file.name) ||
    ["application/pdf", "application/x-rar", "application/rar", "application/vnd.rar", "application/zip", "application/x-cbz"].includes(file.mimeType);
  const parseFileName = (file: DriveFile): ComicResultData & { numero?: string } => {
    const withoutExt = file.name.replace(/\.(?:pdf|cbr|cbz)$/i, "").trim();
    const withoutCredits = withoutExt.replace(/\s*\((?!\d{4}\))[^)]*\)\s*$/g, "").trim();
    const issue = withoutCredits.match(/#\s*([0-9]+(?:[.,][0-9]+)?)/)?.[1] || "";
    const year = withoutCredits.match(/\((20\d{2}|19\d{2})\)/)?.[1] || "";
    const series = withoutCredits.replace(/#\s*[0-9]+(?:[.,][0-9]+)?.*$/i, "").trim() || withoutCredits;
    const lowerPath = file.path.toLowerCase();
    return {
      titulo: withoutCredits,
      revista: series,
      editora: /dc|batman|superman|mulher maravilha|flash|absolute|absolut/.test(lowerPath) ? "DC Comics" : "",
      ano: year,
      personagens: [],
      descricao: `Importado do Google Drive: ${file.path}`,
      nota: `Arquivo ${file.name}`,
      numero: issue
    };
  };

  try {
    const { folderUrl, importStatus = "approved", maxFiles = 200 } = req.body as {
      folderUrl?: string;
      importStatus?: string;
      maxFiles?: number;
    };
    if (!folderUrl || typeof folderUrl !== "string") {
      res.status(400).json({ error: "invalid_input", message: "URL da pasta e obrigatoria" });
      return;
    }

    const folderIdMatch = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (!folderIdMatch) {
      res.status(400).json({ error: "invalid_url", message: "URL de pasta do Drive invalida" });
      return;
    }

    const driveList = async (parentId: string, parentPath: string): Promise<DriveFile[]> => {
      const found: DriveFile[] = [];
      let pageToken = "";
      do {
        const params = new URLSearchParams({
          q: `'${parentId}' in parents and trashed=false`,
          key: driveApiKey,
          fields: "nextPageToken,files(id,name,mimeType)",
          pageSize: "100",
          supportsAllDrives: "true",
          includeItemsFromAllDrives: "true"
        });
        if (pageToken) params.set("pageToken", pageToken);
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
        if (!listRes.ok) {
          const errText = await listRes.text();
          let detail = "";
          try { detail = JSON.parse(errText)?.error?.message || errText; } catch { detail = errText; }
          throw new Error(`Drive API (${listRes.status}): ${detail}`);
        }
        const listData = await listRes.json() as { nextPageToken?: string; files?: { id: string; name: string; mimeType: string }[] };
        for (const file of listData.files || []) {
          const path = parentPath ? `${parentPath} / ${file.name}` : file.name;
          if (file.mimeType === folderMime) {
            found.push(...await driveList(file.id, path));
          } else if (supportedFile(file)) {
            found.push({ ...file, path });
          }
        }
        pageToken = listData.nextPageToken || "";
      } while (pageToken);
      return found;
    };

    const allFiles = await driveList(folderIdMatch[1], "");
    const limit = Number.isFinite(maxFiles) ? Math.max(1, Math.min(Number(maxFiles), 200)) : 200;
    const files = allFiles.slice(0, limit);
    const results: { file: string; titulo: string; status: string; id?: string; error?: string }[] = [];
    let imported = 0;
    let skipped = 0;

    for (const file of files) {
      const driveViewUrl = `https://drive.google.com/file/d/${file.id}/view`;
      const thumbnailUrl = `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`;
      const identified = parseFileName(file);
      const titulo = identified.titulo || file.name.replace(/\.(?:pdf|cbr|cbz)$/i, "");

      const existing = await supabase
        .from("gibis")
        .select("id")
        .eq("drive_url", driveViewUrl)
        .maybeSingle();
      if (existing.data?.id) {
        results.push({ file: file.path, titulo, status: "skipped", id: existing.data.id, error: "Ja importado" });
        skipped++;
        continue;
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("gibis")
        .insert({
          titulo,
          revista: identified.revista || null,
          editora: identified.editora || null,
          ano: identified.ano || null,
          numero: identified.numero || null,
          personagens: identified.personagens || [],
          descricao: identified.descricao || null,
          imagem_url: thumbnailUrl,
          drive_url: driveViewUrl,
          status: importStatus === "pending" ? "pending" : "approved",
          notas: identified.nota || null
        })
        .select()
        .single();

      if (insertErr) {
        results.push({ file: file.path, titulo, status: "error", error: insertErr.message });
        skipped++;
      } else {
        results.push({ file: file.path, titulo, status: "ok", id: (inserted as { id: string }).id });
        imported++;
      }
    }

    res.json({
      imported,
      skipped,
      totalFound: allFiles.length,
      processed: files.length,
      results,
      message: allFiles.length > files.length ? `Processados ${files.length} de ${allFiles.length} arquivos.` : undefined
    });
  } catch (err) {
    logger.error({ err: err }, "Import drive library error:");
    res.status(500).json({ error: "import_error", message: err instanceof Error ? err.message : "Erro na importacao" });
  }
});

router.post("/admin/import-google-sites-drive", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.status(503).json({ error: "db_unavailable", message: "Banco nao configurado" }); return; }

  const decodeHtml = (value: string) => value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  const cleanTitle = (fileName: string) => decodeHtml(fileName)
    .replace(/\.(?:pdf|cbr|cbz)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const parseEntry = (fileName: string) => {
    const title = cleanTitle(fileName);
    const year = title.match(/\((20\d{2}|19\d{2})\)/)?.[1] || "";
    const issue = title.match(/#\s*0*([0-9]+(?:[.,][0-9]+)?)/)?.[1] || "";
    const series = title
      .replace(/\s*\((20\d{2}|19\d{2})\)\s*/g, " ")
      .replace(/\s*#\s*0*[0-9]+(?:[.,][0-9]+)?.*$/i, "")
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || title;
    const lower = title.toLowerCase();
    const editora =
      /turma da m[oô]nica|monica|menino maluquinho/.test(lower) ? "Nacional" :
      /batman|superman|liga|justi[cç]a|dc/.test(lower) ? "DC Comics" :
      /homem aranha|vingadores|hulk|marvel/.test(lower) ? "Marvel" :
      "";
    return { title, series, year, issue, editora };
  };

  try {
    const { pageUrl, importStatus = "approved", maxFiles = 200 } = req.body as {
      pageUrl?: string;
      importStatus?: string;
      maxFiles?: number;
    };
    if (!pageUrl || typeof pageUrl !== "string") {
      res.status(400).json({ error: "invalid_input", message: "URL da pagina e obrigatoria" });
      return;
    }

    const parsedUrl = new URL(pageUrl);
    if (parsedUrl.hostname !== "sites.google.com") {
      res.status(400).json({ error: "invalid_url", message: "Use uma pagina do Google Sites" });
      return;
    }

    const pageRes = await fetch(pageUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 GibiFinder/1.0"
      }
    });
    if (!pageRes.ok) {
      res.status(502).json({ error: "page_fetch_error", message: `Pagina respondeu HTTP ${pageRes.status}` });
      return;
    }

    const html = await pageRes.text();
    const entries = new Map<string, { id: string; fileName: string }>();
    const embedRegex = /aria-label="Drive,\s*([^"]+\.(?:pdf|cbr|cbz))"[^>]+data-src="https:\/\/drive\.google\.com\/file\/d\/([^/"]+)\/preview"/gi;
    for (const match of html.matchAll(embedRegex)) {
      const fileName = decodeHtml(match[1]).trim();
      const id = match[2].trim();
      if (fileName && id && !entries.has(id)) entries.set(id, { id, fileName });
    }

    if (entries.size === 0) {
      const idRegex = /https:\/\/drive\.google\.com\/file\/d\/([^/"]+)\/preview/gi;
      for (const match of html.matchAll(idRegex)) {
        const id = match[1].trim();
        if (id && !entries.has(id)) entries.set(id, { id, fileName: `${id}.pdf` });
      }
    }

    const limit = Number.isFinite(maxFiles) ? Math.max(1, Math.min(Number(maxFiles), 200)) : 200;
    const files = Array.from(entries.values()).slice(0, limit);
    const results: { file: string; titulo: string; status: string; id?: string; error?: string }[] = [];
    let imported = 0;
    let skipped = 0;

    for (const file of files) {
      const driveViewUrl = `https://drive.google.com/file/d/${file.id}/view`;
      const thumbnailUrl = `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`;
      const identified = parseEntry(file.fileName);

      const existing = await supabase
        .from("gibis")
        .select("id")
        .eq("drive_url", driveViewUrl)
        .maybeSingle();
      if (existing.data?.id) {
        results.push({ file: file.fileName, titulo: identified.title, status: "skipped", id: existing.data.id, error: "Ja importado" });
        skipped++;
        continue;
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("gibis")
        .insert({
          titulo: identified.title,
          revista: identified.series || null,
          editora: identified.editora || null,
          ano: identified.year || null,
          numero: identified.issue || null,
          personagens: [],
          descricao: `Importado da Biblioteca Virtual de Quintana: ${pageUrl}`,
          imagem_url: thumbnailUrl,
          drive_url: driveViewUrl,
          status: importStatus === "pending" ? "pending" : "approved",
          notas: `Arquivo ${file.fileName}`
        })
        .select()
        .single();

      if (insertErr) {
        results.push({ file: file.fileName, titulo: identified.title, status: "error", error: insertErr.message });
        skipped++;
      } else {
        results.push({ file: file.fileName, titulo: identified.title, status: "ok", id: (inserted as { id: string }).id });
        imported++;
      }
    }

    res.json({
      imported,
      skipped,
      totalFound: entries.size,
      processed: files.length,
      results,
      message: entries.size > files.length ? `Processados ${files.length} de ${entries.size} arquivos.` : undefined
    });
  } catch (err) {
    logger.error({ err: err }, "Import Google Sites Drive error:");
    res.status(500).json({ error: "import_error", message: err instanceof Error ? err.message : "Erro na importacao" });
  }
});

router.post("/admin/import-drive", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.status(503).json({ error: "db_unavailable", message: "Banco não configurado" }); return; }

  const driveApiKey = nextDriveKey();
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
      logger.error({ err: listRes.status, errText }, "Drive API error:");
      let detail = "";
      try { detail = JSON.parse(errText)?.error?.message || errText; } catch { detail = errText; }
      res.status(502).json({ error: "drive_api_error", message: `Drive API (${listRes.status}): ${detail}` });
      return;
    }
    const listData = await listRes.json() as { files?: { id: string; name: string; mimeType: string }[] };
    const files = listData.files || [];

    if (files.length === 0) {
      res.json({ imported: 0, skipped: 0, results: [], message: "Nenhum PDF encontrado na pasta" });
      return;
    }

    const MAX_FILES = 5;
    const toProcess = files.slice(0, MAX_FILES);
    const results: { file: string; titulo: string; status: string; id?: string; error?: string }[] = [];
    let imported = 0;
    let skipped = 0;

    const { identifyFromCover } = await import("../lib/gemini");
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Step 1: fetch all thumbnails in parallel
    const thumbData = await Promise.all(toProcess.map(async (file) => {
      try {
        const thumbnailUrl = `https://drive.google.com/thumbnail?id=${file.id}&sz=w400`;
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 15000);
        try {
          const r = await fetch(thumbnailUrl, { signal: controller.signal });
          if (!r.ok) return { file, ok: false, error: "Thumbnail inacessível" };
          const buf = await r.arrayBuffer();
          const base64 = Buffer.from(buf).toString("base64");
          const mime = r.headers.get("content-type") || "image/jpeg";
          return { file, ok: true, dataUrl: `data:${mime};base64,${base64}` };
        } finally { clearTimeout(t); }
      } catch (err) {
        return { file, ok: false, error: err instanceof Error ? err.message : "Erro ao buscar thumbnail" };
      }
    }));

    // Step 2: call Gemini sequentially with retry on 429
    for (const thumb of thumbData) {
      if (!thumb.ok || !("dataUrl" in thumb)) {
        results.push({ file: thumb.file.name, titulo: "", status: "skipped", error: (thumb as { error?: string }).error });
        skipped++;
        continue;
      }

      const thumbnailUrl = `https://drive.google.com/thumbnail?id=${thumb.file.id}&sz=w400`;
      const driveViewUrl = `https://drive.google.com/file/d/${thumb.file.id}/view`;
      let identified: ComicResultData | null = null;
      let lastErr = "";

      try {
        identified = await (identifyFromCover as (img: string) => Promise<ComicResultData>)(thumb.dataUrl as string);
      } catch (err) {
        lastErr = err instanceof Error ? err.message : "Erro Gemini";
        if (lastErr.includes("429") || lastErr.toLowerCase().includes("quota")) {
          results.push({ file: thumb.file.name, titulo: "", status: "skipped", error: "Cota Gemini atingida — aguarde 1 minuto e importe de novo" });
          skipped++;
          continue;
        }
      }

      if (!identified) {
        results.push({ file: thumb.file.name, titulo: "", status: "error", error: lastErr || "Falha no Gemini" });
        skipped++;
        continue;
      }

      const titulo = identified.titulo || thumb.file.name.replace(/\.pdf$/i, "");
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
        results.push({ file: thumb.file.name, titulo, status: "error", error: insertErr.message });
        skipped++;
      } else {
        results.push({ file: thumb.file.name, titulo, status: "ok", id: (inserted as { id: string }).id });
        imported++;
      }

      // Small delay between Gemini calls to stay under free-tier rate limit
      await sleep(1500);
    }

    const message = files.length > MAX_FILES
      ? `Processados ${MAX_FILES} de ${files.length} arquivos (limite por importação).`
      : undefined;

    res.json({ imported, skipped, results, message });
  } catch (err) {
    logger.error({ err: err }, "Import drive error:");
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
    const terms = query.trim().split(/\s+/).filter(t => t.length > 2 || /^\d+$/.test(t));

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
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
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
    if (error) { logger.error({ err: error }, "History error:"); res.json({ items: [], total: 0 }); return; }
    const items = (data || []).map((row: Record<string, unknown>) => {
      const feedback = (row.result_feedback as { is_correct: boolean }[]) || [];
      return { ...row, feedback_count: feedback.length, correct_count: feedback.filter((f) => f.is_correct).length, result_feedback: undefined };
    });
    res.json({ items, total: count || 0 });
  } catch (err) { logger.error({ err: err }, "History exception:"); res.json({ items: [], total: 0 }); }
});

router.get("/ranking", async (_req: Request, res: Response) => {
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
    if (error) { logger.error({ err: error }, "Ranking error:"); res.json({ items: [], week_start: weekStart.toISOString() }); return; }
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
    if (error) { logger.error({ err: error }, "Suggestion insert error:"); req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "insert_error", message: err instanceof Error ? err.message : "Erro ao salvar" });
  }
});

router.get("/admin/ranking", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.json({ items: [], total: 0 }); return; }
  try {
    const { data, error } = await supabase
      .from("search_history")
      .select("revista, titulo, editora, created_at")
      .not("revista", "is", null)
      .not("revista", "eq", "")
      .order("created_at", { ascending: false });
    if (error) { res.json({ items: [], total: 0 }); return; }
    const counts = new Map<string, { revista: string; titulo: string; editora: string; search_count: number; last_searched: string }>();
    for (const row of data || []) {
      const key = `${row.revista}||${row.titulo}`;
      const ex = counts.get(key);
      if (ex) { ex.search_count++; if (row.created_at > ex.last_searched) ex.last_searched = row.created_at; }
      else counts.set(key, { revista: row.revista, titulo: row.titulo, editora: row.editora, search_count: 1, last_searched: row.created_at });
    }
    const items = Array.from(counts.values()).sort((a, b) => b.search_count - a.search_count);
    res.json({ items, total: items.length });
  } catch (err) { res.status(500).json({ error: "ranking_admin_error", message: err instanceof Error ? err.message : "Erro" }); }
});

router.delete("/admin/ranking/entry", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  try {
    const { revista, titulo } = req.body as { revista?: string; titulo?: string };
    if (!revista || !titulo) { res.status(400).json({ error: "invalid_input", message: "revista e titulo obrigatórios" }); return; }
    const { error } = await supabase.from("search_history").delete().eq("revista", revista).eq("titulo", titulo);
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "delete_error", message: err instanceof Error ? err.message : "Erro" }); }
});

router.delete("/admin/ranking/all", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  try {
    const { error } = await supabase.from("search_history").delete().not("id", "is", null);
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "delete_error", message: err instanceof Error ? err.message : "Erro" }); }
});

router.get("/admin/suggestions", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.json({ items: [], total: 0 }); return; }
  try {
    const { status } = req.query as { status?: string };
    let query = supabase.from("suggestions").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data, count, error } = await query;
    if (error) { logger.error({ err: error }, "Suggestions list error:"); res.json({ items: [], total: 0 }); return; }
    res.json({ items: data || [], total: count || 0 });
  } catch (err) { logger.error({ err: err }, "Suggestions list exception:"); res.json({ items: [], total: 0 }); }
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
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
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
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
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
    if (error) logger.error({ err: error }, "Feedback error:");
    res.json({ success: true, id: feedbackId });
  } catch { res.json({ success: true, id: feedbackId }); }
});

// ── PDF Proxy ─────────────────────────────────────────────────────────────────
router.get("/pdf/:fileId", async (req: Request, res: Response) => {
  const { fileId } = req.params;
  const apiKey = nextDriveKey();
  if (!apiKey) { res.status(500).json({ error: "API key não configurada" }); return; }

  const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  try {
    const upstream = await fetch(driveUrl);
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Drive respondeu ${upstream.status}` });
      return;
    }
    const contentType = upstream.headers.get("content-type") || "application/pdf";
    const contentLength = upstream.headers.get("content-length");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=3600");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    logger.error({ err: err }, "PDF proxy error:");
    res.status(500).json({ error: "Falha ao buscar PDF" });
  }
});

// ── Authentication & User Sync Endpoints ─────────────────────────────────────

// POST /api/auth/register - register a new user
router.post("/auth/register", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const { username, password, email } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "bad_request", message: "Usuário e senha são obrigatórios" });
    return;
  }
  try {
    const password_hash = createHash("sha256").update(password).digest("hex");
    const { data, error } = await supabase
      .from("user_profiles")
      .insert({ username, password_hash, email: email || null })
      .select("id, username, email, created_at")
      .single();
    
    if (error) {
      if (error.code === "23505") {
        res.status(409).json({ error: "username_taken", message: "Este nome de usuário já está em uso" });
      } else {
        req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" });
      }
      return;
    }
    res.json({ success: true, user: data });
  } catch (err) {
    res.status(500).json({ error: "server_error", message: err instanceof Error ? err.message : "Erro desconhecido" });
  }
});

// POST /api/auth/login - login an existing user
router.post("/auth/login", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "bad_request", message: "Usuário e senha são obrigatórios" });
    return;
  }
  try {
    const password_hash = createHash("sha256").update(password).digest("hex");
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, username, email, created_at, password_hash")
      .eq("username", username)
      .single();
    
    if (error || !data || data.password_hash !== password_hash) {
      res.status(401).json({ error: "invalid_credentials", message: "Usuário ou senha incorretos" });
      return;
    }
    
    const { password_hash: _, ...user } = data;
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: "server_error" });
  }
});

// GET /api/auth/favorites - get synced user favorites
router.get("/auth/favorites", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: "missing_userId" }); return; }
  try {
    const { data, error } = await supabase
      .from("user_favorites")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    
    if (error) { res.status(500).json({ error: "db_error" }); return; }
    
    const mapped = data.map(f => ({
      providerId: f.provider_id,
      mangaId: f.manga_id,
      title: f.title,
      coverUrl: f.cover_url,
      description: f.description,
      timestamp: Number(f.timestamp)
    }));
    res.json(mapped);
  } catch (err) { req.log.error({ err }, "handler failed"); res.status(500).json({ error: "server_error" }); }
});

// POST /api/auth/favorites/sync - sync favorites to database
router.post("/auth/favorites/sync", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const { userId, favorites } = req.body;
  if (!userId || !Array.isArray(favorites)) { res.status(400).json({ error: "bad_request" }); return; }
  try {
    await supabase.from("user_favorites").delete().eq("user_id", userId);
    
    if (favorites.length > 0) {
      const rows = favorites.map((f: any) => ({
        user_id: userId,
        provider_id: f.providerId,
        manga_id: f.mangaId,
        title: f.title,
        cover_url: f.coverUrl || null,
        description: f.description || null,
        timestamp: f.timestamp || Date.now()
      }));
      await supabase.from("user_favorites").insert(rows);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "server_error" });
  }
});

// GET /api/auth/history/search - get synced search history
router.get("/auth/history/search", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: "missing_userId" }); return; }
  try {
    const { data, error } = await supabase
      .from("user_search_history")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
    res.json((data || []).map((item: any) => ({
      id: item.item_id,
      titulo: item.titulo || "",
      revista: item.revista || "",
      editora: item.editora || "",
      ano: item.ano || "",
      images: item.images || [],
      search_type: item.search_type || "text",
      created_at: item.created_at
    })));
  } catch (err) { req.log.error({ err }, "handler failed"); res.status(500).json({ error: "server_error" }); }
});

// POST /api/auth/history/search/upsert - save one search history item
router.post("/auth/history/search/upsert", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const { userId, item } = req.body;
  if (!userId || !item?.id) { res.status(400).json({ error: "bad_request" }); return; }
  try {
    await supabase.from("user_search_history").delete().eq("user_id", userId).eq("item_id", item.id);
    const { error } = await supabase.from("user_search_history").insert({
      user_id: userId,
      item_id: item.id,
      titulo: item.titulo || "",
      revista: item.revista || "",
      editora: item.editora || "",
      ano: item.ano || "",
      images: item.images || [],
      search_type: item.search_type || "text",
      created_at: item.created_at || new Date().toISOString()
    });
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
    res.json({ success: true });
  } catch (err) { req.log.error({ err }, "handler failed"); res.status(500).json({ error: "server_error" }); }
});

// POST /api/auth/history/search/sync - merge local and server search history
router.post("/auth/history/search/sync", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const { userId, items } = req.body;
  if (!userId || !Array.isArray(items)) { res.status(400).json({ error: "bad_request" }); return; }
  try {
    const { data: existing } = await supabase.from("user_search_history").select("*").eq("user_id", userId);
    const merged = new Map<string, any>();
    for (const item of existing || []) {
      merged.set(item.item_id, {
        id: item.item_id,
        titulo: item.titulo || "",
        revista: item.revista || "",
        editora: item.editora || "",
        ano: item.ano || "",
        images: item.images || [],
        search_type: item.search_type || "text",
        created_at: item.created_at
      });
    }
    for (const item of items) {
      if (item?.id) merged.set(item.id, item);
    }
    const mergedItems = Array.from(merged.values())
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 50);
    await supabase.from("user_search_history").delete().eq("user_id", userId);
    if (mergedItems.length > 0) {
      const rows = mergedItems.map((item: any) => ({
        user_id: userId,
        item_id: item.id,
        titulo: item.titulo || "",
        revista: item.revista || "",
        editora: item.editora || "",
        ano: item.ano || "",
        images: item.images || [],
        search_type: item.search_type || "text",
        created_at: item.created_at || new Date().toISOString()
      }));
      await supabase.from("user_search_history").insert(rows);
    }
    res.json({ success: true });
  } catch (err) { req.log.error({ err }, "handler failed"); res.status(500).json({ error: "server_error" }); }
});

router.delete("/auth/history/search/:itemId", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: "missing_userId" }); return; }
  const { error } = await supabase.from("user_search_history").delete().eq("user_id", userId).eq("item_id", req.params.itemId);
  if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
  res.json({ success: true });
});

router.delete("/auth/history/search", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: "missing_userId" }); return; }
  const { error } = await supabase.from("user_search_history").delete().eq("user_id", userId);
  if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
  res.json({ success: true });
});

// GET /api/auth/history/reading - get synced reading history
router.get("/auth/history/reading", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: "missing_userId" }); return; }
  try {
    const { data, error } = await supabase
      .from("user_reading_history")
      .select("*")
      .eq("user_id", userId)
      .order("timestamp", { ascending: false })
      .limit(100);
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
    res.json((data || []).map((item: any) => ({
      id: item.item_id,
      title: item.title,
      coverUrl: item.cover_url || undefined,
      chapterId: item.chapter_id,
      chapterNum: item.chapter_num || "",
      chapterTitle: item.chapter_title || undefined,
      providerId: item.provider_id,
      mangaId: item.manga_id,
      language: item.language || undefined,
      pageNumber: Number(item.page_number || 1),
      timestamp: Number(item.timestamp)
    })));
  } catch (err) { req.log.error({ err }, "handler failed"); res.status(500).json({ error: "server_error" }); }
});

// POST /api/auth/history/reading/upsert - save one reading history/progress item
router.post("/auth/history/reading/upsert", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const { userId, progressKey, progress, historyItem } = req.body;
  if (!userId || !progressKey || !progress || !historyItem?.id) { res.status(400).json({ error: "bad_request" }); return; }
  try {
    await supabase.from("user_reading_progress").delete().eq("user_id", userId).eq("progress_key", progressKey);
    await supabase.from("user_reading_progress").insert({
      user_id: userId,
      progress_key: progressKey,
      chapter_id: progress.chapterId,
      chapter_num: progress.chapterNum || "",
      page_number: progress.pageNumber || 1,
      title: progress.title,
      cover_url: progress.coverUrl || null,
      provider_id: progress.providerId || null,
      manga_id: progress.mangaId || null,
      language: progress.language || null,
      updated_at: progress.updatedAt || new Date().toISOString()
    });

    await supabase.from("user_reading_history").delete().eq("user_id", userId).eq("item_id", historyItem.id);
    const { error } = await supabase.from("user_reading_history").insert({
      user_id: userId,
      item_id: historyItem.id,
      title: historyItem.title,
      cover_url: historyItem.coverUrl || null,
      chapter_id: historyItem.chapterId,
      chapter_num: historyItem.chapterNum || "",
      chapter_title: historyItem.chapterTitle || null,
      provider_id: historyItem.providerId,
      manga_id: historyItem.mangaId || null,
      language: historyItem.language || null,
      page_number: historyItem.pageNumber || 1,
      timestamp: historyItem.timestamp || Date.now()
    });
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
    res.json({ success: true });
  } catch (err) { req.log.error({ err }, "handler failed"); res.status(500).json({ error: "server_error" }); }
});

// POST /api/auth/history/reading/sync - merge local and server reading history/progress
router.post("/auth/history/reading/sync", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const { userId, history, progress } = req.body;
  if (!userId || !Array.isArray(history)) { res.status(400).json({ error: "bad_request" }); return; }
  try {
    const { data: existingHistory } = await supabase.from("user_reading_history").select("*").eq("user_id", userId);
    const merged = new Map<string, any>();
    for (const item of existingHistory || []) {
      merged.set(item.item_id, {
        id: item.item_id,
        title: item.title,
        coverUrl: item.cover_url || undefined,
        chapterId: item.chapter_id,
        chapterNum: item.chapter_num || "",
        chapterTitle: item.chapter_title || undefined,
        providerId: item.provider_id,
        mangaId: item.manga_id,
        language: item.language || undefined,
        pageNumber: Number(item.page_number || 1),
        timestamp: Number(item.timestamp)
      });
    }
    for (const item of history) {
      if (item?.id) merged.set(item.id, item);
    }
    const mergedHistory = Array.from(merged.values()).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0, 100);
    await supabase.from("user_reading_history").delete().eq("user_id", userId);
    if (mergedHistory.length > 0) {
      await supabase.from("user_reading_history").insert(mergedHistory.map((item: any) => ({
        user_id: userId,
        item_id: item.id,
        title: item.title,
        cover_url: item.coverUrl || null,
        chapter_id: item.chapterId,
        chapter_num: item.chapterNum || "",
        chapter_title: item.chapterTitle || null,
        provider_id: item.providerId,
        manga_id: item.mangaId || null,
        language: item.language || null,
        page_number: item.pageNumber || 1,
        timestamp: item.timestamp || Date.now()
      })));
    }

    if (progress && typeof progress === "object") {
      await supabase.from("user_reading_progress").delete().eq("user_id", userId);
      const rows = Object.entries(progress).map(([key, item]: [string, any]) => ({
        user_id: userId,
        progress_key: key,
        chapter_id: item.chapterId,
        chapter_num: item.chapterNum || "",
        page_number: item.pageNumber || 1,
        title: item.title,
        cover_url: item.coverUrl || null,
        provider_id: item.providerId || null,
        manga_id: item.mangaId || null,
        language: item.language || null,
        updated_at: item.updatedAt || new Date().toISOString()
      })).filter(row => row.chapter_id && row.title);
      if (rows.length > 0) await supabase.from("user_reading_progress").insert(rows);
    }

    res.json({ success: true });
  } catch (err) { req.log.error({ err }, "handler failed"); res.status(500).json({ error: "server_error" }); }
});

// DELETE /api/auth/history/reading/by-manga - remove all progress+history rows
// for one manga (so a deleted shelf item doesn't come back after sync).
router.delete("/auth/history/reading/by-manga", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const userId = req.query.userId as string;
  const providerId = req.query.providerId as string;
  const mangaId = req.query.mangaId as string;
  if (!userId || !providerId || !mangaId) { res.status(400).json({ error: "missing_params" }); return; }
  await supabase.from("user_reading_history").delete().eq("user_id", userId).eq("provider_id", providerId).eq("manga_id", mangaId);
  await supabase.from("user_reading_progress").delete().eq("user_id", userId).eq("provider_id", providerId).eq("manga_id", mangaId);
  res.json({ success: true });
});

router.delete("/auth/history/reading/:itemId", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: "missing_userId" }); return; }
  const { error } = await supabase.from("user_reading_history").delete().eq("user_id", userId).eq("item_id", req.params.itemId);
  if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
  res.json({ success: true });
});

router.delete("/auth/history/reading", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: "missing_userId" }); return; }
  const { error } = await supabase.from("user_reading_history").delete().eq("user_id", userId);
  if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
  res.json({ success: true });
});

// ── Completed ("Já Lidos") ──────────────────────────────────────────────────
// GET /api/auth/history/completed - get synced completed chapters
router.get("/auth/history/completed", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: "missing_userId" }); return; }
  try {
    const { data, error } = await supabase
      .from("user_completed")
      .select("*")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(200);
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
    res.json((data || []).map((item: any) => ({
      providerId: item.provider_id,
      mangaId: item.manga_id,
      title: item.title,
      coverUrl: item.cover_url || undefined,
      chapterId: item.chapter_id,
      chapterNum: item.chapter_num || "",
      completedAt: item.completed_at
    })));
  } catch (err) { req.log.error({ err }, "handler failed"); res.status(500).json({ error: "server_error" }); }
});

// POST /api/auth/history/completed/upsert - mark one chapter completed
router.post("/auth/history/completed/upsert", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const { userId, item } = req.body;
  if (!userId || !item?.mangaId || !item?.providerId || !item?.chapterId) { res.status(400).json({ error: "bad_request" }); return; }
  try {
    await supabase.from("user_completed").delete()
      .eq("user_id", userId).eq("provider_id", item.providerId).eq("manga_id", item.mangaId).eq("chapter_id", item.chapterId);
    const { error } = await supabase.from("user_completed").insert({
      user_id: userId,
      provider_id: item.providerId,
      manga_id: item.mangaId,
      title: item.title,
      cover_url: item.coverUrl || null,
      chapter_id: item.chapterId,
      chapter_num: item.chapterNum || "",
      completed_at: item.completedAt || new Date().toISOString()
    });
    if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
    res.json({ success: true });
  } catch (err) { req.log.error({ err }, "handler failed"); res.status(500).json({ error: "server_error" }); }
});

// DELETE /api/auth/history/completed - remove one completed entry (by keys)
router.delete("/auth/history/completed", async (req: Request, res: Response) => {
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  const userId = req.query.userId as string;
  const providerId = req.query.providerId as string;
  const mangaId = req.query.mangaId as string;
  const chapterId = req.query.chapterId as string;
  if (!userId || !providerId || !mangaId || !chapterId) { res.status(400).json({ error: "missing_params" }); return; }
  const { error } = await supabase.from("user_completed").delete()
    .eq("user_id", userId).eq("provider_id", providerId).eq("manga_id", mangaId).eq("chapter_id", chapterId);
  if (error) { req.log.error({ err: error }, "db error"); res.status(500).json({ error: "db_error" }); return; }
  res.json({ success: true });
});

// GET /api/admin/users - list registered users (admin only)
router.get("/admin/users", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  if (!supabase) { res.status(503).json({ error: "db_unavailable" }); return; }
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, username, email, created_at")
      .order("created_at", { ascending: false });
    
    if (error) { res.status(500).json({ error: "db_error" }); return; }
    res.json({ items: data, total: data.length });
  } catch (err) { req.log.error({ err }, "handler failed"); res.status(500).json({ error: "server_error" }); }
});

// ---- Cross-device reader settings sync ----
// GET /api/auth/reader-settings?userId= -> { settings, profiles, workOverrides }
router.get("/auth/reader-settings", async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId || !supabase) { res.json({}); return; }
  try {
    const { data, error } = await supabase
      .from("user_reader_settings")
      .select("settings, profiles, work_overrides")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) { res.json({}); return; }
    res.json({ settings: data.settings || undefined, profiles: data.profiles || undefined, workOverrides: data.work_overrides || undefined });
  } catch (err) {
    req.log.error({ err }, "reader-settings get failed");
    res.json({});
  }
});

// POST /api/auth/reader-settings/upsert - { userId, settings, profiles, workOverrides }
router.post("/auth/reader-settings/upsert", async (req: Request, res: Response) => {
  const { userId, settings, profiles, workOverrides } = req.body || {};
  if (!userId || !supabase) { res.json({ ok: false }); return; }
  try {
    await supabase.from("user_reader_settings").upsert({
      user_id: userId,
      settings: settings ?? {},
      profiles: profiles ?? [],
      work_overrides: workOverrides ?? {},
      updated_at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "reader-settings upsert failed");
    res.status(500).json({ ok: false });
  }
});

export default router;

