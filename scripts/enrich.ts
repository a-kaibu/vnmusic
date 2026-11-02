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
  vns: {
    id: string;
    alttitle?: string | null;
    title: string;
    image?: { url: string; sexual: number } | null;
  }[];
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
  const retry = process.argv.includes("--retry-null");
  const titles = [...new Map(songs.map((s) => [s.game, s])).values()].filter(
    (s) => out[s.game]?.vndb === undefined || (retry && out[s.game]?.vndb === ""),
  );
  console.log(`VNDB 照合: ${titles.length} 作品 (1.6 秒間隔)`);
  for (const [i, s] of titles.entries()) {
    const day = s.release.replace(/\//g, "-");
    // 「(非18禁)」「(NS)」「TVアニメ「…」」などの付記を外して探す
    const q = s.game
      .replace(/\s*[(（][^)）]*[)）]\s*$/, "")
      .replace(/^TVアニメ「(.*)」$/, "$1")
      .trim();
    const n = norm(q);
    try {
      let rels = await vndbReleases(q);
      if (!rels.length) {
        const short = q.split(/[\s　\-－～~〜]/)[0];
        if (short && short !== q && short.length >= 2) {
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
          (names.some((x) => x === n)
            ? 8
            : names.some((x) => x.startsWith(n) || n.startsWith(x))
              ? 4
              : 0)
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
  console.log(
    `  matched ${Object.values(out).filter((g) => g.vndb).length}/${Object.keys(out).length}`,
  );
  await checkAlive(out);
}

async function checkAlive(out: Record<string, GameOut>) {
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
  console.log(
    `  生きている公式サイト: ${Object.values(out).filter((g) => g.officialAlive).length}`,
  );
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
  const retry = process.argv.includes("--retry-null");
  const targets = songs.filter(
    (s) => (allSongs || hasFlag(s)) && (!(s.id in out) || (retry && out[s.id] === null)),
  );
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
      const b = norm(s.brand);
      // "(feat. 〇〇)" "(Game Size)" などの括弧書きを外して比べる
      const bare = (x: string) => norm(x.replace(/\s*[(（\[［][^)）\]］]*[)）\]］]\s*$/, ""));
      const score = (r: any) =>
        (norm(r.trackName) === t || bare(r.trackName) === t
          ? 10
          : norm(r.trackName).startsWith(t)
            ? 5
            : 0) +
        (a && (norm(r.artistName ?? "").includes(a) || norm(r.trackName).includes(a)) ? 4 : 0) +
        (b.length >= 2 && norm(r.artistName ?? "").includes(b) ? 2 : 0) +
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

// ---------- youtube: サイト内再生用に YouTube の動画を探す ----------
type YtOut = { id: string; title: string; channel: string; length?: string } | null;

async function ytSearch(q: string) {
  const r = await get(
    `https://www.youtube.com/results?${new URLSearchParams({ search_query: q, hl: "ja", gl: "JP" })}`,
    {
      headers: { "user-agent": "Mozilla/5.0", "accept-language": "ja" },
    },
  );
  const html = await r.text();
  const json = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/)?.[1];
  if (!json) throw new Error("ytInitialData not found");
  const found: { id: string; title: string; channel: string; length?: string }[] = [];
  const walk = (o: any) => {
    if (!o || typeof o !== "object") return;
    if (o.videoRenderer?.videoId) {
      const v = o.videoRenderer;
      found.push({
        id: v.videoId,
        title: v.title?.runs?.map((x: any) => x.text).join("") ?? "",
        channel: v.ownerText?.runs?.[0]?.text ?? "",
        length: v.lengthText?.simpleText,
      });
      return;
    }
    for (const k in o) walk(o[k]);
  };
  walk(JSON.parse(json));
  return found;
}

async function stageYoutube() {
  const out = load<Record<number, YtOut>>("youtube.json", {});
  const targets = songs.filter((s) => !(s.id in out));
  console.log(`YouTube 検索: ${targets.length} 曲 (2 秒間隔)`);
  for (const [i, s] of targets.entries()) {
    try {
      const t = norm(s.title);
      const a = norm(firstArtist(s));
      const g = norm(s.game).slice(0, 6);
      const b = norm(s.brand);
      const secs = (l?: string) => (l ?? "").split(":").reduce((x, y) => x * 60 + Number(y), 0);
      const score = (v: { title: string; channel: string; length?: string }) => {
        const nt = norm(v.title);
        const nc = norm(v.channel);
        const len = secs(v.length);
        return (
          (nt.includes(t) ? 10 : 0) +
          (a && (nt.includes(a) || nc.includes(a)) ? 3 : 0) +
          (g && nt.includes(g) ? 2 : 0) +
          (/topic|トピック/i.test(v.channel) ? 3 : 0) +
          (b.length >= 2 && nc.includes(b) ? 3 : 0) +
          (/(off ?vocal|instrumental|karaoke|カラオケ|歌ってみた|cover|弾いてみた|叩いてみた|打ってみた|踊ってみた|ヲタ芸|dtx|太鼓|piano|ピアノ|mad|amv|nightcore|8bit|オルゴール|music ?box|remix|作業用|メドレー|medley|maimai|譜面|音ゲー|プロセカ|chunithm|ongeki|osu!|beatmania|sdvx|ゆっくり|反応)/i.test(
            v.title,
          )
            ? -8
            : 0) +
          (/short ?ver|ショート|tv ?size|game ?size/i.test(v.title) ? -2 : 0) +
          (len && (len < 90 || len > 900) ? -6 : 0)
        );
      };
      const pick = (res: Awaited<ReturnType<typeof ytSearch>>) =>
        res
          .slice(0, 12)
          .map((v) => [score(v), v] as const)
          .sort((x, y) => y[0] - x[0])[0];
      let best = pick(await ytSearch(`${s.title} ${firstArtist(s)}`.trim()));
      if (!best || best[0] < 13) {
        await sleep(2000);
        const short = s.game.split(/[\s　\-－～~〜(（]/)[0];
        const alt = pick(await ytSearch(`${s.title} ${short}`.trim()));
        if (alt && (!best || alt[0] > best[0])) best = alt;
      }
      out[s.id] = best && best[0] >= 10 ? best[1] : null;
    } catch (e) {
      console.warn(`  ! ${s.title}: ${(e as Error).message}`);
    }
    if (i % 25 === 24) {
      save("youtube.json", out);
      console.log(
        `  ${i + 1}/${targets.length} (見つかった: ${Object.values(out).filter(Boolean).length})`,
      );
    }
    await sleep(2000);
  }
  save("youtube.json", out);
  console.log(`  見つかった曲: ${Object.values(out).filter(Boolean).length}`);
}

// ---------- yttopic: レーベル公式の「- Topic」音源を探す（YouTube Music の直リンク・サイト内再生に使う） ----------
async function stageYtTopic() {
  const out = load<Record<number, YtOut>>("youtube-topic.json", {});
  const targets = songs.filter((s) => !(s.id in out));
  console.log(`YouTube 公式音源検索: ${targets.length} 曲 (2 秒間隔)`);
  for (const [i, s] of targets.entries()) {
    try {
      const res = await ytSearch(`${s.title} ${firstArtist(s)} topic`.trim());
      const t = norm(s.title);
      const a = norm(firstArtist(s));
      const ok = res.slice(0, 15).filter((v) => {
        const nt = norm(v.title.replace(/\s*[(（\[［][^)）\]］]*[)）\]］]\s*$/, ""));
        return (
          (nt === t || norm(v.title) === t) &&
          !/(off ?vocal|instrumental|karaoke|カラオケ|short|remix|cover)/i.test(v.title)
        );
      });
      const topic = (v: (typeof ok)[number]) => / - topic$/i.test(v.channel);
      const artistCh = (v: (typeof ok)[number]) => {
        const ch = norm(v.channel.replace(/ - topic$/i, ""));
        return a.length >= 2 && (ch.includes(a) || (ch.length >= 2 && a.includes(ch)));
      };
      // 公式音源（Topic）で歌手名も合うもの → 歌手の公式チャンネル → 曲名が一致する Topic
      const hit = ok.find((v) => topic(v) && artistCh(v)) ?? ok.find(artistCh) ?? ok.find(topic);
      out[s.id] = hit ?? null;
    } catch (e) {
      console.warn(`  ! ${s.title}: ${(e as Error).message}`);
    }
    if (i % 25 === 24) {
      save("youtube-topic.json", out);
      console.log(
        `  ${i + 1}/${targets.length} (見つかった: ${Object.values(out).filter(Boolean).length})`,
      );
    }
    await sleep(2000);
  }
  save("youtube-topic.json", out);
}

