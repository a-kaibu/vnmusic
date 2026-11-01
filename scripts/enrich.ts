// 配信直リンク・ジャケット・ゲーム公式サイトを集めて src/data/links.json / games.json に書き出す。
// 外部サイトへのネットワークアクセスが必要。途中で止めても data/cache/ から再開できる。
//
//   node scripts/enrich.ts games    … 批評空間(ErogameScape)から公式サイト・ジャケットを取得し、公式サイトの生存確認
//   node scripts/enrich.ts apple    … iTunes Search API で Apple Music の曲ページ・ジャケットを取得
//   node scripts/enrich.ts odesli   … Apple Music の URL から song.link で Spotify / YouTube Music / Amazon Music などを取得
//   node scripts/enrich.ts spotify  … (任意) SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET があれば Spotify API で補完
//   node scripts/enrich.ts write    … キャッシュから JSON を書き出す
//   node scripts/enrich.ts all      … 上を順に全部
//
// オプション: --all-songs  CSVで配信○△がない曲も Apple Music を探す (時間がかかる)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

type Flag = 0 | 1 | 2;
type Song = {
  id: number;
  title: string;
  vocal: string;
  game: string;
  brand: string;
  release: string;
  album: string;
  stream: Record<string, Flag>;
};

const root = new URL("../", import.meta.url);
const songs: Song[] = JSON.parse(readFileSync(new URL("src/data/songs.json", root), "utf8"));
const cacheDir = new URL("data/cache/", root);
mkdirSync(cacheDir, { recursive: true });

const load = <T>(name: string, fallback: T): T => {
  const f = new URL(name, cacheDir);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fallback;
};
const save = (name: string, v: unknown) =>
  writeFileSync(new URL(name, cacheDir), JSON.stringify(v, null, 1));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const norm = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s\-‐―ー~〜～・:：!！?？、。,.'"“”‘’『』「」【】()（）[\]＜＞<>☆★♪]/g, "");
const firstArtist = (s: Song) =>
  (s.vocal.split(" / ")[0] ?? "").replace(/[（(].*?[)）]/g, "").trim();
const hasFlag = (s: Song) => Object.values(s.stream).some((v) => v > 0);

async function get(url: string, init?: RequestInit, tries = 4): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i >= tries) throw e;
      const wait = 2000 * 2 ** i;
      console.warn(`  retry in ${wait / 1000}s: ${(e as Error).message}`);
      await sleep(wait);
    }
  }
}

// ---------- games: ErogameScape ----------
type EgsGame = {
  id: string;
  name: string;
  brand: string;
  sellday: string;
  url: string;
  dmm: string;
};
type GameOut = { official?: string; officialAlive?: boolean; cover?: string; egs?: string };

async function egsSql(sql: string): Promise<string[][]> {
  const r = await get(
    "https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/sql_for_erogamer_form.php",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ sql }).toString(),
    },
  );
  const html = await r.text();
  const table = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i)?.[1] ?? "";
  const decode = (s: string) =>
    s
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .trim();
  return [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => decode(c[1])))
    .filter((r) => r.length);
}

