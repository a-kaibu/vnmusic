// ブランド・アーティストの画像を集めて public/img/ に保存し、src/data/images.json に対応表を書く。
//
//   node scripts/images.ts artists  … Apple Music のアーティストページの写真
//   node scripts/images.ts brands   … VNDB で公式サイトを調べ、そのサイトの og:image（ロゴ・バナー）
//
// どちらも途中で止めても data/cache/images-*.json から再開できる。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

type Song = { vocal: string; brand: string };
const root = new URL("../", import.meta.url);
const songs: Song[] = JSON.parse(readFileSync(new URL("src/data/songs.json", root), "utf8"));
const cacheFile = (k: string) => new URL(`data/cache/images-${k}.json`, root);
const outFile = new URL("src/data/images.json", root);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UA = { "user-agent": "Mozilla/5.0 (vnmusic image fetch)" };

const norm = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s\-‐―ー~〜～・:：!！?？、。,.'"“”‘’『』「」【】()（）[\]☆★♪]/g, "");
const bare = (s: string) => s.replace(/[（(].*?[)）]/g, "").trim();

async function get(url: string, init?: RequestInit) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i >= 3) throw e;
      await sleep(3000 * 2 ** i);
    }
  }
}

const ogImage = (html: string, base: string) => {
  const m =
    html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/i)?.[0] ?? "";
  const c = m.match(/content=["']([^"']+)["']/i)?.[1];
  if (!c) return undefined;
  try {
    return new URL(c.replace(/&amp;/g, "&"), base).href;
  } catch {
    return undefined;
  }
};

/** 画像を落として 400px に縮め、public/img/<dir>/<hash>.jpg に保存。保存先の公開パスを返す */
async function saveImage(url: string, dir: string, key: string, square: boolean) {
  const r = await get(url, { headers: UA });
  if (!r.ok || !(r.headers.get("content-type") ?? "").startsWith("image/")) return undefined;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1500) return undefined;
  const name = createHash("sha1").update(key).digest("hex").slice(0, 12);
  const d = new URL(`public/img/${dir}/`, root);
  mkdirSync(d, { recursive: true });
  const tmp = new URL(`${name}.src`, d);
  const out = new URL(`${name}.jpg`, d);
  writeFileSync(tmp, buf);
  try {
    execFileSync("convert", [
      `${tmp.pathname}[0]`,
      "-background",
      "#1c1c27",
      "-flatten",
      ...(square
        ? ["-resize", "400x400^", "-gravity", "north", "-extent", "400x400"]
        : ["-resize", "480x480>"]),
      "-strip",
      "-quality",
      "82",
      out.pathname,
    ]);
  } catch {
    return undefined;
  } finally {
    unlinkSync(tmp);
  }
  return `img/${dir}/${name}.jpg`;
}

const loadJson = <T>(f: URL, fb: T): T =>
  existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fb;

async function artists() {
  const cache = loadJson<Record<string, string | null>>(cacheFile("artists"), {});
  const names = [...new Set(songs.map((s) => (s.vocal.split(" / ")[0] ?? "").trim()))].filter(
    (n) => n && !(n in cache),
  );
  console.log(`アーティスト: ${names.length} 人`);
  for (const [i, name] of names.entries()) {
    const term = bare(name) || name;
    try {
      const r = await get(
        `https://itunes.apple.com/search?${new URLSearchParams({ term, entity: "musicArtist", country: "jp", limit: "10", lang: "ja_jp" })}`,
      );
      const res = ((await r.json()) as { results?: any[] }).results ?? [];
      const n = norm(term);
      const hit = res.find((a) => {
        const slug = decodeURIComponent(a.artistLinkUrl?.split("/artist/")[1]?.split("/")[0] ?? "");
        return norm(slug) === n || norm(a.artistName ?? "") === n;
      });
      let path: string | null = null;
      if (hit) {
        const page = await (
          await get(hit.artistLinkUrl.replace(/\?.*/, ""), { headers: UA })
        ).text();
        const img = ogImage(page, hit.artistLinkUrl);
        // 写真がないアーティストは Apple Music のロゴ画像になるので除く
        if (img && img.includes("mzstatic.com")) {
          const big = img.replace(/\/\d+x\d+[a-z]*\.(png|jpg)$/, "/600x600cc.jpg");
          path = (await saveImage(big, "artist", name, true)) ?? null;
        }
      }
      cache[name] = path;
    } catch (e) {
      console.warn(`  ! ${name}: ${(e as Error).message}`);
    }
    if (i % 20 === 19) {
      writeFileSync(cacheFile("artists"), JSON.stringify(cache, null, 1));
      console.log(
        `  ${i + 1}/${names.length} (画像あり: ${Object.values(cache).filter(Boolean).length})`,
      );
    }
    await sleep(3200);
  }
  writeFileSync(cacheFile("artists"), JSON.stringify(cache, null, 1));
}

async function brands() {
  const cache = loadJson<Record<string, string | null>>(cacheFile("brands"), {});
  const names = [...new Set(songs.map((s) => s.brand))].filter((n) => n && !(n in cache));
  console.log(`ブランド: ${names.length} 件`);
  for (const [i, name] of names.entries()) {
    try {
      const r = await get("https://api.vndb.org/kana/producer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filters: ["search", "=", name],
          fields: "name,original,aliases,extlinks.url,extlinks.name",
          results: 10,
        }),
      });
      const res = ((await r.json()) as { results?: any[] }).results ?? [];
      const n = norm(name);
      const hit =
        res.find((p) =>
          [p.original, p.name, ...(p.aliases ?? [])].some((x: string) => x && norm(x) === n),
        ) ?? (res.length === 1 ? res[0] : undefined);
      const site = hit?.extlinks?.find((l: any) => l.name === "website")?.url as string | undefined;
      let path: string | null = null;
      if (site) {
        try {
          const page = await get(site, { headers: UA, redirect: "follow" });
          const img = page.ok ? ogImage(await page.text(), page.url) : undefined;
          if (img) path = (await saveImage(img, "brand", name, false)) ?? null;
        } catch {
          /* サイトが落ちている */
        }
      }
      cache[name] = path;
    } catch (e) {
      console.warn(`  ! ${name}: ${(e as Error).message}`);
    }
    if (i % 20 === 19) {
      writeFileSync(cacheFile("brands"), JSON.stringify(cache, null, 1));
      console.log(
        `  ${i + 1}/${names.length} (画像あり: ${Object.values(cache).filter(Boolean).length})`,
      );
    }
    await sleep(1700);
  }
  writeFileSync(cacheFile("brands"), JSON.stringify(cache, null, 1));
}

const stage = process.argv[2];
if (stage === "artists") await artists();
if (stage === "brands") await brands();
// 対応表を書き出す
const pick = (k: string) =>
  Object.fromEntries(
    Object.entries(loadJson<Record<string, string | null>>(cacheFile(k), {})).filter(([, v]) => v),
  );
writeFileSync(outFile, JSON.stringify({ artist: pick("artists"), brand: pick("brands") }));
console.log("images.json を書き出しました");
