import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { comicsTable, ratingsTable } from "@workspace/db/schema";
import { eq, sql, desc, gte, and, ilike, or } from "drizzle-orm";
import { identifyComicFromImages, searchComicByText, searchComicByDescription } from "../lib/gemini";
import { IdentifyComicBody, SearchComicBody, QuoteSearchBody, DescriptionSearchBody, GetComicParams, GetHistoryQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

async function getAverageRating(comicId: number) {
  const ratings = await db
    .select({ avg: sql<number>`AVG(${ratingsTable.rating})`, count: sql<number>`COUNT(*)` })
    .from(ratingsTable)
    .where(eq(ratingsTable.comicId, comicId));
  return {
    averageRating: ratings[0]?.avg ? Number(ratings[0].avg) : 0,
    totalRatings: ratings[0]?.count ? Number(ratings[0].count) : 0,
  };
}

function formatComic(comic: typeof comicsTable.$inferSelect, ratingInfo?: { averageRating: number; totalRatings: number }) {
  return {
    id: comic.id,
    encontrado: comic.encontrado,
    titulo: comic.titulo,
    editora: comic.editora,
    personagens: JSON.parse(comic.personagens) as string[],
    descricao: comic.descricao,
    confianca: comic.confianca,
    nota: comic.nota,
    balloonText: comic.balloonText,
    imageThumbnail: comic.imageThumbnail,
    createdAt: comic.createdAt.toISOString(),
    searchType: comic.searchType,
    anoLancamento: comic.anoLancamento,
    numeroPagina: comic.numeroPagina,
    rank: comic.rank,
    averageRating: ratingInfo?.averageRating ?? 0,
    totalRatings: ratingInfo?.totalRatings ?? 0,
  };
}

async function saveAndFormatAlternatives(
  alternatives: ReturnType<typeof identifyComicFromImages> extends Promise<infer T> ? T : never,
  searchType: string,
  searchQuery: string,
  imageThumbnail: string,
) {
  const weekStart = getWeekStart();
  const results = [];
  for (const alt of alternatives) {
    const [saved] = await db.insert(comicsTable).values({
      titulo: alt.titulo,
      editora: alt.editora,
      personagens: JSON.stringify(alt.personagens),
      descricao: alt.descricao,
      confianca: alt.confianca,
      nota: alt.nota,
      encontrado: alt.encontrado,
      balloonText: alt.balloonText,
      imageThumbnail: alt.rank === 1 ? imageThumbnail : "",
      searchType,
      searchQuery,
      anoLancamento: alt.anoLancamento,
      numeroPagina: alt.numeroPagina,
      rank: alt.rank,
      weekStart,
    }).returning();
    const ratingInfo = await getAverageRating(saved!.id);
    results.push({ ...formatComic(saved!, ratingInfo) });
  }
  return results;
}

router.post("/identify", async (req, res) => {
  const parsed = IdentifyComicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad Request", message: parsed.error.message });
    return;
  }

  const { images, mimeTypes } = parsed.data;
  const imageThumbnail = images[0] ? `data:${mimeTypes[0]};base64,${images[0]}` : "";

  const alternatives = await identifyComicFromImages(images, mimeTypes);
  const results = await saveAndFormatAlternatives(alternatives, "image", "", imageThumbnail);

  res.json({ results });
});

router.post("/search", async (req, res) => {
  const parsed = SearchComicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad Request", message: parsed.error.message });
    return;
  }

  const { query } = parsed.data;
  const alternatives = await searchComicByText(query);
  const results = await saveAndFormatAlternatives(alternatives, "text", query, "");

  res.json({ results });
});

router.post("/description-search", async (req, res) => {
  const parsed = DescriptionSearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad Request", message: parsed.error.message });
    return;
  }

  const { description } = parsed.data;
  const alternatives = await searchComicByDescription(description);
  const results = await saveAndFormatAlternatives(alternatives, "description", description, "");

  res.json({ results });
});

router.post("/quote-search", async (req, res) => {
  const parsed = QuoteSearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad Request", message: parsed.error.message });
    return;
  }

  const { quote } = parsed.data;

  const comics = await db
    .select()
    .from(comicsTable)
    .where(ilike(comicsTable.balloonText, `%${quote}%`))
    .orderBy(desc(comicsTable.createdAt))
    .limit(20);

  const items = await Promise.all(
    comics.map(async (comic) => {
      const ratingInfo = await getAverageRating(comic.id);
      return formatComic(comic, ratingInfo);
    })
  );

  res.json({ results: items, total: items.length });
});

router.get("/:id", async (req, res) => {
  const parsed = GetComicParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad Request", message: parsed.error.message });
    return;
  }

  const comic = await db
    .select()
    .from(comicsTable)
    .where(eq(comicsTable.id, parsed.data.id))
    .limit(1);

  if (!comic.length) {
    res.status(404).json({ error: "Not Found", message: "Comic not found" });
    return;
  }

  const ratingInfo = await getAverageRating(comic[0]!.id);
  res.json(formatComic(comic[0]!, ratingInfo));
});

router.get("/", async (req, res) => {
  const parsed = GetHistoryQueryParams.safeParse(req.query);
  const page = parsed.success ? (parsed.data.page ?? 1) : 1;
  const limit = parsed.success ? (parsed.data.limit ?? 20) : 20;
  const titulo = parsed.success ? parsed.data.titulo : undefined;
  const editora = parsed.success ? parsed.data.editora : undefined;

  const offset = (page - 1) * limit;

  const conditions = [];
  if (titulo) conditions.push(ilike(comicsTable.titulo, `%${titulo}%`));
  if (editora) conditions.push(ilike(comicsTable.editora, `%${editora}%`));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [comics, countResult] = await Promise.all([
    db.select().from(comicsTable)
      .where(whereClause)
      .orderBy(desc(comicsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`COUNT(*)` }).from(comicsTable).where(whereClause),
  ]);

  const items = await Promise.all(
    comics.map(async (comic) => {
      const ratingInfo = await getAverageRating(comic.id);
      return formatComic(comic, ratingInfo);
    })
  );

  res.json({
    items,
    total: Number(countResult[0]?.count ?? 0),
    page,
    limit,
  });
});

export default router;
