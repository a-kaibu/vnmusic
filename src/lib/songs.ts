import raw from "../data/songs.json";
import rawLinks from "../data/links.json";
import rawGames from "../data/games.json";

export type Flag = 0 | 1 | 2;
export type Song = {
  id: number;
  rank: number | null;
  title: string;
  votes: number;
  points: number;
  vocal: string;
  lyrics: string;
  composer: string;
  arranger: string;
  game: string;
  brand: string;
  release: string;
  category: string;
  album: string;
  stream: Record<ServiceKey, Flag>;
  karaoke: Record<"dam" | "joysound" | "karatetsu" | "pasela", Flag>;
  note: string;
  aggNote: string;
  prev: { y2021: number | null; y2020: number | null; y2019: number | null };
};

export type ServiceKey = "spotify" | "apple" | "ytmusic" | "amazon" | "mora" | "awa" | "fanza";

export const songs = raw as Song[];

/** scripts/enrich.ts が収集した直リンク (曲ID → サービス → URL) */
export type SongLinks = Partial<Record<ServiceKey | "youtube", string>> & {
  artwork?: string;
  album?: string;
};
export const links = rawLinks as Record<string, SongLinks>;
/** ゲーム名 → 公式サイト / ジャケット */
export type GameInfo = { official?: string; officialAlive?: boolean; cover?: string };
export const games = rawGames as Record<string, GameInfo>;

export const artworkOf = (s: Song) => links[s.id]?.artwork ?? games[s.game]?.cover;

/** 検索キーワード: 曲名 + 歌唱者(括弧内の別名は除く) */
export const searchQuery = (s: Song) => {
  const artist =
    s.vocal
      .split(" / ")[0]
      ?.replace(/[（(].*?[)）]/g, "")
      .trim() ?? "";
  return [s.title, artist].filter(Boolean).join(" ");
};

type Service = {
  key: ServiceKey | "youtube";
  name: string;
  color: string;
  url: (q: string) => string | null;
};

const e = encodeURIComponent;
export const services: Service[] = [
  {
    key: "spotify",
    name: "Spotify",
    color: "#1ed760",
    url: (q) => `https://open.spotify.com/search/${e(q)}`,
  },
  {
    key: "apple",
    name: "Apple Music",
    color: "#fa4565",
    url: (q) => `https://music.apple.com/jp/search?term=${e(q)}`,
  },
  {
    key: "ytmusic",
    name: "YouTube Music",
    color: "#ff3b30",
    url: (q) => `https://music.youtube.com/search?q=${e(q)}`,
  },
  {
    key: "amazon",
    name: "Amazon Music",
    color: "#25d1da",
    url: (q) => `https://music.amazon.co.jp/search/${e(q)}`,
  },
  {
    key: "mora",
    name: "mora",
    color: "#4aa3ff",
    url: (q) => `https://mora.jp/search/top?keyWord=${e(q)}`,
  },
  { key: "awa", name: "AWA", color: "#f5a524", url: (q) => `https://s.awa.fm/search/${e(q)}` },
  {
    key: "fanza",
    name: "FANZA",
    color: "#e0457b",
    url: (q) => `https://www.dmm.co.jp/search/=/searchstr=${e(q)}/`,
  },
  {
    key: "youtube",
    name: "YouTube",
    color: "#ff0033",
    url: (q) => `https://www.youtube.com/results?search_query=${e(q)}`,
  },
];

export const streamCount = (s: Song) => Object.values(s.stream).filter((v) => v > 0).length;

export const year = (s: Song) => s.release.slice(0, 4);

/** カテゴリを大分類に寄せる */
export const categoryGroup = (c: string) => {
  if (/^TVアニメ|劇場版/.test(c)) return "アニメ";
  if (/OP/.test(c)) return "OP";
  if (/ED/.test(c)) return "ED";
  if (/挿入歌/.test(c)) return "挿入歌";
  if (/BGM/.test(c)) return "BGM";
  if (/キャラソン/.test(c)) return "キャラソン";
  return "その他";
};
export const categoryGroups = ["OP", "ED", "挿入歌", "BGM", "キャラソン", "アニメ", "その他"];

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
/** ゲームタイトルから決定的にジャケット風グラデーションを作る */
export const coverStyle = (key: string) => {
  const h = hash(key);
  const a = h % 360;
  const b = (a + 40 + ((h >> 9) % 80)) % 360;
  const ang = (h >> 3) % 360;
  return {
    background: `linear-gradient(${ang}deg, hsl(${a} 70% 55%), hsl(${b} 65% 30%))`,
  };
};

export type Group = { name: string; songs: Song[]; best: number; votes: number };
export const groupBy = (list: Song[], key: (s: Song) => string): Group[] => {
  const m = new Map<string, Song[]>();
  for (const s of list) {
    const k = key(s);
    if (!k) continue;
    (m.get(k) ?? m.set(k, []).get(k)!).push(s);
  }
  return [...m]
    .map(([name, ss]) => ({
      name,
      songs: ss,
      best: Math.min(...ss.map((s) => s.rank ?? 99999)),
      votes: ss.reduce((a, s) => a + s.votes, 0),
    }))
    .sort((x, y) => y.votes - x.votes || x.best - y.best);
};
