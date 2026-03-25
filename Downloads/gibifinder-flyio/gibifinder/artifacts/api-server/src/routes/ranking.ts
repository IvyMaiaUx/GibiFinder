import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { comicsTable, ratingsTable } from "@workspace/db/schema";
import { eq, sql, desc, gte, and, lte } from "drizzle-orm";

const router: IRouter = Router();

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getWeekEnd(): Date {
  const weekStart = getWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
}

router.get("/", async (_req, res) => {
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();

  const rankingRaw = await db
    .select({
      titulo: comicsTable.titulo,
      editora: comicsTable.editora,
      imageThumbnail: comicsTable.imageThumbnail,
      id: sql<number>`MIN(${comicsTable.id})`,
      searchCount: sql<number>`COUNT(*)`,
    })
    .from(comicsTable)
    .where(and(gte(comicsTable.weekStart, weekStart), lte(comicsTable.weekStart, weekEnd)))
    .groupBy(comicsTable.titulo, comicsTable.editora, comicsTable.imageThumbnail)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(10);

  const items = await Promise.all(
    rankingRaw.map(async (item) => {
      const ratingResult = await db
        .select({ avg: sql<number>`AVG(${ratingsTable.rating})`, count: sql<number>`COUNT(*)` })
        .from(ratingsTable)
        .where(eq(ratingsTable.comicId, Number(item.id)));

      return {
        id: Number(item.id),
        titulo: item.titulo,
        editora: item.editora,
        imageThumbnail: item.imageThumbnail,
        searchCount: Number(item.searchCount),
        averageRating: ratingResult[0]?.avg ? Number(ratingResult[0].avg) : 0,
        totalRatings: ratingResult[0]?.count ? Number(ratingResult[0].count) : 0,
      };
    })
  );

  res.json({
    items,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
  });
});

export default router;