// ---------- kkbox: KKBOX Open API（KKBOX_CLIENT_ID / KKBOX_CLIENT_SECRET） ----------
type KkOut = {
  url: string;
  isrc?: string;
  artwork?: string;
  name: string;
  artist: string;
  album: string;
} | null;

async function stageKkbox() {
  const id = process.env.KKBOX_CLIENT_ID;
  const secret = process.env.KKBOX_CLIENT_SECRET;
  if (!id || !secret) return console.log("KKBOX_CLIENT_ID / SECRET がないので KKBOX はスキップ");
  const tok = (await (
    await get("https://account.kkbox.com/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: id,
        client_secret: secret,
      }).toString(),
    })
  ).json()) as { access_token: string };
  const out = load<Record<number, KkOut>>("kkbox.json", {});
  const targets = songs.filter((s) => !(s.id in out));
  console.log(`KKBOX: ${targets.length} 曲`);
  const search = async (q: string) => {
    const r = await get(
      `https://api.kkbox.com/v1.1/search?${new URLSearchParams({ q, type: "track", territory: "JP", limit: "30" })}`,
      { headers: { authorization: `Bearer ${tok.access_token}` } },
    );
    return (((await r.json()) as any).tracks?.data ?? []) as any[];
  };
  for (const [i, s] of targets.entries()) {
    try {
      const t = norm(s.title);
      const a = norm(firstArtist(s));
      const g = norm(s.game.replace(/\s*[(（][^)）]*[)）]\s*$/, "")).slice(0, 6);
      const b = norm(s.brand);
      const titleOk = (x: any) => {
        const n = norm(x.name);
        const bare = norm(x.name.replace(/\s*[(（\[［~～〜-].*$/, ""));
        return (
          (n === t || bare === t) &&
          !/(off ?vocal|instrumental|karaoke|カラオケ|inst\b|tv ?size|short)/i.test(x.name)
        );
      };
      const score = (x: any) => {
        const ar = norm(x.album?.artist?.name ?? "");
        const al = norm(x.album?.name ?? "");
        return (
          (a.length >= 2 && (ar.includes(a) || al.includes(a)) ? 4 : 0) +
          (g.length >= 2 && al.includes(g) ? 3 : 0) +
          (b.length >= 2 && (ar.includes(b) || al.includes(b)) ? 2 : 0)
        );
      };
      let res = (await search(`${s.title} ${firstArtist(s)}`.trim())).filter(titleOk);
      if (!res.length) {
        await sleep(250);
        res = (await search(s.title)).filter(titleOk);
      }
      const best = res.map((x) => [score(x), x] as const).sort((x, y) => y[0] - x[0])[0];
      out[s.id] =
        best && (best[0] > 0 || s.stream.awa + s.stream.spotify + s.stream.apple > 0)
          ? {
              url: best[1].url,
              isrc: best[1].isrc,
              artwork: best[1].album?.images?.find((im: any) => im.width === 500)?.url,
              name: best[1].name,
              artist: best[1].album?.artist?.name ?? "",
              album: best[1].album?.name ?? "",
            }
          : null;
    } catch (e) {
      console.warn(`  ! ${s.title}: ${(e as Error).message}`);
    }
    if (i % 50 === 49) {
      save("kkbox.json", out);
      console.log(
        `  ${i + 1}/${targets.length} (見つかった: ${Object.values(out).filter(Boolean).length})`,
      );
    }
    await sleep(250);
  }
  save("kkbox.json", out);
}

