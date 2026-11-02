import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Disc3,
  Gamepad2,
  Building2,
  Mic2,
  Search,
  X,
  ListMusic,
  Music2,
  Play,
  Headphones,
} from "lucide-react";
import {
  songs,
  matchScope,
  scopeLabel,
  type ScopeKind,
  categoryGroups,
  categoryGroup,
  groupBy,
  streamCount,
  type Song,
} from "./lib/songs";
import { normalize } from "./lib/search";
import { TrackList } from "./components/TrackList";
import { GroupGrid } from "./components/GroupGrid";
import { SongDetail } from "./components/SongDetail";
import { NowBar, VideoBox } from "./components/NowBar";
import { usePlayer, playable } from "./lib/player";

export type View = "tracks" | "games" | "brands" | "artists";
export type Scope = { kind: ScopeKind; name: string } | null;
type Sort = "random" | "new" | "old" | "title";

const index = songs.map((s) =>
  normalize(
    [s.title, s.vocal, s.game, s.brand, s.composer, s.lyrics, s.arranger, s.album].join("\u0001"),
  ),
);

const nav: { key: View; label: string; icon: typeof Disc3 }[] = [
  { key: "tracks", label: "全曲", icon: ListMusic },
  { key: "games", label: "ゲーム", icon: Gamepad2 },
  { key: "brands", label: "ブランド", icon: Building2 },
  { key: "artists", label: "アーティスト", icon: Mic2 },
];

const firstArtist = (s: Song) => s.vocal.split(" / ")[0] ?? "";
const songById = new Map(songs.map((s) => [s.id, s]));
const views: View[] = ["tracks", "games", "brands", "artists"];
const sorts: Sort[] = ["random", "new", "old", "title"];
/** ページを開くたびに変わるランダム順（絞り込んでも並びは保つ） */
const shuffleKey = new Map(songs.map((s) => [s.id, Math.random()]));

/** URL ⇔ 画面の状態。?view=games / ?by=composer&name=… / &song=12 / &q=… / &cat=OP,ED / &sort=old / &stream=1 / &play=1 */
type UrlState = {
  view: View;
  scope: Scope;
  song: Song | null;
  query: string;
  cats: string[];
  sort: Sort;
  onlyStream: boolean;
  onlyPlayable: boolean;
};
function readUrl(): UrlState {
  const p = new URLSearchParams(location.search);
  const by = p.get("by") as ScopeKind | null;
  const name = p.get("name");
  const view = p.get("view") as View | null;
  const sort = p.get("sort") as Sort | null;
  return {
    view: view && views.includes(view) ? view : "tracks",
    scope: by && by in scopeLabel && name ? { kind: by, name } : null,
    song: songById.get(Number(p.get("song"))) ?? null,
    query: p.get("q") ?? "",
    cats: p.get("cat")?.split(",").filter(Boolean) ?? [],
    sort: sort && sorts.includes(sort) ? sort : "random",
    onlyStream: p.get("stream") === "1",
    onlyPlayable: p.get("play") === "1",
  };
}
function toUrl(st: UrlState) {
  const p = new URLSearchParams();
  if (st.scope) {
    p.set("by", st.scope.kind);
    p.set("name", st.scope.name);
  } else if (st.view !== "tracks") p.set("view", st.view);
  if (st.query) p.set("q", st.query);
  if (st.cats.length) p.set("cat", st.cats.join(","));
  if (st.sort !== "random") p.set("sort", st.sort);
  if (st.onlyStream) p.set("stream", "1");
  if (st.onlyPlayable) p.set("play", "1");
  if (st.song) p.set("song", String(st.song.id));
  const qs = p.toString();
  return location.pathname + (qs ? `?${qs}` : "");
}
const initial = readUrl();
const brandOptions = groupBy(songs, (s) => s.brand);

