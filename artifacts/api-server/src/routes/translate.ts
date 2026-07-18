import { Router, Request, Response } from "express";
import { translateToPortuguese } from "../lib/gemini";

const router = Router();

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
  } catch {
    res.status(500).json({ text, error: "translate_failed" });
  }
});

export default router;
