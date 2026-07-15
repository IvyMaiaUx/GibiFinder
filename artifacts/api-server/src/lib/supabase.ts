import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const supabaseUrl = process.env["SUPABASE_URL"];
const supabaseKey = process.env["SUPABASE_ANON_KEY"];

if (!supabaseUrl || !supabaseKey) {
  logger.warn("SUPABASE_URL or SUPABASE_ANON_KEY not set — database features will be unavailable");
}

const isUrlValid = (url?: string) => {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
};

export const supabase = isUrlValid(supabaseUrl) && supabaseKey
  ? createClient(supabaseUrl!, supabaseKey)
  : null;
