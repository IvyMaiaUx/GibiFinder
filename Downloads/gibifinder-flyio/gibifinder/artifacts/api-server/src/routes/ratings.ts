import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ratingsTable, comicsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { SubmitRatingBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/", async (req, res) => {
  const parsed = SubmitRatingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Bad Request", message: parsed.error.message });
    return;
  }

  const { comicId, rating, feedback } = parsed.data;

  const comic = await db.select().from(comicsTable).where(eq(comicsTable.id, comicId)).limit(1);
  if (!comic.length) {
    res.status(404).json({ error: "Not Found", message: "Comic not found" });
    return;
  }

  await db.insert(ratingsTable).values({ comicId, rating, feedback: feedback ?? "" });

  const ratingResult = await db
    .select({ avg: sql<number>`AVG(${ratingsTable.rating})`, count: sql<number>`COUNT(*)` })
    .from(ratingsTable)
    .where(eq(ratingsTable.comicId, comicId));

  res.json({
    success: true,
    averageRating: ratingResult[0]?.avg ? Number(ratingResult[0].avg) : 0,
    totalRatings: ratingResult[0]?.count ? Number(ratingResult[0].count) : 0,
  });
});

export default router;
