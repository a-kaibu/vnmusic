// CSV (data/votes.csv) → src/data/songs.json
// 実行: node scripts/convert.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import Papa from "papaparse";

const csv = readFileSync(new URL("../data/votes.csv", import.meta.url), "utf8");
const { data: rows } = Papa.parse<string[]>(csv, { skipEmptyLines: false });

// 1行目・2行目はヘッダー
const C = {
  rank: 0,
  title: 1,
  votes: 3,
  points: 6,
  vocal: 20,
  lyrics: 21,
  composer: 22,
  arranger: 23,
  game: 24,
  brand: 25,
  release: 26,
  category: 27,
  album: 28,
  itunes: 29,
  ytmusic: 30,
  amazon: 31,
  mora: 32,
  fanza: 33,
  awa: 34,
  spotify: 35,
  other: 36,
  dam: 37,
  joysound: 38,
  karatetsu: 39,
  pasela: 40,
  note: 41,
  prev2021: 42,
  prev2020: 43,
  prev2019: 44,
  aggNote: 18,
} as const;

const clean = (s: string | undefined) => (s ?? "").replace(/\r/g, "").trim();
const multi = (s: string | undefined) =>
  clean(s)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" / ");
// ○ = 配信あり, △ = 一部(Short Ver.など), 空 = 情報なし
const flag = (s: string | undefined): 0 | 1 | 2 => {
  const v = clean(s);
  if (v === "○" || v === "◯") return 2;
  if (v === "△") return 1;
  return 0;
};
const prev = (s: string | undefined) => {
  const v = clean(s);
  const n = Number(v);
  return Number.isFinite(n) && v !== "" ? n : null;
};

const songs = rows
  .slice(2)
  .filter((r) => clean(r[C.title]))
  .map((r, i) => ({
    id: i + 1,
    rank: Number(clean(r[C.rank])) || null,
    title: clean(r[C.title]),
    votes: Number(clean(r[C.votes])) || 0,
    points: Number(clean(r[C.points])) || 0,
    vocal: multi(r[C.vocal]),
    lyrics: multi(r[C.lyrics]),
    composer: multi(r[C.composer]),
    arranger: multi(r[C.arranger]),
    game: multi(r[C.game]),
    brand: multi(r[C.brand]),
    release: clean(r[C.release]),
    category: clean(r[C.category]),
    album: multi(r[C.album]),
    stream: {
      spotify: flag(r[C.spotify]),
      apple: flag(r[C.itunes]),
      ytmusic: flag(r[C.ytmusic]),
      amazon: flag(r[C.amazon]),
      mora: flag(r[C.mora]),
      awa: flag(r[C.awa]),
      fanza: flag(r[C.fanza]),
    },
    karaoke: {
      dam: flag(r[C.dam]),
      joysound: flag(r[C.joysound]),
      karatetsu: flag(r[C.karatetsu]),
      pasela: flag(r[C.pasela]),
    },
    note: multi(r[C.note]),
    aggNote: multi(r[C.aggNote]),
    prev: { y2021: prev(r[C.prev2021]), y2020: prev(r[C.prev2020]), y2019: prev(r[C.prev2019]) },
  }));

// 2023年以降のゲームの曲（scripts/recent.ts が集めたもの）を後ろに足す。
// iTunes で見つかった曲は ID = trackId、YouTube の動画タイトルから拾った曲は ID = ゲームと曲名のハッシュ
const cache = (name: string) => {
  const f = new URL(`../data/cache/${name}`, import.meta.url);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
};
type RecentGame = {
  egs?: string;
  vndb: string;
  game: string;
  brand: string;
  release: string;
  tracks?: { trackId: number; title: string; artist: string; album: string; category: string }[];
};
type YtSong = { title: string; artist: string; category: string };
const recentGames: RecentGame[] = Object.values(cache("recent.json") as Record<string, RecentGame>);
const ytSongs = cache("recent-yt.json") as Record<string, YtSong[]>;
const siteSongs = cache("recent-site.json") as Record<string, YtSong[]>;
const staffSongs = cache("recent-staff-songs.json") as Record<
  string,
  (YtSong & { romaji?: string; apple?: { trackId: number; album: string } })[]
