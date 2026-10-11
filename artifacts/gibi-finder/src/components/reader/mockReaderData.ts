import { PageItem } from "./readerTypes";

function makeSvgUrl(title: string, subtitle: string, w: number, h: number, bg: string, accent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="100%" height="100%" fill="${bg}"/>
    <rect x="20" y="20" width="${w - 40}" height="${h - 40}" fill="none" stroke="${accent}" stroke-width="8" stroke-dasharray="16,8"/>
    <circle cx="${w / 2}" cy="${h / 2 - 40}" r="${Math.min(w, h) * 0.15}" fill="${accent}" opacity="0.2"/>
    <text x="${w / 2}" y="${h / 2 - 20}" font-family="sans-serif" font-weight="900" font-size="${Math.max(28, Math.min(w, h) * 0.05)}" fill="${accent}" text-anchor="middle" dominant-baseline="middle">${title}</text>
    <text x="${w / 2}" y="${h / 2 + 50}" font-family="sans-serif" font-weight="700" font-size="${Math.max(18, Math.min(w, h) * 0.028)}" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">${subtitle}</text>
    <text x="${w / 2}" y="${h - 60}" font-family="sans-serif" font-weight="600" font-size="16" fill="#888888" text-anchor="middle">${w} x ${h}px</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const MOCK_READER_PAGES: PageItem[] = [
  {
    id: "page-0",
    url: makeSvgUrl("CAPA (PÁGINA 0)", "Capa solo - sempre isolada no modo duplo", 800, 1200, "#1A1423", "#E63946"),
    width: 800,
    height: 1200,
  },
  {
    id: "page-1",
    url: makeSvgUrl("PÁGINA 1", "Página regular (Retrato)", 800, 1200, "#1F2421", "#38A3A5"),
    width: 800,
    height: 1200,
  },
  {
    id: "page-2",
    url: makeSvgUrl("PÁGINA 2", "Página regular (Retrato)", 800, 1200, "#22223B", "#C9ADA7"),
    width: 800,
    height: 1200,
  },
  {
    id: "page-3",
    url: makeSvgUrl("SPREAD DUPLO (W > H)", "Página panorâmica - tratada como página dupla nativa", 1600, 1100, "#283618", "#DDA15E"),
    width: 1600,
    height: 1100,
  },
  {
    id: "page-4",
    url: makeSvgUrl("TIRA WEBTOON (H >> W)", "Tira vertical contínua para testar modo webtoon", 800, 2400, "#3D0C11", "#F2545B"),
    width: 800,
    height: 2400,
  },
  {
    id: "page-5",
    url: makeSvgUrl("PÁGINA 5", "Página regular final", 800, 1200, "#14213D", "#FCA311"),
    width: 800,
    height: 1200,
  },
  {
    id: "page-6-error",
    url: "https://invalid-domain.example/broken-page.jpg",
    width: 800,
    height: 1200,
  },
];
