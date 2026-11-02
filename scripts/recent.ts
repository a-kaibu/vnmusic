// 投票CSV（2023年9月発売分まで）に入っていない、2023年以降のゲームの曲を集める。
//
//   node scripts/recent.ts vndb     … VNDB から 2023年以降に発売された成人向けPCゲーム（企業ブランド）を取得
//   node scripts/recent.ts itunes   … 各ゲームのタイトルで iTunes Search API を検索し、主題歌・挿入歌などのボーカル曲を拾う
//   node scripts/recent.ts pick     … 保存済みの検索結果から曲を選び直す（data/cache/recent-itunes.json、git管理外）
//   node scripts/recent.ts          … vndb → itunes
//
// 結果は data/cache/recent.json に保存（途中で止めても再開できる）。
// Apple Music のリンクは data/cache/apple.json、ゲームの公式サイト・ジャケットは data/cache/games.json にも書き込むので、
// このあと `node scripts/convert.ts` → `node scripts/enrich.ts alive` → `node scripts/enrich.ts youtube` を実行する。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import Papa from "papaparse";

const root = new URL("../", import.meta.url);
const cacheDir = new URL("data/cache/", root);
mkdirSync(cacheDir, { recursive: true });
const load = <T>(name: string, fallback: T): T => {
  const f = new URL(name, cacheDir);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fallback;
};
const save = (name: string, v: unknown) =>
  writeFileSync(new URL(name, cacheDir), JSON.stringify(v, null, 1));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FROM = "2023-01-01";
const today = new Date().toISOString().slice(0, 10);

const norm = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s\-‐―ー~〜～・:：!！?？、。,.'"“”‘’『』「」【】()（）[\]＜＞<>☆★♪]/g, "");

async function get(url: string, init?: RequestInit, tries = 4): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
      if (r.status === 429 || r.status === 403 || r.status >= 500)
        throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i >= tries) throw e;
      const wait = 5000 * 2 ** i;
      console.warn(`  retry in ${wait / 1000}s: ${(e as Error).message}`);
      await sleep(wait);
    }
  }
}

export type RecentTrack = {
  trackId: number;
  title: string;
  artist: string;
  album: string;
  category: string;
  release: string;
  track: string;
  albumUrl: string;
  artwork?: string;
};
export type RecentGame = {
  vndb: string;
  game: string;
  brand: string;
  release: string;
  official?: string;
  cover?: string;
  /** iTunes を検索済みなら曲の配列（見つからなければ空） */
  tracks?: RecentTrack[];
};
type Store = Record<string, RecentGame>;

// CSV に既にあるゲームは対象外にする（2023年1〜9月発売分の重複を避ける）
function csvGames() {
  const csv = readFileSync(new URL("data/votes.csv", root), "utf8");
  const { data } = Papa.parse<string[]>(csv);
  return new Set(
    data
      .slice(2)
      .map((r) => norm((r[24] ?? "").replace(/\s*[(（][^)）]*[)）]\s*$/, "")))
      .filter(Boolean),
  );
}

// CSV に出てくる歌手（ギャルゲソングの歌い手）。略称で当たったときの裏付けに使う
const singers = (() => {
  const csv = readFileSync(new URL("data/votes.csv", root), "utf8");
  const { data } = Papa.parse<string[]>(csv);
  return new Set(
    data
      .slice(2)
      .flatMap((r) => (r[20] ?? "").split(/\n|\s*[\/&、,]\s*/))
      .map((x) => norm(x.replace(/[（(].*?[)）]/g, "")))
      .filter((x) => x.length >= 2),
  );
})();

// ---------- vndb ----------
type VndbVn = {
  id: string;
  title: string;
  alttitle: string | null;
  released: string;
  votecount: number;
  image: { url: string; sexual: number } | null;
  developers: { name: string; original: string | null; type: string }[];
};

