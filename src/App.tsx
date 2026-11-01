import { useDeferredValue, useMemo, useRef, useState } from "react";
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
import { songs, categoryGroups, categoryGroup, groupBy, streamCount, type Song } from "./lib/songs";
import { normalize } from "./lib/search";
import { TrackList } from "./components/TrackList";
import { GroupGrid } from "./components/GroupGrid";
import { SongDetail } from "./components/SongDetail";
import { NowBar, VideoBox } from "./components/NowBar";
import { usePlayer, playable } from "./lib/player";

export type View = "tracks" | "games" | "brands" | "artists";
export type Scope = { kind: "game" | "brand" | "artist"; name: string } | null;
type Sort = "new" | "old" | "title";

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
const brandOptions = groupBy(songs, (s) => s.brand);

export default function App() {
  const [view, setView] = useState<View>("tracks");
  const [scope, setScope] = useState<Scope>(null);
  const [query, setQuery] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [onlyStream, setOnlyStream] = useState(false);
  const [onlyPlayable, setOnlyPlayable] = useState(false);
  const player = usePlayer();
  const [sort, setSort] = useState<Sort>("new");
  const [selected, setSelected] = useState<Song | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
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
      list = list.filter((s) =>
        scope.kind === "game"
          ? s.game === scope.name
          : scope.kind === "brand"
            ? s.brand === scope.name
            : firstArtist(s) === scope.name,
      );
    }
    if (cats.length) list = list.filter((s) => cats.includes(categoryGroup(s.category)));
    if (onlyStream) list = list.filter((s) => streamCount(s) > 0);
    if (onlyPlayable) list = list.filter(playable);
    list = [...list].sort((a, b) =>
      sort === "title"
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
    setView("tracks");
    setQuery("");
    setCats([]);
    scrollRef.current?.scrollTo({ top: 0 });
  };
  const select = (s: Song) => {
    setSelected(s);
    setDetailOpen(true);
  };

  const heading = scope
    ? {
        label: { game: "ゲーム", brand: "ブランド", artist: "アーティスト" }[scope.kind],
        title: scope.name,
      }
    : view === "tracks"
      ? { label: "プレイリスト", title: "ギャルゲソング 全曲" }
      : { label: "ライブラリ", title: nav.find((n) => n.key === view)!.label };

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 gap-2 p-2 max-md:p-0">
        {/* Sidebar */}
        <aside className="flex w-60 shrink-0 flex-col gap-2 max-md:hidden">
          <div className="rounded-xl bg-panel p-4">
            <div className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Disc3 className="size-6 text-accent" />
              vnmusic
            </div>
            <nav className="flex flex-col gap-1">
              {nav.map((n) => (
                <button
                  key={n.key}
                  onClick={() => go(n.key)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                    view === n.key && !scope ? "bg-elev text-white" : "text-muted hover:text-white"
                  }`}
                >
                  <n.icon className="size-5" />
                  {n.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex-1 overflow-auto rounded-xl bg-panel p-4 text-sm text-muted">
            <p className="mb-3 font-semibold text-white">収録データ</p>
            <dl className="grid grid-cols-2 gap-y-2">
              <dt>楽曲</dt>
              <dd className="text-right text-white tabular-nums">
                {songs.length.toLocaleString()}
              </dd>
              <dt>ゲーム</dt>
              <dd className="text-right text-white tabular-nums">
                {new Set(songs.map((s) => s.game)).size.toLocaleString()}
              </dd>
              <dt>ブランド</dt>
              <dd className="text-right text-white tabular-nums">
                {new Set(songs.map((s) => s.brand)).size.toLocaleString()}
              </dd>
              <dt>配信情報あり</dt>
              <dd className="text-right text-white tabular-nums">
                {songs.filter((s) => streamCount(s) > 0).length}
              </dd>
            </dl>
            <p className="mt-4 text-xs leading-relaxed">
              投票結果CSVをもとに作成。配信状況は2023年7月時点の調査値です。見つかった曲は配信ページへ直接、それ以外は各サービスの検索結果を開きます。
            </p>
          </div>
        </aside>

        {/* Main */}
        <main
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-y-auto rounded-xl bg-panel max-md:rounded-none"
        >
          <header className="sticky top-0 z-20 flex items-center gap-3 bg-panel/85 px-4 py-3 backdrop-blur md:px-6">
            <Disc3 className="size-6 shrink-0 text-accent md:hidden" />
            <label className="flex h-10 w-full max-w-md items-center gap-2 rounded-full bg-elev px-4 ring-white/20 focus-within:ring-2">
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
      <NowBar
        song={selected}
        onOpen={() => {
          if (player.current) setSelected(player.current);
          setDetailOpen(true);
        }}
      />

      {/* Mobile nav */}
      <nav className="grid grid-cols-4 border-t border-line bg-bg md:hidden">
        {nav.map((n) => (
          <button
            key={n.key}
            onClick={() => go(n.key)}
            className={`flex flex-col items-center gap-1 py-2 text-[10px] ${view === n.key && !scope ? "text-white" : "text-muted"}`}
          >
            <n.icon className="size-5" />
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