async function stageGames() {
  let egs = load<EgsGame[]>("egs-games.json", []);
  if (!egs.length) {
    console.log("ErogameScape からゲーム一覧を取得中…");
    const rows = await egsSql(
      "SELECT g.id, g.gamename, b.brandname, g.sellday, COALESCE(g.shoukai,''), COALESCE(g.dmm,'') FROM gamelist g JOIN brandlist b ON b.id = g.brandname ORDER BY g.id",
    );
    egs = rows.map(([id, name, brand, sellday, url, dmm]) => ({
      id,
      name,
      brand,
      sellday,
      url,
      dmm,
    }));
    save("egs-games.json", egs);
    console.log(`  ${egs.length} games`);
  }
  const byName = new Map<string, EgsGame[]>();
  for (const g of egs)
    (byName.get(norm(g.name)) ?? byName.set(norm(g.name), []).get(norm(g.name))!).push(g);

  const out = load<Record<string, GameOut>>("games.json", {});
  const titles = [...new Map(songs.map((s) => [s.game, s])).values()];
  for (const s of titles) {
    if (out[s.game]?.egs !== undefined) continue;
    const day = s.release.replace(/\//g, "-");
    let cands = byName.get(norm(s.game)) ?? [];
    if (!cands.length) {
      // 副題違いなど: 前方一致で探す
      const n = norm(s.game);
      cands = egs.filter(
        (g) =>
          n.length >= 4 &&
          (norm(g.name).startsWith(n) || (n.startsWith(norm(g.name)) && norm(g.name).length >= 4)),
      );
    }
    const pick =
      cands.find((g) => g.sellday === day) ??
      cands.find((g) => norm(g.brand) === norm(s.brand)) ??
      (cands.length === 1 ? cands[0] : undefined);
    out[s.game] = pick
      ? {
          egs: pick.id,
          official: pick.url || undefined,
          cover: pick.dmm
            ? `https://pics.dmm.co.jp/digital/pcgame/${pick.dmm}/${pick.dmm}pl.jpg`
            : undefined,
        }
      : { egs: "" };
  }
  save("games.json", out);
  console.log(`  matched ${Object.values(out).filter((g) => g.egs).length}/${titles.length} games`);

  console.log("公式サイト・ジャケットの生存確認中…");
  const entries = Object.entries(out).filter(
    ([, g]) => g.official && g.officialAlive === undefined,
  );
  let done = 0;
  await pool(entries, 8, async ([, g]) => {
    g.officialAlive = await alive(g.official!);
    if (g.cover && !(await alive(g.cover, true))) g.cover = undefined;
    if (++done % 50 === 0) {
      save("games.json", out);
      console.log(`  ${done}/${entries.length}`);
    }
  });
  save("games.json", out);
}

async function alive(url: string, image = false) {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "Mozilla/5.0 vnmusic-linkcheck" },
    });
    if (!r.ok) return false;
    const type = r.headers.get("content-type") ?? "";
    if (image) return type.startsWith("image/") && !r.url.includes("now_printing");
    // ドメイン切れでパーキングページになっていないかざっくり確認
    const body = (await r.text()).slice(0, 20000);
    return !/(このドメインは|domain (is )?for sale|お名前\.com|parking|sedo)/i.test(body);
  } catch {
    return false;
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

// ---------- vndb: VNDB API (批評空間に繋がらないときの代替) ----------
type VndbRel = {
  id: string;
  title: string;
  alttitle?: string | null;
  released: string;
  extlinks: { name: string; url: string }[];
  vns: { id: string; alttitle?: string | null; title: string; image?: { url: string; sexual: number } | null }[];
};

async function vndbReleases(q: string): Promise<VndbRel[]> {
  const r = await get("https://api.vndb.org/kana/release", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filters: ["search", "=", q],
      fields:
        "title,alttitle,released,extlinks.url,extlinks.name,vns.id,vns.title,vns.alttitle,vns.image.url,vns.image.sexual",
      results: 50,
    }),
  });
  if (!r.ok) throw new Error(`VNDB HTTP ${r.status}`);
  return ((await r.json()) as { results: VndbRel[] }).results;
}