>;
const key = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s・\-‐―ー~〜～!！?？、。,.'"『』「」()（）☆★♪]/g, "");
const hash = (s: string) => {
  let h = 0xcbf29ce484222325n;
  for (const c of new TextEncoder().encode(s))
    h = ((h ^ BigInt(c)) * 0x100000001b3n) & 0xffffffffffn;
  return 1e12 + Number(h);
};

// ---------- 批評空間 (data/cache/egs-music.json, `node scripts/enrich.ts egsmusic`) ----------
// 2023年以降の曲の日本語の曲名・歌手・作詞作曲編曲と、CSV の空欄のクレジットを補う
type EgsMusic = {
  name: string;
  furigana: string;
  vocal: boolean;
  release: string;
  singer: string[];
  lyrics: string[];
  composer: string[];
  arranger: string[];
  album: string;
};
type EgsCache = {
  music: Record<string, EgsMusic>;
  games: Record<
    string,
    { name: string; brand: string; brandKind: string; model: string; sellday: string; erogame: boolean; vndb: string }
  >;
  gameMusic: [string, string, string][];
};
const egs = cache("egs-music.json") as Partial<EgsCache>;
const egsGames = egs.games ?? {};
const egsMusic = egs.music ?? {};
const egsByGame = new Map<string, { id: string; category: string; m: EgsMusic }[]>();
for (const [mid, gid, category] of egs.gameMusic ?? []) {
  const m = egsMusic[mid];
  if (!m) continue;
  (egsByGame.get(gid) ?? egsByGame.set(gid, []).get(gid)!).push({ id: mid, category, m });
}
const egsByName = new Map<string, string[]>();
for (const [gid, g] of Object.entries(egsGames))
  (egsByName.get(key(g.name)) ?? egsByName.set(key(g.name), []).get(key(g.name))!).push(gid);
const egsByVndb = new Map(
  Object.entries(egsGames)
    .filter(([, g]) => g.vndb)
    .map(([gid, g]) => [g.vndb, gid]),
);
const egsByDay = new Map<string, string[]>();
for (const [gid, g] of Object.entries(egsGames))
  (egsByDay.get(g.sellday) ?? egsByDay.set(g.sellday, []).get(g.sellday)!).push(gid);
