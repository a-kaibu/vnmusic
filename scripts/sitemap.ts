// public/sitemap.xml を作る（トップ・一覧と、サイト内で再生できる曲・ゲーム・ブランドのページ）
// 実行: node scripts/sitemap.ts
import { readFileSync, writeFileSync } from "node:fs";

const SITE = "https://a-kaibu.github.io/vnmusic/";
const root = new URL("../", import.meta.url);
const songs: { id: number; game: string; brand: string }[] = JSON.parse(
  readFileSync(new URL("src/data/songs.json", root), "utf8"),
);
const links: Record<string, { yt?: string; nico?: string }> = JSON.parse(
  readFileSync(new URL("src/data/links.json", root), "utf8"),
);
const today = new Date().toISOString().slice(0, 10);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const q = (p: Record<string, string>) => `${SITE}?${new URLSearchParams(p)}`;

const urls = new Set<string>([
  SITE,
  q({ view: "games" }),
  q({ view: "brands" }),
  q({ view: "artists" }),
]);
const playable = songs.filter((s) => links[s.id]?.yt || links[s.id]?.nico);
for (const b of new Set(playable.map((s) => s.brand))) if (b) urls.add(q({ by: "brand", name: b }));
for (const g of new Set(playable.map((s) => s.game))) if (g) urls.add(q({ by: "game", name: g }));
for (const s of playable) urls.add(q({ song: String(s.id) }));

writeFileSync(
  new URL("public/sitemap.xml", root),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
    ...urls,
  ]
    .map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod></url>`)
    .join("\n")}\n</urlset>\n`,
);
console.log(`sitemap.xml: ${urls.size} URL`);