async function stageVndb() {
  const out = load<Record<string, GameOut & { vndb?: string }>>("games.json", {});
  const titles = [...new Map(songs.map((s) => [s.game, s])).values()].filter(
    (s) => out[s.game]?.vndb === undefined,
  );
  console.log(`VNDB 照合: ${titles.length} 作品 (1.6 秒間隔)`);
  for (const [i, s] of titles.entries()) {
    const day = s.release.replace(/\//g, "-");
    const n = norm(s.game);
    try {
      let rels = await vndbReleases(s.game);
      if (!rels.length) {
        const short = s.game.split(/[\s　\-－～~〜]/)[0];
        if (short && short !== s.game && short.length >= 2) {
          await sleep(1600);
          rels = await vndbReleases(short);
        }
      }
      const score = (r: VndbRel) => {
        const names = [r.alttitle, r.title, ...r.vns.flatMap((v) => [v.alttitle, v.title])]
          .filter(Boolean)
          .map((x) => norm(x!));
        return (
          (r.released === day ? 10 : r.released.slice(0, 7) === day.slice(0, 7) ? 4 : 0) +
          (names.some((x) => x === n) ? 8 : names.some((x) => x.startsWith(n) || n.startsWith(x)) ? 4 : 0)
        );
      };
      const best = rels.map((r) => [score(r), r] as const).sort((a, b) => b[0] - a[0])[0];
      if (best && best[0] >= 12) {
        const vn = best[1].vns[0];
        // 同じ作品の全リリースから公式サイトを探す（発売日が近いものを優先、アーカイブは除外）
        const sameVn = rels
          .filter((r) => r.vns.some((v) => v.id === vn.id))
          .sort((a, b) => Number(b.released === day) - Number(a.released === day));
        const site = sameVn
          .flatMap((r) => r.extlinks)
          .find((l) => l.name === "website" && !l.url.includes("web.archive.org"))?.url;
        const egs = sameVn.flatMap((r) => r.extlinks).find((l) => l.name === "egs")?.url;
        out[s.game] = {
          vndb: vn.id,
          egs: egs?.match(/game=(\d+)/)?.[1] ?? "",
          official: site,
          cover: vn.image && vn.image.sexual < 2 ? vn.image.url : undefined,
        };
      } else out[s.game] = { vndb: "", egs: "" };
    } catch (e) {
      console.warn(`  ! ${s.game}: ${(e as Error).message}`);
    }
    if (i % 25 === 24) {
      save("games.json", out);
      console.log(`  ${i + 1}/${titles.length}`);
    }
    await sleep(1600);
  }
  save("games.json", out);
  console.log(`  matched ${Object.values(out).filter((g) => g.vndb).length}/${Object.keys(out).length}`);
  await checkAlive(out);
}

async function checkAlive(out: Record<string, GameOut>) {
  console.log("公式サイト・ジャケットの生存確認中…");
  const entries = Object.entries(out).filter(([, g]) => g.official && g.officialAlive === undefined);
  let done = 0;
  await pool(entries, 8, async ([, g]) => {
    g.officialAlive = await alive(g.official!);
    if (g.cover && !(await alive(g.cover, true))) g.cover = undefined;
    if (++done % 50 === 0) {
      save("games.json", out);
      console.log(`  ${done}/${entries.length}`);
    }
  });
  save("games.json", out);
  console.log(`  生きている公式サイト: ${Object.values(out).filter((g) => g.officialAlive).length}`);
}

// ---------- apple: iTunes Search API ----------
type AppleOut = {
  track?: string;
  album?: string;
  artwork?: string;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
} | null;

async function stageApple(allSongs: boolean) {
  const out = load<Record<number, AppleOut>>("apple.json", {});
  const targets = songs.filter((s) => (allSongs || hasFlag(s)) && !(s.id in out));
  console.log(`Apple Music 検索: ${targets.length} 曲 (約20件/分の制限があるため 3 秒間隔)`);
  for (const [i, s] of targets.entries()) {
    const search = async (term: string) => {
      const url = `https://itunes.apple.com/search?${new URLSearchParams({ term, country: "jp", entity: "song", limit: "25", lang: "ja_jp" })}`;
      const j = (await (await get(url)).json()) as { results?: any[] };
      return j.results ?? [];
    };
    try {
      let res = await search(`${s.title} ${firstArtist(s)}`.trim());
      if (!res.length && firstArtist(s)) {
        await sleep(3000);
        res = await search(s.title);
      }
      const t = norm(s.title);
      const a = norm(firstArtist(s));
      const g = norm(s.game);
      const score = (r: any) =>
        (norm(r.trackName) === t ? 10 : norm(r.trackName).startsWith(t) ? 5 : 0) +
        (a && norm(r.artistName ?? "").includes(a) ? 4 : 0) +
        (g && norm(r.collectionName ?? "").includes(g.slice(0, 6)) ? 2 : 0) +
        (/(off ?vocal|instrumental|karaoke|カラオケ)/i.test(r.trackName) ? -8 : 0);
      const best = res.map((r) => [score(r), r] as const).sort((x, y) => y[0] - x[0])[0];
      out[s.id] =
        best && best[0] >= 12
          ? {
              track: best[1].trackViewUrl?.replace(/[?&]uo=\d+/, ""),
              album: best[1].collectionViewUrl?.replace(/[?&]uo=\d+/, ""),
              artwork: best[1].artworkUrl100?.replace("100x100bb", "600x600bb"),
              trackName: best[1].trackName,
              artistName: best[1].artistName,
              collectionName: best[1].collectionName,
            }
          : null;
    } catch (e) {
      console.warn(`  ! ${s.title}: ${(e as Error).message}`);
    }
    if (i % 10 === 9) {
      save("apple.json", out);
      console.log(`  ${i + 1}/${targets.length}`);
    }
    await sleep(3000);
  }
  save("apple.json", out);
  console.log(`  見つかった曲: ${Object.values(out).filter(Boolean).length}`);
}

// ---------- odesli: song.link ----------
type OdesliOut = Record<string, string> | null;
const odesliKeys: Record<string, string> = {
  spotify: "spotify",
  youtubeMusic: "ytmusic",
  amazonMusic: "amazon",
  youtube: "youtube",
  appleMusic: "apple",
  awa: "awa",
};

async function stageOdesli() {
  const apple = load<Record<number, AppleOut>>("apple.json", {});
  const out = load<Record<number, OdesliOut>>("odesli.json", {});
  const targets = Object.entries(apple).filter(([id, a]) => a?.track && !(id in out));
  console.log(`song.link: ${targets.length} 曲 (10件/分の制限があるため 6.5 秒間隔)`);
  for (const [i, [id, a]] of targets.entries()) {
    try {
      const r = await get(
        `https://api.song.link/v1-alpha.1/links?${new URLSearchParams({ url: a!.track!, userCountry: "JP" })}`,
      );
      if (r.ok) {
        const j = (await r.json()) as { linksByPlatform: Record<string, { url: string }> };
        const m: Record<string, string> = {};
        for (const [k, v] of Object.entries(j.linksByPlatform ?? {}))
          if (odesliKeys[k]) m[odesliKeys[k]] = v.url;
        out[Number(id)] = m;
      } else out[Number(id)] = null;
    } catch (e) {
      console.warn(`  ! ${id}: ${(e as Error).message}`);
    }
    if (i % 10 === 9) {
      save("odesli.json", out);
      console.log(`  ${i + 1}/${targets.length}`);
    }
    await sleep(6500);
  }
  save("odesli.json", out);
}

// ---------- spotify (任意) ----------
async function stageSpotify() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret)
    return console.log("SPOTIFY_CLIENT_ID / SECRET がないので Spotify はスキップ");
  const tok = (await (
    await get("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    })
  ).json()) as { access_token: string };
  const odesli = load<Record<number, OdesliOut>>("odesli.json", {});
  const out = load<Record<number, { url: string; artwork?: string } | null>>("spotify.json", {});
  const targets = songs.filter(
    (s) => s.stream.spotify > 0 && !odesli[s.id]?.spotify && !(s.id in out),
  );
  console.log(`Spotify API: ${targets.length} 曲`);
  for (const s of targets) {
    const q = `track:${s.title}${firstArtist(s) ? ` artist:${firstArtist(s)}` : ""}`;
    const r = await get(
      `https://api.spotify.com/v1/search?${new URLSearchParams({ q, type: "track", market: "JP", limit: "10" })}`,
      {
        headers: { authorization: `Bearer ${tok.access_token}` },
      },
    );
    const j = (await r.json()) as { tracks?: { items: any[] } };
    const hit = j.tracks?.items.find(
      (t) => norm(t.name) === norm(s.title) || norm(t.name).startsWith(norm(s.title)),
    );
    out[s.id] = hit
      ? { url: hit.external_urls.spotify, artwork: hit.album?.images?.[0]?.url }
      : null;
    await sleep(300);
  }
  save("spotify.json", out);
}