const gameCache = cache("games.json") as Record<string, { egs?: string; vndb?: string }>;
/** ゲーム名・発売日・ブランドから批評空間のゲームIDを探す */
const egsGameId = (game: string, release: string, brand: string) => {
  if (gameCache[game]?.egs) return gameCache[game].egs;
  // 批評空間のゲームには VNDB の ID が入っていることが多い
  const vndb = egsByVndb.get(gameCache[game]?.vndb ?? "");
  if (vndb) return vndb;
  const day = release.replace(/\//g, "-");
  const cands = egsByName.get(key(game)) ?? [];
  const byName =
    cands.find((g) => egsGames[g].sellday === day) ??
    cands.find((g) => key(egsGames[g].brand) === key(brand)) ??
    (cands.length === 1 ? cands[0] : undefined);
  if (byName) return byName;
  // 副題や表記ゆれで名前が合わないときは、同じ発売日・同じブランドの中で名前が一番近いもの
  const sameDay = (egsByDay.get(day) ?? []).filter((g) => key(egsGames[g].brand) === key(brand));
  const best = sameDay
    .map((g) => ({ g, score: similarity(key(game), key(egsGames[g].name)) }))
    .sort((a, b) => b.score - a.score)[0];
  return best && (best.score >= 0.4 || sameDay.length === 1) ? best.g : undefined;
};
// 批評空間のクリエイター名は「rino(CooRie、MEGUMI、うらん)」のように別名が括弧で付くので、
// CSV に同じ表記がなければ括弧を外す（アーティスト別の一覧で CSV の曲とまとまるように）
const csvPeople = new Set(
  songs.flatMap((s) => [s.vocal, s.lyrics, s.composer, s.arranger].flatMap((v) => v.split(" / "))),
);
const person = (n: string) => {
  if (csvPeople.has(n)) return n;
  const bare = n.replace(/\s*[(（][^)）]*[)）]\s*$/, "").trim();
  return bare || n;
};
const names = (list: string[]) => [...new Set(list.map(person))].join(" / ");
// VNDB のローマ字の曲名と批評空間のフリガナを照合するため、カナをローマ字にしてゆるく比べる
const kana: Record<string, string> = Object.fromEntries(
  (
    "ア a イ i ウ u エ e オ o カ ka キ ki ク ku ケ ke コ ko サ sa シ shi ス su セ se ソ so タ ta チ chi ツ tsu テ te ト to " +
    "ナ na ニ ni ヌ nu ネ ne ノ no ハ ha ヒ hi フ fu ヘ he ホ ho マ ma ミ mi ム mu メ me モ mo ヤ ya ユ yu ヨ yo " +
    "ラ ra リ ri ル ru レ re ロ ro ワ wa ヰ i ヱ e ヲ o ン n ガ ga ギ gi グ gu ゲ ge ゴ go ザ za ジ ji ズ zu ゼ ze ゾ zo " +
    "ダ da ヂ ji ヅ zu デ de ド do バ ba ビ bi ブ bu ベ be ボ bo パ pa ピ pi プ pu ペ pe ポ po ヴ vu " +
    "ァ a ィ i ゥ u ェ e ォ o ャ ya ュ yu ョ yo ヮ wa"
  )
    .split(" ")
    .reduce<[string, string][]>((a, v, i, arr) => (i % 2 ? a : [...a, [v, arr[i + 1]]]), []),
);
const romaji = (s: string) => {
  let out = "";
  const k = s.normalize("NFKC").replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  for (let i = 0; i < k.length; i++) {
    const c = k[i];
    const next = k[i + 1];
    if (c === "ッ") {
      out += (kana[next] ?? "").charAt(0);
      continue;
    }
    if (c === "ー") continue;
    let r = kana[c] ?? c.toLowerCase();
    // キャ・シュ・チョなど
    if (next && "ャュョ".includes(next) && r.endsWith("i")) {
      r = (r === "shi" || r === "chi" || r === "ji" ? r.slice(0, -1) : r.slice(0, -1) + "y") + kana[next].slice(-1);
      i++;
    } else if (next && "ァィゥェォ".includes(next) && r.length > 1) {
      r = r.slice(0, -1) + kana[next];
      i++;
    }
    out += r;
  }
  return looseRomaji(out);
};
const looseRomaji = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/m(?=[bp])/g, "n")
    .replace(/wo/g, "o")
    .replace(/(?<=[aiueo])[aiueoh]+/g, "") // 長音 (ou / uu / oo / oh) とつなぎの母音をまとめる
    .replace(/du/g, "zu");
const consonants = (s: string) =>
  looseRomaji(s)
    .replace(/l/g, "r")
    .replace(/v/g, "b")
    .replace(/c(?!h)/g, "k")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/th/g, "s")
    .replace(/[aeiouy]/g, "")
    .replace(/(.)\1+/g, "$1");
const egsSongsFor = (gid: string | undefined) =>
  (gid ? (egsByGame.get(gid) ?? []) : []).filter((x) => x.m.vocal);
const findEgs = (list: ReturnType<typeof egsSongsFor>, title: string, roma?: string) =>
  list.find((x) => key(x.m.name) === key(title)) ??
  list.find((x) => {
    const r = romaji(x.m.furigana);
    return r.length >= 3 && [title, roma].some((t) => t && looseRomaji(t) === r);
  });
/** 0〜1 の文字列の近さ（レーベンシュタイン距離から） */
const similarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
};
type Unresolved = { title: string; romaji?: string; artist: string; category: string };
/** ローマ字の曲名と批評空間の曲名・フリガナの近さ (0〜1) */
const nameScore = (x: ReturnType<typeof egsSongsFor>[number], t: Unresolved) =>
  Math.max(
    similarity(looseRomaji(t.romaji ?? t.title), romaji(x.m.furigana)),
    similarity(looseRomaji(t.title), looseRomaji(x.m.name)),
    // 英語の曲名とカナの読み（Colorful / カラフル）は子音だけで比べる
    similarity(consonants(t.romaji ?? t.title), consonants(romaji(x.m.furigana))) * 0.9,
  );
