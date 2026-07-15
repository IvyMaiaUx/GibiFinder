import { Router, Request, Response } from "express";
import { ProviderManager } from "../providers/ProviderManager";

const router = Router();

// GET /api/providers - List all active providers
router.get("/providers", (req: Request, res: Response) => {
  try {
    const list = ProviderManager.listProviders();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "failed_to_list_providers", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/search - Search across all active providers with unifications
router.get("/providers/search", async (req: Request, res: Response) => {
  const query = req.query.query as string;
  if (!query) {
    res.status(400).json({ error: "missing_query", message: "O parâmetro de busca 'query' é obrigatório." });
    return;
  }

  try {
    const results = await ProviderManager.search(query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "search_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/details - Get details for a specific manga/HQ
router.get("/providers/details", async (req: Request, res: Response) => {
  const providerId = req.query.providerId as string;
  const id = req.query.id as string;

  if (!providerId || !id) {
    res.status(400).json({ error: "missing_params", message: "Os parâmetros 'providerId' e 'id' são obrigatórios." });
    return;
  }

  try {
    const details = await ProviderManager.getDetails(providerId, id);
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: "details_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/chapters - List chapters from a provider
router.get("/providers/chapters", async (req: Request, res: Response) => {
  const providerId = req.query.providerId as string;
  const id = req.query.id as string;

  if (!providerId || !id) {
    res.status(400).json({ error: "missing_params", message: "Os parâmetros 'providerId' e 'id' são obrigatórios." });
    return;
  }

  try {
    const chapters = await ProviderManager.getChapters(providerId, id);
    res.json(chapters);
  } catch (err) {
    res.status(500).json({ error: "chapters_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/pages - Get pages of a chapter
router.get("/providers/pages", async (req: Request, res: Response) => {
  const providerId = req.query.providerId as string;
  const chapterId = req.query.chapterId as string;

  if (!providerId || !chapterId) {
    res.status(400).json({ error: "missing_params", message: "Os parâmetros 'providerId' e 'chapterId' são obrigatórios." });
    return;
  }

  try {
    const pages = await ProviderManager.getPages(providerId, chapterId);
    res.json(pages);
  } catch (err) {
    res.status(500).json({ error: "pages_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/providers/toggle - Toggle provider active state
router.post("/providers/toggle", (req: Request, res: Response) => {
  const { providerId, active } = req.body;
  if (!providerId || active === undefined) {
    res.status(400).json({ error: "missing_params", message: "Os parâmetros 'providerId' e 'active' são obrigatórios." });
    return;
  }

  try {
    ProviderManager.toggleProvider(providerId, !!active);
    res.json({ success: true, providerId, active: !!active });
  } catch (err) {
    res.status(500).json({ error: "toggle_failed", message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/providers/catalog - Fetch unified catalog from all active providers
router.get("/providers/catalog", async (req: Request, res: Response) => {
  const listType = (req.query.listType as "popular" | "latest") || "popular";

  try {
    const items = await ProviderManager.getCatalog(listType);
    res.json(items);
  } catch (err) {
    res.status(500).json({ 
      error: "catalog_failed", 
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
  }
});

export default router;
