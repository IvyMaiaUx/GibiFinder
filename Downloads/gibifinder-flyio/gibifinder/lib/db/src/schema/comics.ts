import { pgTable, serial, text, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const comicsTable = pgTable("comics", {
  id: serial("id").primaryKey(),
  titulo: text("titulo").notNull().default(""),
  editora: text("editora").notNull().default(""),
  personagens: text("personagens").notNull().default("[]"),
  descricao: text("descricao").notNull().default(""),
  confianca: integer("confianca").notNull().default(0),
  nota: text("nota").notNull().default(""),
  encontrado: boolean("encontrado").notNull().default(false),
  balloonText: text("balloon_text").notNull().default(""),
  imageThumbnail: text("image_thumbnail").notNull().default(""),
  searchType: text("search_type").notNull().default("image"),
  searchQuery: text("search_query").notNull().default(""),
  anoLancamento: text("ano_lancamento").notNull().default(""),
  numeroPagina: text("numero_pagina").notNull().default(""),
  rank: integer("rank").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  weekStart: timestamp("week_start").notNull().defaultNow(),
});

export const ratingsTable = pgTable("ratings", {
  id: serial("id").primaryKey(),
  comicId: integer("comic_id").notNull().references(() => comicsTable.id),
  rating: integer("rating").notNull(),
  feedback: text("feedback").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertComicSchema = createInsertSchema(comicsTable).omit({ id: true, createdAt: true });
export const insertRatingSchema = createInsertSchema(ratingsTable).omit({ id: true, createdAt: true });

export type InsertComic = z.infer<typeof insertComicSchema>;
export type Comic = typeof comicsTable.$inferSelect;
export type InsertRating = z.infer<typeof insertRatingSchema>;
export type Rating = typeof ratingsTable.$inferSelect;