const fallbackEgs = (list: ReturnType<typeof egsSongsFor>, t: Unresolved) => {
  // 英語の曲名とカナの読みのように綴りが離れていても、歌手と区分が同じ曲が1つだけなら同じ曲とみなす
  // （VNDB の「主題歌」は批評空間では OP のことが多い）
  // 批評空間に歌手が入っていない曲は歌手では絞れないので候補に残す
  const sameSinger = list.filter(
    (x) =>
      !x.m.singer.length ||
      x.m.singer
        .map(person)
        .some((n) => key(n) && key(t.artist) && (key(t.artist).includes(key(n)) || key(n).includes(key(t.artist)))),
  );
  const theme = /主題歌|テーマ|OP/;
  const same = sameSinger.filter(
    (x) => x.category === t.category || (theme.test(t.category) && theme.test(x.category)),
  );
  return same.length === 1 ? same[0] : undefined;
};

// CSV で空欄の歌手・作詞・作曲・編曲を補う
let filled = 0;
for (const s of songs) {
  if (s.vocal && s.lyrics && s.composer && s.arranger) continue;
  const e = findEgs(egsByGame.get(egsGameId(s.game, s.release, s.brand) ?? "") ?? [], s.title);
  if (!e) continue;
  const before = JSON.stringify(s);
  s.vocal ||= names(e.m.singer);
  s.lyrics ||= names(e.m.lyrics);
  s.composer ||= names(e.m.composer);
  s.arranger ||= names(e.m.arranger);
  if (JSON.stringify(s) !== before) filled++;
}
const seen = new Set(songs.map((s) => `${key(s.game).slice(0, 4)}|${key(s.title)}`));
const off = { spotify: 0, apple: 0, ytmusic: 0, amazon: 0, mora: 0, awa: 0, fanza: 0 } as const;
type Item = YtSong & {
  id: number;
  album: string;
  apple: boolean;
  romaji?: string;
  lyrics?: string;
  composer?: string;
  arranger?: string;
  egs?: boolean;
};
// 配信リンク（src/data/links.json、曲IDがキー）がある曲は、重複をまとめるときにその ID を残す
const linkFile = new URL("../src/data/links.json", import.meta.url);
const linked = new Set(existsSync(linkFile) ? Object.keys(JSON.parse(readFileSync(linkFile, "utf8"))) : []);
const hasLink = (t: Item) => t.apple || linked.has(String(t.id));
const isAscii = (s: string) => /^[ -~]+$/.test(s);
// VNDB の一覧になかった 2023年以降の成人向け PC ゲーム（企業ブランド）で、批評空間に歌入りの曲があるもの
const recentEgs = new Set(
  recentGames.map((g) => egsByVndb.get(g.vndb) ?? egsGameId(g.game, g.release, g.brand)),
);
const recentVndb = new Set(recentGames.map((g) => g.vndb));
const csvGames = new Set(songs.map((s) => egsGameId(s.game, s.release, s.brand)));
// 批評空間のブランド名（「ALICESOFT」「Liar-soft(ビジネスパートナー)」など）は、
// CSV・VNDB で同じブランドのゲームがあればその表記にそろえ、なければ末尾の括弧を外す
const brandNames = new Map<string, string>();
const addBrand = (gid: string | undefined, brand: string) => {
  const b = gid && egsGames[gid]?.brand;
  if (b && !brandNames.has(b)) brandNames.set(b, brand);
};
for (const s of songs) addBrand(egsGameId(s.game, s.release, s.brand), s.brand);
for (const g of recentGames)
  addBrand(egsByVndb.get(g.vndb) ?? egsGameId(g.game, g.release, g.brand), g.brand);