async function vndb(path: string, body: unknown) {
  const r = await get(`https://api.vndb.org/kana/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`VNDB HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as { results: any[]; more: boolean };
}

async function stageVndb() {
  const out = load<Store>("recent.json", {});
  const known = csvGames();
  const vns: VndbVn[] = [];
  for (let page = 1; ; page++) {
    const j = await vndb("vn", {
      filters: [
        "and",
        ["released", ">=", FROM],
        ["released", "<=", today],
        ["olang", "=", "ja"],
        ["developer", "=", ["type", "=", "co"]],
        [
          "release",
          "=",
          ["and", ["minage", "=", 18], ["platform", "=", "win"], ["official", "=", 1]],
        ],
      ],
      fields:
        "title,alttitle,released,votecount,image.url,image.sexual,developers.name,developers.original,developers.type",
      results: 100,
      page,
      sort: "released",
    });
    vns.push(...j.results);
    if (!j.more) break;
    await sleep(1000);
  }
  const fresh = vns.filter((v) => !out[v.id] && !known.has(norm(v.alttitle ?? v.title)));
  console.log(
    `VNDB: ${vns.length} 作品 (${FROM}〜) / CSVと重複 ${vns.filter((v) => known.has(norm(v.alttitle ?? v.title))).length} / 新規 ${fresh.length}`,
  );
  // 公式サイトはリリース情報の extlinks から取る（50作品ずつ）
  for (let i = 0; i < fresh.length; i += 50) {
    const chunk = fresh.slice(i, i + 50);
    const sites = new Map<string, string>();
    for (let page = 1; ; page++) {
      const j = await vndb("release", {
        filters: [
          "and",
          ["vn", "=", ["or", ...chunk.map((v) => ["id", "=", v.id])]],
          ["official", "=", 1],
        ],
        fields: "released,vns.id,extlinks.name,extlinks.url",
        results: 100,
        page,
        sort: "released",
      });
      for (const r of j.results) {
        const site = (r.extlinks as { name: string; url: string }[]).find(
          (l) => l.name === "website" && !l.url.includes("web.archive.org"),
        )?.url;
        if (!site) continue;
        for (const v of r.vns as { id: string }[]) if (!sites.has(v.id)) sites.set(v.id, site);
      }
      if (!j.more) break;
      await sleep(1000);
    }
    for (const v of chunk) {
      const dev = v.developers.find((d) => d.type === "co") ?? v.developers[0];
      out[v.id] = {
        vndb: v.id,
        game: (v.alttitle ?? v.title).trim(),
        brand: (dev?.original ?? dev?.name ?? "").trim(),
        release: v.released.replace(/-/g, "/"),
        official: sites.get(v.id),
        cover: v.image && v.image.sexual < 2 ? v.image.url : undefined,
      };
    }
    save("recent.json", out);
    await sleep(1000);
  }
  save("recent.json", out);
}

// ---------- itunes ----------
// 別バージョン（インスト・カラオケ・ショート・ライブなど）は除く
const variant =
  /(off ?vocal|instrumental|inst\.?\b|karaoke|カラオケ|game ?size|tv ?size|short|ショート|without|backing|live|ライブ|remix|リミックス|acoustic|piano|ピアノ|ver\.|version|mix\b|bgm)/i;
const stripParen = (s: string) =>
  s.replace(/\s*[(（\[［〈<-]\s*[^)）\]］〉>]*[)）\]］〉>]?\s*$/, "").trim() || s;

function categoryOf(text: string) {
  if (/グランド ?エンディング|grand ?(ed|ending)/i.test(text)) return "グランドED";
  if (/オープニング|\bop\b|opening/i.test(text)) return "OP";
  if (/エンディング|\bed\b|ending/i.test(text)) return "ED";
  if (/挿入歌/.test(text)) return "挿入歌";
  if (/キャラ(クター)?ソング|キャラソン/i.test(text)) return "キャラソン";
  if (/イメージソング/.test(text)) return "イメージソング";
  if (/主題歌|テーマ/.test(text)) return "主題歌";
  return "";
}