// ---------- write ----------
function stageWrite() {
  const apple = load<Record<number, AppleOut>>("apple.json", {});
  const odesli = load<Record<number, OdesliOut>>("odesli.json", {});
  const spotify = load<Record<number, { url: string; artwork?: string } | null>>(
    "spotify.json",
    {},
  );
  const games = load<Record<string, GameOut>>("games.json", {});
  const links: Record<number, Record<string, string>> = {};
  for (const s of songs) {
    const l: Record<string, string> = {};
    const a = apple[s.id];
    if (a?.track) l.apple = a.track;
    if (a?.album) l.album = a.album;
    if (a?.artwork) l.artwork = a.artwork;
    Object.assign(l, odesli[s.id] ?? {});
    if (a?.track) l.apple = a.track; // jp ストアの URL を優先
    const sp = spotify[s.id];
    if (sp && !l.spotify) l.spotify = sp.url;
    if (sp?.artwork && !l.artwork) l.artwork = sp.artwork;
    if (Object.keys(l).length) links[s.id] = l;
  }
  const gameOut: Record<string, { official?: string; officialAlive?: boolean; cover?: string }> =
    {};
  for (const [name, g] of Object.entries(games)) {
    const v = {
      official: g.official && g.officialAlive ? g.official : undefined,
      officialAlive: g.officialAlive,
      cover: g.cover,
    };
    if (v.official || v.cover) gameOut[name] = v;
  }
  writeFileSync(new URL("src/data/links.json", root), JSON.stringify(links));
  writeFileSync(new URL("src/data/games.json", root), JSON.stringify(gameOut));
  console.log(
    `links.json: ${Object.keys(links).length} 曲 / games.json: ${Object.keys(gameOut).length} 作品`,
  );
}

const stage = process.argv[2] ?? "all";
const allSongs = process.argv.includes("--all-songs");
if (stage === "games") await stageGames();
if (stage === "vndb" || stage === "all") await stageVndb();
if (stage === "alive") await checkAlive(load("games.json", {}));
if (stage === "apple" || stage === "all") await stageApple(allSongs);
if (stage === "odesli" || stage === "all") await stageOdesli();
if (stage === "spotify" || stage === "all") await stageSpotify();
stageWrite();