const brandOf = (b: string) => brandNames.get(b) ?? (b.replace(/\s*[(（][^)）]*[)）]\s*$/, "") || b);
for (const [gid, g] of Object.entries(egsGames)) {
  if (g.sellday < "2023-01-01" || g.sellday > new Date().toISOString().slice(0, 10)) continue;
  if (g.brandKind !== "CORPORATION" || g.model !== "PC" || !g.erogame) continue;
  if (recentEgs.has(gid) || csvGames.has(gid) || recentVndb.has(g.vndb) || !egsSongsFor(gid).length) continue;
  recentGames.push({
    vndb: `egs${gid}`,
    egs: gid,
    game: g.name,
    brand: brandOf(g.brand),
    release: g.sellday.replace(/-/g, "/"),
  });
}
recentGames.sort((a, b) => a.release.localeCompare(b.release));
const egsFields = (e: { category: string; m: EgsMusic }) => ({
  title: e.m.name,
  artist: names(e.m.singer),
  category: e.category,
  album: e.m.album,
  lyrics: names(e.m.lyrics),
  composer: names(e.m.composer),
  arranger: names(e.m.arranger),
  egs: true,
});
const recent = recentGames.flatMap((g) => {
  const hashed = (t: YtSong): Item => ({
    ...t,
    id: hash(`${g.vndb}|${key(t.title)}`),
    album: "",
    apple: false,
  });
  // VNDB のスタッフ欄（歌手・区分が確か）→ iTunes → YouTube → 公式サイトの順に、同じ曲は情報を補い合う
  const items: Item[] = [
    ...(staffSongs[g.vndb] ?? []).map((t) =>
      t.apple ? { ...t, id: t.apple.trackId, album: t.apple.album, apple: true } : hashed(t),
    ),
    ...(g.tracks ?? []).map((t) => ({ ...t, id: t.trackId, apple: true })),
    ...(ytSongs[g.vndb] ?? []).map(hashed),
    ...(siteSongs[g.vndb] ?? []).map(hashed),
  ];
  const merged = new Map<string, Item>();
  for (const t of items) {
    const k = `${key(g.game).slice(0, 4)}|${key(t.title)}`;
    if (seen.has(k)) continue;
    const prev = merged.get(k);
    if (!prev) merged.set(k, { ...t });
    else {
      if (!prev.apple && t.apple) Object.assign(prev, { id: t.id, album: t.album, apple: true });
      prev.artist ||= t.artist;
      prev.category ||= t.category;
    }
  }
  // 批評空間にこのゲームの曲があれば、曲名（日本語）・歌手・作詞作曲編曲はそちらを使う。
  // ローマ字のまま残った VNDB の曲は、読みの近さ・歌手と区分で批評空間の曲に割り当てる
  const egsList = egsSongsFor(g.egs ?? egsByVndb.get(g.vndb) ?? egsGameId(g.game, g.release, g.brand));
  const used = new Map<string, Item>();
  const apply = (t: Item, e: (typeof egsList)[number]) => {
    used.set(e.id, t);
    const f = egsFields(e);
    Object.assign(t, { ...f, artist: f.artist || t.artist, album: t.album || f.album });
  };
  const unresolved: [string, Item][] = [];
  for (const [k, t] of merged) {
    const e = findEgs(egsList, t.title, t.romaji);
    if (e) apply(t, e);
    else if (t.romaji && t.romaji === t.title && isAscii(t.title)) unresolved.push([k, t]);
  }
  // まず読みが近いものを割り当てる。近い曲がすでに使われていれば重複なので外す
  const rest: typeof unresolved = [];
  for (const [k, t] of unresolved) {
    const best = egsList
      .map((x) => ({ x, score: nameScore(x, t) }))
      .sort((a, b) => b.score - a.score)[0];
    if (!best || best.score < 0.6) rest.push([k, t]);
    else if (used.has(best.x.id)) {
      // 重複。配信リンクが見つかっていた方の ID を残す
      const keep = used.get(best.x.id)!;
      if (hasLink(t) && !hasLink(keep))
        Object.assign(keep, { id: t.id, album: keep.album || t.album, apple: t.apple });
      merged.delete(k);
    } else apply(t, best.x);
  }
  for (const [k, t] of rest) {
    const e = fallbackEgs(egsList.filter((x) => !used.has(x.id)), t);
    if (e) apply(t, e);
  }
  for (const e of egsList)
    if (!used.has(e.id))
      merged.set(`egs|${e.id}`, { ...egsFields(e), id: hash(`egs|${e.id}`), apple: false });
  // 曲名を直したことで同じ曲になったものをまとめる（配信リンクがある方の ID を優先）
  const songsOf = new Map<string, Item>();
  for (const t of merged.values()) {
    const k = `${key(g.game).slice(0, 4)}|${key(t.title)}`;
    if (seen.has(k)) continue;
    const prev = songsOf.get(k);
    if (!prev) songsOf.set(k, t);
    else if (hasLink(t) && !hasLink(prev))
      Object.assign(prev, { id: t.id, album: prev.album || t.album, apple: t.apple });
  }
  for (const k of songsOf.keys()) seen.add(k);
  return [...songsOf.values()].map((t) => ({
    id: t.id,
    rank: null,
    title: t.title,
    votes: 0,
    points: 0,
    vocal: t.egs ? t.artist : t.artist.replace(/\s*[&、,]\s*/g, " / "),
    lyrics: t.lyrics ?? "",
    composer: t.composer ?? "",
    arranger: t.arranger ?? "",
    game: g.game,
    brand: g.brand,
    release: g.release,
    category: t.category,
    album: t.album ? (t.album.startsWith("『") ? t.album : `『${t.album}』`) : "",
    stream: { ...off, apple: t.apple ? (2 as const) : (0 as const) },
    karaoke: { dam: 0, joysound: 0, karatetsu: 0, pasela: 0 },
    note: "",
    aggNote: "",
    prev: { y2021: null, y2020: null, y2019: null },
  }));
});