async function itunes(term: string) {
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ term, country: "jp", media: "music", entity: "song", limit: "200", lang: "ja_jp" })}`;
  const r = await get(url);
  if (!r.ok) throw new Error(`iTunes HTTP ${r.status}`);
  const keep = [
    "kind",
    "trackId",
    "collectionId",
    "trackName",
    "artistName",
    "collectionName",
    "releaseDate",
    "trackCount",
    "primaryGenreName",
    "trackViewUrl",
    "collectionViewUrl",
    "artworkUrl100",
  ];
  return (((await r.json()) as { results?: any[] }).results ?? []).map((x) =>
    Object.fromEntries(keep.map((k) => [k, x[k]])),
  );
}

function pickTracks(g: RecentGame, res: any[]): RecentTrack[] {
  const gn = norm(g.game);
  // 「〇〇 -サブタイトル-」は先頭部分でも照合する（短すぎる・英字だけの略称は誤爆するので使わない）
  const short = norm(g.game.split(/[\s　\-－～~〜]/)[0] ?? "");
  const jp = /[\u3040-\u30ff\u4e00-\u9fff]/;
  const shortOk = short !== gn && short.length >= (jp.test(short) ? 3 : 8);
  const keys = [gn, ...(shortOk ? [short] : [])];
  const brand = norm(g.brand);
  // ゲームの曲らしいアルバム名
  const hint =
    /サウンドトラック|サントラ|soundtrack|ost\b|主題歌|オープニング|エンディング|\bop\b|\bed\b|ボーカル|vocal|テーマ|ゲーム|game|キャラクター|character|挿入歌|ソング/i;
  const day = new Date(g.release.replace(/\//g, "-")).getTime();
  // 曲名がゲーム名と同じときは、ゲームの曲らしい裏付けを求める（同名の別の曲を除く）
  const backed = (r: any) =>
    (hint.test(r.collectionName ?? "") && !/ - (single|ep)$/i.test(r.collectionName ?? "")) ||
    /cv[.:：]/i.test(r.artistName ?? "") ||
    singers.has(norm(r.artistName ?? ""));
  const hits = res.filter((r) => {
    const c = norm(r.collectionName ?? "");
    const t = norm(r.trackName ?? "");
    const when = new Date(r.releaseDate).getTime();
    return (
      r.kind === "song" &&
      // 正式タイトルで当たる / 略称がアルバム名にあり、ゲームの曲らしい / 曲名に略称があり、歌い手がギャルゲ歌手
      ((gn.length >= 6 && c.includes(gn) && (!t.includes(gn) || backed(r))) ||
        (shortOk &&
          c.includes(short) &&
          (hint.test(r.collectionName ?? "") || /cv[.:：]/i.test(r.artistName ?? ""))) ||
        (keys.some((k) => t.includes(k) || c.includes(k)) &&
          singers.has(norm(r.artistName ?? "")))) &&
      // 日本語の曲名・名義・アルバム名を含むものだけ（同じ綴りの海外曲を除く）
      jp.test(`${r.trackName}${r.artistName}${r.collectionName}`) &&
      when >= day - 400 * 864e5 &&
      when <= day + 3 * 365 * 864e5 &&
      r.primaryGenreName !== "カラオケ" &&
      !variant.test((r.trackName ?? "").replace(stripParen(r.trackName ?? ""), ""))
    );
  });
  // サントラの BGM を除く: ブランド名義の曲、アルバムの大半を占める名義（作曲者）の曲
  const byAlbum = new Map<number, any[]>();
  for (const r of hits) byAlbum.set(r.collectionId, [...(byAlbum.get(r.collectionId) ?? []), r]);
  const bgmArtists = new Map<number, Set<string>>();
  for (const r of res) {
    if (!byAlbum.has(r.collectionId) || (r.trackCount ?? 0) < 10) continue;
    const m = bgmArtists.get(r.collectionId) ?? new Set();
    bgmArtists.set(r.collectionId, m);
  }
  for (const [cid, set] of bgmArtists) {
    const all = res.filter((r) => r.collectionId === cid);
    const count = new Map<string, number>();
    for (const r of all) count.set(r.artistName, (count.get(r.artistName) ?? 0) + 1);
    for (const [a, n] of count)
      if (n >= Math.max(5, all.length * 0.35) && !/cv/i.test(a)) set.add(a);
  }
  const seen = new Map<string, RecentTrack>();
  for (const r of hits) {
    const a = norm(r.artistName ?? "");
    if (brand && (a === brand || a.includes(brand))) continue;
    if (bgmArtists.get(r.collectionId)?.has(r.artistName)) continue;
    const title = stripParen(r.trackName);
    const k = norm(title);
    if (!k) continue;
    const small = (r.trackCount ?? 99) <= 6;
    const t: RecentTrack = {
      trackId: r.trackId,
      title,
      artist: r.artistName,
      album: r.collectionName,
      category: categoryOf(r.trackName) || (small ? categoryOf(r.collectionName) : ""),
      release: (r.releaseDate ?? "").slice(0, 10).replace(/-/g, "/"),
      track: (r.trackViewUrl ?? "").replace(/[?&]uo=\d+/, ""),
      albumUrl: (r.collectionViewUrl ?? "").replace(/[?&]uo=\d+/, ""),
      artwork: r.artworkUrl100?.replace("100x100bb", "600x600bb"),
    };
    const prev = seen.get(k);
    // 同じ曲は先に出たシングルを優先し、区分は分かっている方を残す
    if (!prev || t.release < prev.release)
      seen.set(k, { ...t, category: t.category || prev?.category || "" });
    else if (!prev.category && t.category) prev.category = t.category;
  }
  return [...seen.values()];
}

async function stageItunes() {
  const out = load<Store>("recent.json", {});
  const targets = Object.values(out).filter((g) => !g.tracks || process.argv.includes("--retry"));
  const raw = load<Record<string, any[]>>("recent-itunes.json", {});
  console.log(`iTunes 検索: ${targets.length} 作品 (3 秒間隔)`);
  for (const [i, g] of targets.entries()) {
    try {
      // 正式タイトルと略称の両方で検索し、生の結果も保存しておく（絞り込み条件を変えたら pick で再計算）
      const res = raw[g.vndb] ?? (await itunes(g.game));
      const short = g.game.split(/[\s　\-－～~〜]/)[0];
      if (!raw[g.vndb] && short && short !== g.game && short.length >= 3) {
        await sleep(3000);
        const ids = new Set(res.map((r) => r.trackId));
        res.push(...(await itunes(short)).filter((r) => !ids.has(r.trackId)));
      }
      raw[g.vndb] = res;
      g.tracks = pickTracks(g, res);
    } catch (e) {
      console.warn(`  ! ${g.game}: ${(e as Error).message}`);
    }
    if (i % 10 === 9) {
      save("recent.json", out);
      save("recent-itunes.json", raw);
      const n = Object.values(out).reduce((x, y) => x + (y.tracks?.length ?? 0), 0);
      console.log(`  ${i + 1}/${targets.length} (曲 ${n})`);
    }
    await sleep(3000);
  }
  save("recent.json", out);
  save("recent-itunes.json", raw);
  syncCaches(out);
}

// enrich.ts のキャッシュにも反映して、ジャケット・公式サイト・配信リンクを既存曲と同じ仕組みで出す
function syncCaches(out: Store) {
  const apple = load<Record<string, unknown>>("apple.json", {});
  const games = load<Record<string, Record<string, unknown>>>("games.json", {});
  const yt = load<Record<string, YtSong[]>>("recent-yt.json", {});
  let songs = 0;
  for (const g of Object.values(out)) {
    if (!g.tracks?.length && !yt[g.vndb]?.length) continue;
    games[g.game] ??= { vndb: g.vndb, egs: "", official: g.official, cover: g.cover };
    if (!g.tracks) continue;
    for (const t of g.tracks) {
      songs++;
      apple[t.trackId] = {
        track: t.track,
        album: t.albumUrl,
        artwork: t.artwork,
        trackName: t.title,
        artistName: t.artist,
        collectionName: t.album,
      };
    }
  }
  save("apple.json", apple);
  save("games.json", games);
  console.log(`  ${songs} 曲 / ${Object.values(out).filter((g) => g.tracks?.length).length} 作品`);
}

// ---------- youtube: 配信されていない曲を、OPムービーや試聴動画のタイトル・説明文から拾う ----------
export type YtSong = { title: string; artist: string; category: string; from: string };
type YtVideo = { id: string; title: string; channel: string; snippet: string };

async function ytSearch(q: string): Promise<YtVideo[]> {
  const r = await get(
    `https://www.youtube.com/results?${new URLSearchParams({ search_query: q, hl: "ja", gl: "JP" })}`,
    { headers: { "user-agent": "Mozilla/5.0", "accept-language": "ja" } },
  );
  const json = (await r.text()).match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/)?.[1];
  if (!json) throw new Error("ytInitialData not found");
  const found: YtVideo[] = [];
  const text = (x: any) => x?.runs?.map((y: any) => y.text).join("") ?? x?.simpleText ?? "";
  const walk = (o: any) => {
    if (!o || typeof o !== "object") return;
    if (o.videoRenderer?.videoId) {
      const v = o.videoRenderer;
      found.push({
        id: v.videoId,
        title: text(v.title),
        channel: text(v.ownerText),
        snippet: text(v.detailedMetadataSnippets?.[0]?.snippetText),
      });
      return;
    }
    for (const k in o) walk(o[k]);
  };
  walk(JSON.parse(json));
  return found.slice(0, 15);
}