// ---------- ytfix: 信用できる動画がない曲を、ゲーム名入りで探し直す ----------
async function stageYtFix() {
  const apple = load<Record<number, AppleOut>>("apple.json", {});
  const kkbox = load<Record<number, KkOut>>("kkbox.json", {});
  const yt = load<Record<number, YtOut>>("youtube.json", {});
  const ytTopic = load<Record<number, YtOut>>("youtube-topic.json", {});
  const out = load<Record<number, YtOut>>("youtube-fix.json", {});
  const ok = (s: Song, v: YtOut) => v && ytTrusted(s, v, apple[s.id], kkbox[s.id]);
  const targets = songs.filter(
    (s) => !(s.id in out) && !ok(s, ytTopic[s.id]) && !ok(s, yt[s.id]),
  );
  console.log(`YouTube 探し直し: ${targets.length} 曲`);
  for (const [i, s] of targets.entries()) {
    try {
      const game = s.game.replace(/\s*[(（][^)）]*[)）]\s*$/, "");
      const t = norm(s.title);
      const pick = (res: Awaited<ReturnType<typeof ytSearch>>) =>
        res
          .slice(0, 15)
          .filter((v) => norm(v.title).includes(t) && ytTrusted(s, v, apple[s.id], kkbox[s.id]))
          .sort((x, y) => Number(/ - topic$/i.test(y.channel)) - Number(/ - topic$/i.test(x.channel)))[0];
      let hit = pick(await ytSearch(`${s.title} ${game}`));
      if (!hit && firstArtist(s)) {
        await sleep(2000);
        hit = pick(await ytSearch(`${s.title} ${firstArtist(s)} ${game.slice(0, 10)}`));
      }
      out[s.id] = hit ?? null;
    } catch (e) {
      console.warn(`  ! ${s.title}: ${(e as Error).message}`);
    }
    if (i % 25 === 24) {
      save("youtube-fix.json", out);
      console.log(`  ${i + 1}/${targets.length} (見つかった: ${Object.values(out).filter(Boolean).length})`);
    }
    await sleep(2000);
  }
  save("youtube-fix.json", out);
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
  // CSV の配信情報は古いので全曲探す（配信○△の曲は曲名一致だけで、それ以外は歌手も一致したものだけ採用）
  const targets = songs.filter((s) => !odesli[s.id]?.spotify && !(s.id in out));
  console.log(`Spotify API: ${targets.length} 曲`);
  for (const [i, s] of targets.entries()) {
    const q = `track:${s.title}${firstArtist(s) ? ` artist:${firstArtist(s)}` : ""}`;
    const r = await get(
      `https://api.spotify.com/v1/search?${new URLSearchParams({ q, type: "track", market: "JP", limit: "10" })}`,
      {
        headers: { authorization: `Bearer ${tok.access_token}` },
      },
    );
    let j = (await r.json()) as { tracks?: { items: any[] } };
    if (!j.tracks?.items.length && firstArtist(s)) {
      await sleep(300);
      const r2 = await get(
        `https://api.spotify.com/v1/search?${new URLSearchParams({ q: `track:${s.title}`, type: "track", market: "JP", limit: "20" })}`,
        { headers: { authorization: `Bearer ${tok.access_token}` } },
      );
      j = (await r2.json()) as { tracks?: { items: any[] } };
    }
    const t = norm(s.title);
    const a = norm(firstArtist(s));
    const titleOk = (x: any) =>
      (norm(x.name) === t || norm(x.name.replace(/\s*[-(（].*$/, "")) === t) &&
      !/(off ?vocal|instrumental|karaoke|カラオケ)/i.test(x.name);
    const artistOk = (x: any) =>
      a.length > 0 &&
      x.artists?.some((ar: any) => norm(ar.name).includes(a) || a.includes(norm(ar.name)));
    const hit =
      j.tracks?.items.find((x) => titleOk(x) && artistOk(x)) ??
      (s.stream.spotify > 0 ? j.tracks?.items.find(titleOk) : undefined);
    out[s.id] = hit
      ? { url: hit.external_urls.spotify, artwork: hit.album?.images?.[0]?.url }
      : null;
    if (i % 50 === 49) {
      save("spotify.json", out);
      console.log(
        `  ${i + 1}/${targets.length} (見つかった: ${Object.values(out).filter(Boolean).length})`,
      );
    }
    await sleep(300);
  }
  save("spotify.json", out);
}

