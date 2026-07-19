// Automatic quality score for a catalog work, based only on fields we actually
// have. Surfaces curation gaps (missing cover, thin synopsis, no category) so the
// admin can prioritize what needs attention as the catalog grows.
export interface QualityCheck { label: string; ok: boolean; hint: string; }
export interface QualityResult { score: number; checks: QualityCheck[] }

const GENERIC_GENRES = new Set(["biblioteca", "drive", "hq", "nacional", "gibi nacional", "gibi"]);

export function scoreItem(item: any, override?: any): QualityResult {
  const cover = override?.coverUrl || item?.coverUrl;
  const desc = String(override?.description || item?.description || "").trim();
  const title = String(override?.title || item?.title || "").trim();
  const genres: string[] = (item?.genres || []).map((g: string) => String(g).toLowerCase());
  const hasCategory = genres.some(g => !GENERIC_GENRES.has(g));
  const cleanTitle = title.length >= 2 && !/^drive-/i.test(title) && /[a-zA-ZÀ-ÿ]/.test(title);

  const checks: QualityCheck[] = [
    { label: "Capa", ok: !!cover, hint: "Sem imagem de capa" },
    { label: "Sinopse", ok: desc.length >= 60, hint: "Sinopse ausente ou muito curta" },
    { label: "Título", ok: cleanTitle, hint: "Título ausente ou mal formatado" },
    { label: "Categoria", ok: hasCategory, hint: "Sem categoria/tag específica" },
  ];
  const ok = checks.filter(c => c.ok).length;
  return { score: Math.round((ok / checks.length) * 100), checks };
}

export function qualityColor(score: number): string {
  if (score >= 85) return "#16a34a"; // green
  if (score >= 60) return "#ca8a04"; // amber
  return "#dc2626"; // red
}