// 残りの批評空間の曲（全年代・BGM も含む）。CSV や上で足したゲームの曲は、そのゲーム名・ブランドにまとめる
const today = new Date().toISOString().slice(0, 10);
const placed = new Map<string, { game: string; brand: string; release: string }>();
for (const s of [...songs, ...recent]) {
  const gid = egsGameId(s.game, s.release, s.brand);
  if (gid && !placed.has(gid)) placed.set(gid, { game: s.game, brand: s.brand, release: s.release });
}
for (const g of recentGames) {
  const gid = g.egs ?? egsByVndb.get(g.vndb) ?? egsGameId(g.game, g.release, g.brand);
  if (gid && !placed.has(gid)) placed.set(gid, g);
}
const usedIds = new Set([...songs, ...recent].map((s) => s.id));
const rest = Object.entries(egsGames)
  .filter(([, g]) => g.sellday && g.sellday <= today)
  .sort(([, a], [, b]) => a.sellday.localeCompare(b.sellday))
  .flatMap(([gid, eg]) => {
    const g = placed.get(gid) ?? {
      game: eg.name,
      brand: brandOf(eg.brand),
      release: eg.sellday.replace(/-/g, "/"),
    };
    return (egsByGame.get(gid) ?? []).flatMap((e) => {
      const k = `${key(g.game).slice(0, 4)}|${key(e.m.name)}`;
      if (seen.has(k)) return [];
      seen.add(k);
      // 同じ曲が別のゲームにも入っているときは ID が重ならないようにゲームIDも混ぜる
      let id = hash(`egs|${e.id}`);
      if (usedIds.has(id)) id = hash(`egs|${e.id}|${gid}`);
      usedIds.add(id);
      const f = egsFields(e);
      return [
        {
          id,
          rank: null,
          title: f.title,
          votes: 0,
          points: 0,
          vocal: f.artist,
          lyrics: f.lyrics,
          composer: f.composer,
          arranger: f.arranger,
          game: g.game,
          brand: g.brand,
          release: g.release,
          category: f.category,
          album: f.album ? `『${f.album}』` : "",
          stream: { ...off },
          karaoke: { dam: 0, joysound: 0, karatetsu: 0, pasela: 0 },
          note: "",
          aggNote: "",
          prev: { y2021: null, y2020: null, y2019: null },
        },
      ];
    });
  });

mkdirSync(new URL("../src/data/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../src/data/songs.json", import.meta.url),
  JSON.stringify([...songs, ...recent, ...rest], null, 2) + "\n",
);
console.log(
  `${songs.length} songs + ${recent.length} recent songs + ${rest.length} songs from 批評空間 written`,
);
console.log(`批評空間: CSV の ${filled} 曲のクレジットを補完 / 2023年以降 ${recent.filter((s) => s.lyrics || s.composer).length} 曲に作詞作曲`);