export default function App() {
  const [view, setView] = useState<View>(initial.view);
  const [scope, setScope] = useState<Scope>(initial.scope);
  const [query, setQuery] = useState(initial.query);
  const [cats, setCats] = useState<string[]>(initial.cats);
  const [onlyStream, setOnlyStream] = useState(initial.onlyStream);
  const [onlyPlayable, setOnlyPlayable] = useState(initial.onlyPlayable);
  const player = usePlayer();
  const [sort, setSort] = useState<Sort>(initial.sort);
  const [selected, setSelected] = useState<Song | null>(initial.song);
  const [detailOpen, setDetailOpen] = useState(Boolean(initial.song));

  // 状態を URL に書き出す。ページ（一覧・絞り込み・曲）が変わったら履歴に積み、検索語などは置き換え
  const dock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dock.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      document.documentElement.style.setProperty("--dock-h", `${el.offsetHeight}px`),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const navKey = useRef("");
  const fromPop = useRef(false);
  useEffect(() => {
    const song = detailOpen ? selected : null;
    const url = toUrl({ view, scope, song, query, cats, sort, onlyStream, onlyPlayable });
    const key = `${view}|${scope?.kind}|${scope?.name}|${song?.id}`;
    if (url !== location.pathname + location.search) {
      if (fromPop.current || !navKey.current || key === navKey.current)
        history.replaceState(null, "", url);
      else history.pushState(null, "", url);
    }
    navKey.current = key;
    fromPop.current = false;
    document.title = [
      song?.title,
      scope?.name ?? (view !== "tracks" ? nav.find((n) => n.key === view)?.label : ""),
      "vnmusic",
    ]
      .filter(Boolean)
      .join(" - ");
  }, [view, scope, selected, detailOpen, query, cats, sort, onlyStream, onlyPlayable]);
  useEffect(() => {
    const onPop = () => {
      const st = readUrl();
      fromPop.current = true;
      setView(st.view);
      setScope(st.scope);
      setQuery(st.query);
      setCats(st.cats);
      setSort(st.sort);
      setOnlyStream(st.onlyStream);
      setOnlyPlayable(st.onlyPlayable);
      if (st.song) setSelected(st.song);
      setDetailOpen(Boolean(st.song));
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const q = useDeferredValue(normalize(query.trim()));

  const searched = useMemo(() => {
    if (!q) return songs;
    const terms = q.split(/\s+/);
    return songs.filter((_, i) => terms.every((t) => index[i].includes(t)));
  }, [q]);

  const tracks = useMemo(() => {
    let list = searched;
    if (scope) {
      list = list.filter((s) => matchScope(s, scope.kind, scope.name));
    }
    if (cats.length) list = list.filter((s) => cats.includes(categoryGroup(s.category)));
    if (onlyStream) list = list.filter((s) => streamCount(s) > 0);
    if (onlyPlayable) list = list.filter(playable);
    list = [...list].sort((a, b) =>
      sort === "random"
        ? shuffleKey.get(a.id)! - shuffleKey.get(b.id)!
        : sort === "title"
          ? a.title.localeCompare(b.title, "ja")
          : sort === "new"
            ? b.release.localeCompare(a.release) || a.game.localeCompare(b.game, "ja")
            : a.release.localeCompare(b.release) || a.game.localeCompare(b.game, "ja"),
    );
    return list;
  }, [searched, scope, cats, onlyStream, onlyPlayable, sort]);

  const groups = useMemo(() => {
    if (view === "games") return groupBy(searched, (s) => s.game);
    if (view === "brands") return groupBy(searched, (s) => s.brand);
    if (view === "artists") return groupBy(searched, firstArtist);
    return [];
  }, [view, searched]);

  const go = (v: View) => {
    setView(v);
    setScope(null);
    scrollRef.current?.scrollTo({ top: 0 });
  };
  const openScope = (sc: NonNullable<Scope>) => {
    setScope(sc);
    // 狭い画面では詳細が一覧を覆っているので閉じて結果を見せる
    if (matchMedia("(max-width: 1023px)").matches) setDetailOpen(false);
    setView("tracks");
    setQuery("");
    setCats([]);
    scrollRef.current?.scrollTo({ top: 0 });
  };
  // 次の曲に進んだら、開いている詳細もその曲に切り替える
  const currentId = player.current?.id;
  useEffect(() => {
    if (player.current && detailOpen) setSelected(player.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // 一覧で曲を押したら再生。再生できない曲と広い画面では詳細も開く
  const select = (s: Song) => {
    setSelected(s);
    if (playable(s)) player.play(s, tracks);
    if (!playable(s) || matchMedia("(min-width: 1024px)").matches) setDetailOpen(true);
  };

  const heading = scope
    ? {
        label: scopeLabel[scope.kind],
        title: scope.name,
      }
    : view === "tracks"
      ? { label: "プレイリスト", title: "ギャルゲソング 全曲" }
      : { label: "ライブラリ", title: nav.find((n) => n.key === view)!.label };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:px-5">
        <button
          onClick={() => {
            // トップは何も絞り込んでいない全曲（URL もクエリなし）
            go("tracks");
            setQuery("");
            setCats([]);
            setOnlyStream(false);
            setOnlyPlayable(false);
            setSort("random");
            setDetailOpen(false);
          }}
          className="flex shrink-0 items-center gap-2 text-lg font-bold"
          title="全曲"
        >
          <Disc3 className="size-6 text-accent" />
          vnmusic
        </button>
        <nav className="flex items-center gap-1">
          {nav
            .filter((n) => n.key !== "tracks")
            .map((n) => (
              <button
                key={n.key}
                onClick={() => go(n.key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  view === n.key && !scope
                    ? "bg-white text-black"
                    : "text-muted hover:bg-elev hover:text-white"
                }`}
              >
                <n.icon className="size-4 max-sm:hidden" />
                {n.label}
              </button>
            ))}
        </nav>
        <label className="ml-auto flex h-10 w-full max-w-sm items-center gap-2 rounded-full bg-elev px-4 ring-white/20 focus-within:ring-2 max-md:order-last max-md:max-w-none">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="曲名・ゲーム・ブランド・歌手・作曲者で検索"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="クリア">
              <X className="size-4 text-muted hover:text-white" />
            </button>
          )}
        </label>
      </header>
      <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2 max-md:p-0">
        {/* Main */}
        <main
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-y-auto rounded-xl bg-panel max-md:rounded-none"
        >
          <section
            className="px-4 pt-6 pb-5 md:px-6"
            style={{
              background:
                "linear-gradient(180deg, rgba(139,123,255,.28), rgba(255,111,174,.06) 70%, transparent)",
            }}
          >
            <p className="text-xs font-semibold text-muted">{heading.label}</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight break-words md:text-4xl">
              {heading.title}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {view === "tracks"
                ? `${tracks.length.toLocaleString()} 曲`
                : `${groups.length.toLocaleString()} 件`}
              {view === "tracks" && tracks.some(playable) && (
                <button
                  onClick={() => player.play(tracks.find(playable)!, tracks)}
                  className="ml-3 inline-flex items-center gap-1 rounded-full bg-accent px-4 py-1 text-xs font-bold text-black hover:brightness-110"
                >
                  <Play className="size-3.5" />
                  まとめて再生
                </button>
              )}
              {scope && (
                <button
                  onClick={() => setScope(null)}
                  className="ml-3 rounded-full border border-line px-3 py-0.5 text-xs text-white hover:bg-elev"
                >
                  全曲に戻る
                </button>
              )}
            </p>
          </section>

          {view === "tracks" ? (
            <>
              <div className="flex flex-wrap items-center gap-2 px-4 pb-3 md:px-6">
                {categoryGroups.map((c) => {
                  const on = cats.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => setCats(on ? cats.filter((x) => x !== c) : [...cats, c])}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${on ? "bg-white text-black" : "bg-elev text-white hover:bg-line"}`}
                    >
                      {c}
                    </button>
                  );
                })}
                <button
                  onClick={() => setOnlyStream(!onlyStream)}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
                    onlyStream ? "bg-accent text-black" : "bg-elev text-white hover:bg-line"
                  }`}
                >
                  <Music2 className="size-3" />
                  配信あり
                </button>
                <button
                  onClick={() => setOnlyPlayable(!onlyPlayable)}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
                    onlyPlayable ? "bg-accent text-black" : "bg-elev text-white hover:bg-line"
                  }`}
                >
                  <Headphones className="size-3" />
                  ここで聴ける
                </button>
                <select
                  value={scope?.kind === "brand" ? scope.name : ""}
                  onChange={(e) =>
                    e.target.value
                      ? openScope({ kind: "brand", name: e.target.value })
                      : setScope(null)
                  }
                  className="ml-auto max-w-44 rounded-full bg-elev px-3 py-1 text-xs font-semibold outline-none"
                  aria-label="ブランドで絞り込み"
                >
                  <option value="">すべてのブランド</option>
                  {brandOptions.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}（{b.songs.length}）
                    </option>
                  ))}
                </select>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="rounded-full bg-elev px-3 py-1 text-xs font-semibold outline-none"
                >
                  <option value="random">ランダム</option>
                  <option value="new">発売日が新しい順</option>
                  <option value="old">発売日が古い順</option>
                  <option value="title">曲名順</option>
                </select>
              </div>
              <TrackList
                songs={tracks}
                scrollRef={scrollRef}
                selectedId={selected?.id}
                onSelect={select}
                onPlay={(s) => player.play(s, tracks)}
                playingId={player.current?.id}
                onScope={openScope}
              />
            </>
          ) : (
            <GroupGrid
              key={`${view}:${q}`}
              groups={groups}
              kind={view === "games" ? "game" : view === "brands" ? "brand" : "artist"}
              onOpen={openScope}
            />
          )}
          <div className="h-28" />
        </main>

        {/* Detail */}
        {selected && detailOpen && (
          <SongDetail
            song={selected}
            onClose={() => setDetailOpen(false)}
            onScope={openScope}
            onPlay={(s) => player.play(s, tracks.includes(s) ? tracks : [s])}
          />
        )}
      </div>

      <VideoBox />
      {/* 下のバー（プレーヤー＋スマホ用ナビ）。詳細画面はこの高さを空けて重ねる */}
      <div ref={dock}>
        <NowBar
          song={selected}
          onOpen={() => {
            if (player.current) setSelected(player.current);
            setDetailOpen(true);
          }}
        />
      </div>
    </div>
  );
}