const catWord =
  "グランド\\s?エンディング|グランドED|オープニング(?:テーマ)?|エンディング(?:テーマ)?|主題歌|挿入歌|OP|ED|テーマソング|イメージソング";
const quoteSong = new RegExp(
  `(${catWord})\\s*(?:曲|テーマ|ソング)?\\s*[：:]?\\s*[「『“"]([^」』”"]{1,40})[」』”"]`,
  "gi",
);
const singerRe = /(?:歌|Vocal|ボーカル|唄)\s*[：:]\s*([^\s　、,，/／|｜()（）【】「」]{1,30})/i;

function pickYt(g: RecentGame, videos: YtVideo[]): YtSong[] {
  const gn = norm(g.game);
  const short = norm(g.game.split(/[\s　\-－～~〜]/)[0] ?? "");
  const jp = /[぀-ヿ一-鿿]/;
  const keys = [gn, ...(short !== gn && short.length >= (jp.test(short) ? 3 : 8) ? [short] : [])];
  const brand = norm(g.brand);
  const songs = new Map<string, YtSong>();
  const has = (s: string) => keys.some((k) => norm(s).includes(k));
  const add = (raw: string, artist: string, cat: string, from: string) => {
    raw = raw.trim().replace(/^[「『“"]+/, "");
    // 「曲名」歌手 / 曲名/歌手 のように歌手が混ざったもの
    const split = raw.match(/^(.+?)\s*(?:[」』”"]|\s[\/／]\s|[\/／])\s*(.*)$/);
    if (split) {
      raw = split[1];
      artist ||= split[2];
    }
    raw = raw.replace(/\s*(OP|ED)(\s*full)?\s*$/i, "").trim();
    if (/\b(OP|ED)\b|^(PS\d|PSV|Switch|NS|Steam|PC|Full)$/i.test(raw)) return;
    artist = artist
      .replace(/^(歌唱|歌|Vocal|唄)\s*[：:]?\s*/i, "")
      .replace(/(作詞|作曲|編曲).*$/, "")
      .replace(/[」』”"]/g, "")
      .trim();
    if (/^(covered|cover|official|full|ver\.?)$/i.test(artist)) artist = "";
    if (variant.test(raw.replace(stripParen(raw), ""))) return;
    const title = stripParen(raw.trim());
    const k = norm(title);
    if (!k || k.length > 40 || keys.some((x) => k.includes(x) || x.includes(k)) || k === brand)
      return;
    const prev = songs.get(k);
    if (!prev) songs.set(k, { title, artist, category: cat, from });
    else {
      prev.artist ||= artist;
      prev.category ||= cat;
    }
  };
  for (const v of videos) {
    // 【ゲーム名 OP】曲名/歌手
    const a = v.title.match(/【([^】]*)】\s*([^/／【]+?)\s*[\/／]\s*([^\s(（【\[|｜]+)/);
    if (a && has(a[1]) && new RegExp(catWord, "i").test(a[1]))
      add(a[2], a[3], categoryOf(a[1]), v.id);
    // 曲名 / ゲーム名 主題歌
    const b = v.title.match(
      /^(?:【[^】]*】)?\s*([^/／【]+?)\s*[\/／]\s*([^/／]+?)\s*(グランドED|主題歌|OP|ED|オープニング|エンディング|挿入歌)/i,
    );
    if (b && has(b[2])) add(b[1], v.snippet.match(singerRe)?.[1] ?? "", categoryOf(b[3]), v.id);
    for (const text of [v.title, v.snippet]) {
      if (!has(text)) continue;
      for (const m of text.matchAll(quoteSong)) {
        // 「曲名」/歌手 または 歌：歌手
        const after = text.slice((m.index ?? 0) + m[0].length);
        const artist =
          after.match(/^\s*[\/／]\s*([^\s　(（【\[|｜]{1,30})/)?.[1] ??
          (text + " " + v.snippet).match(singerRe)?.[1] ??
          "";
        add(m[2], artist, categoryOf(m[1]), v.id);
      }
    }
  }
  return [...songs.values()].filter((s) => norm(s.artist) !== brand || !brand);
}

async function stageYoutube() {
  const out = load<Store>("recent.json", {});
  const res = load<Record<string, YtSong[]>>("recent-yt.json", {});
  const raw = load<Record<string, YtVideo[]>>("recent-yt-raw.json", {});
  const targets = Object.values(out).filter((g) => !(g.vndb in res));
  console.log(`YouTube 検索: ${targets.length} 作品 (2 秒間隔)`);
  for (const [i, g] of targets.entries()) {
    try {
      if (!raw[g.vndb]) {
        const a = await ytSearch(`${g.game} 主題歌`);
        await sleep(2000);
        const b = await ytSearch(`${g.game} OP ED`);
        const ids = new Set(a.map((v) => v.id));
        raw[g.vndb] = [...a, ...b.filter((v) => !ids.has(v.id))];
      }
      res[g.vndb] = pickYt(g, raw[g.vndb]);
    } catch (e) {
      console.warn(`  ! ${g.game}: ${(e as Error).message}`);
    }
    if (i % 10 === 9) {
      save("recent-yt.json", res);
      save("recent-yt-raw.json", raw);
      const n = Object.values(res).reduce((x, y) => x + y.length, 0);
      console.log(`  ${i + 1}/${targets.length} (曲 ${n})`);
    }
    await sleep(2000);
  }
  save("recent-yt.json", res);
  save("recent-yt-raw.json", raw);
  syncCaches(out);
}

const stage = process.argv[2] ?? "all";
if (stage === "vndb" || stage === "all") await stageVndb();
if (stage === "itunes" || stage === "all") await stageItunes();
if (stage === "youtube" || stage === "all") await stageYoutube();
if (stage === "pick-yt") {
  const out = load<Store>("recent.json", {});
  const raw = load<Record<string, YtVideo[]>>("recent-yt-raw.json", {});
  const res: Record<string, YtSong[]> = {};
  for (const g of Object.values(out)) if (raw[g.vndb]) res[g.vndb] = pickYt(g, raw[g.vndb]);
  save("recent-yt.json", res);
  syncCaches(out);
}
if (stage === "test-yt") {
  const out = load<Store>("recent.json", {});
  for (const name of process.argv.slice(3)) {
    const g = Object.values(out).find((x) => x.game.startsWith(name));
    if (!g) continue;
    const a = await ytSearch(`${g.game} 主題歌`);
    await sleep(2000);
    const b = await ytSearch(`${g.game} OP ED`);
    console.log(g.game, pickYt(g, [...a, ...b]));
    await sleep(2000);
  }
}
if (stage === "sync") syncCaches(load<Store>("recent.json", {}));
if (stage === "pick") {
  const out = load<Store>("recent.json", {});
  const raw = load<Record<string, any[]>>("recent-itunes.json", {});
  for (const g of Object.values(out)) if (raw[g.vndb]) g.tracks = pickTracks(g, raw[g.vndb]);
  save("recent.json", out);
  syncCaches(out);
}
