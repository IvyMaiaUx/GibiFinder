import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. Database features will be unavailable.");
}

export const pool = process.env.DATABASE_URL 
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) 
  : null;

export const db = pool 
  ? drizzle(pool, { schema }) 
  : null;

export * from "./schema";