// ---------- YouTube 動画が本当にその曲か ----------
// 曲名だけ一致する別の曲・カバーを避けるため、歌手名・ゲーム名・ブランド名のどれかが
// 動画タイトルかチャンネル名に入っていることを求める。Topic チャンネルは歌手がローマ字表記なので、
// Apple Music / KKBOX で分かった歌手名とも照らし合わせる。
function ytTrusted(
  s: Song,
  y: NonNullable<YtOut>,
  apple?: AppleOut,
  kk?: { artist: string } | null,
) {
  const nt = norm(y.title);
  const nc = norm(y.channel.replace(/ - topic$/i, ""));
  const a = norm(firstArtist(s));
  const g = norm(s.game.replace(/\s*[(（][^)）]*[)）]\s*$/, "")).slice(0, 6);
  const b = norm(s.brand);
  if (/(off ?vocal|instrumental|karaoke|カラオケ|歌ってみた|cover|弾いてみた|ゆっくり|ピッチ|stepmania|譜面|maimai|osu)/i.test(y.title))
    return false;
  if (a.length >= 2 && (nt.includes(a) || nc.includes(a))) return true;
  if (g.length >= 2 && nt.includes(g)) return true;
  if (b.length >= 2 && (nc.includes(b) || nt.includes(b))) return true;
  const known = [apple?.artistName, kk?.artist].filter(Boolean).map((x) => norm(x!));
  if (nc.length >= 2 && known.some((k) => k.includes(nc) || nc.includes(k))) return true;
  // レーベル配信の「Release - Topic」は、配信があると分かっている曲だけ信用する
  if (/^release - topic$/i.test(y.channel) && (apple || kk)) return true;
  return false;
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
  const yt = load<Record<number, YtOut>>("youtube.json", {});
  const ytTopic = load<Record<number, YtOut>>("youtube-topic.json", {});
  const kkbox = load<Record<number, KkOut>>("kkbox.json", {});
  const ytFix = load<Record<number, YtOut>>("youtube-fix.json", {});
  const links: Record<number, Record<string, string>> = {};
  for (const s of songs) {
    const l: Record<string, string> = {};
    const a = apple[s.id];
    if (a?.track) l.apple = a.track;
    if (a?.album) l.album = a.album;
    if (a?.artwork) l.artwork = a.artwork;
    Object.assign(l, odesli[s.id] ?? {});
    if (a?.track) l.apple = a.track; // jp ストアの URL を優先
    const kk = kkbox[s.id];
    if (kk) {
      l.kkbox = kk.url;
      if (!l.artwork && kk.artwork) l.artwork = kk.artwork;
    }
    const sp = spotify[s.id];
    if (sp && !l.spotify) l.spotify = sp.url;
    if (sp?.artwork && !l.artwork) l.artwork = sp.artwork;
    // 公式音源が見つかっていればそちらを優先（サイト内再生・YouTube Music の直リンク）
    const y = [ytTopic[s.id], yt[s.id], ytFix[s.id]].find(
      (v) => v && ytTrusted(s, v, apple[s.id], kkbox[s.id]),
    );
    if (y) {
      l.yt = y.id; // サイト内再生用の動画ID
      l.youtube ??= `https://www.youtube.com/watch?v=${y.id}`;
      // 「- Topic」チャンネルはレーベルの公式音源なので YouTube Music でもそのまま聴ける
      if (ytTopic[s.id] || / - topic$|トピック$/i.test(y.channel))
        l.ytmusic ??= `https://music.youtube.com/watch?v=${y.id}`;
    }
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
if (stage === "youtube" || stage === "all") await stageYoutube();
if (stage === "yttopic" || stage === "all") await stageYtTopic();
if (stage === "kkbox" || stage === "all") await stageKkbox();
if (stage === "ytfix" || stage === "all") await stageYtFix();
stageWrite();
