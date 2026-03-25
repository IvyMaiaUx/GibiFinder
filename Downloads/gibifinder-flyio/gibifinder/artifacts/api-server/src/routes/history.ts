import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { comicsTable, ratingsTable } from "@workspace/db/schema";
import { sql, desc, and, ilike, eq } from "drizzle-orm";
import { GetHistoryQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

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
        averageRating: ratingInfo.averageRating,
        totalRatings: ratingInfo.totalRatings,
      };
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
