import { useEffect, useRef, useState } from "react";
import { type Group, games, artworkOf, year, artistImage, brandImage } from "../lib/songs";
import type { Scope } from "../App";
import { Cover } from "./Cover";

type Props = {
  groups: Group[];
  kind: NonNullable<Scope>["kind"];
  onOpen: (s: NonNullable<Scope>) => void;
};
const PAGE = 60;

export function GroupGrid({ groups, kind, onOpen }: Props) {
  const [n, setN] = useState(PAGE);
  // 一番下が見えてきたら続きを読み込む（無限スクロール）
  const sentinel = useRef<HTMLDivElement>(null);
  const more = n < groups.length;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more) return;
    const io = new IntersectionObserver((es) => es[0]?.isIntersecting && setN((x) => x + PAGE), {
      rootMargin: "800px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [more, n]);

  if (!groups.length)
    return <p className="px-6 py-16 text-center text-muted">該当するものがありません</p>;

  return (
    <div className="px-4 md:px-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {groups.slice(0, n).map((g) => {
          const first = g.songs[0];
          const art =
            kind === "game"
              ? (games[first.gameKey]?.cover ?? artworkOf(first))
              : kind === "brand"
                ? brandImage(g.name, g.songs)
                : artistImage(g.name, g.songs);
          const sub =
            kind === "game"
              ? `${first.brand} ・ ${year(first)}`
              : kind === "brand"
                ? `${new Set(g.songs.map((s) => s.game)).size}作品`
                : g.songs[0].vocal;
          return (
            <button
              key={g.name}
              onClick={() => onOpen({ kind, name: g.name })}
              className="group flex flex-col justify-start self-start rounded-lg p-2.5 text-left transition hover:bg-elev"
            >
              {art ? (
                <img
                  src={art}
                  alt=""
                  loading="lazy"
                  className={`aspect-square w-full bg-elev shadow-lg ${
                    kind === "artist"
                      ? "rounded-full object-cover object-top"
                      : kind === "brand" && art.includes("img/brand/")
                        ? "rounded-md object-contain"
                        : "rounded-md object-cover object-top"
                  }`}
                />
              ) : (
                <Cover
                  seed={kind === "game" ? g.name : `${kind}:${g.name}`}
                  label={g.name}
                  className={`aspect-square w-full text-4xl shadow-lg ${kind === "artist" ? "rounded-full" : "rounded-md"}`}
                />
              )}
              <p className="mt-2 line-clamp-2 text-sm font-semibold">{g.name}</p>
              <p className="truncate text-xs text-muted">{sub}</p>
              <p className="text-xs text-muted">{g.songs.length}曲</p>
            </button>
          );
        })}
      </div>
      {more && <div ref={sentinel} className="h-10" aria-hidden />}
    </div>
  );
}
