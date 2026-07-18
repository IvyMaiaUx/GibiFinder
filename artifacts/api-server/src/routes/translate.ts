import { Router, Request, Response } from "express";
import { translateToPortuguese, generateSynopsis } from "../lib/gemini";

const router = Router();

// Cache generated synopses by title.
const synopsisCache = new Map<string, string>();

// Simple in-memory cache so the same synopsis isn't re-translated repeatedly.
const cache = new Map<string, string>();
const MAX_CACHE = 3000;

// POST /api/translate  { text } -> { text: <pt-br> }
router.post("/translate", async (req: Request, res: Response) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    res.json({ text: "" });
    return;
  }
  if (cache.has(text)) {
    res.json({ text: cache.get(text), cached: true });
    return;
  }
  try {
    const translated = await translateToPortuguese(text);
    if (cache.size >= MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(text, translated);
    res.json({ text: translated });
  } catch (err) {
    req.log.error({ err, action: "translate" }, "translation failed");
    res.status(500).json({ text, error: "translate_failed" });
  }
});

// GET /api/synopsis?title=<title> -> { text: <AI-generated pt-BR synopsis> }
router.get("/synopsis", async (req: Request, res: Response) => {
  const title = typeof req.query.title === "string" ? req.query.title.trim() : "";
  if (!title) { res.json({ text: "" }); return; }
  const key = title.toLowerCase();
  if (synopsisCache.has(key)) { res.json({ text: synopsisCache.get(key), cached: true }); return; }
  try {
    const text = await generateSynopsis(title);
    if (text) {
      if (synopsisCache.size >= MAX_CACHE) {
        const oldest = synopsisCache.keys().next().value;
        if (oldest !== undefined) synopsisCache.delete(oldest);
      }
      synopsisCache.set(key, text);
    }
    res.json({ text });
  } catch {
    res.status(500).json({ text: "", error: "synopsis_failed" });
  }
});

export default router;
