// CSV (data/votes.csv) → src/data/songs.json
// 実行: node scripts/convert.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

mkdirSync(new URL("../src/data/", import.meta.url), { recursive: true });
writeFileSync(new URL("../src/data/songs.json", import.meta.url), JSON.stringify(songs));
console.log(`${songs.length} songs written`);
