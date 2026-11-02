import { useState } from "react";
import { type Group, games, artworkOf, year } from "../lib/songs";
import type { Scope } from "../App";
import { Cover } from "./Cover";

type Props = {
  groups: Group[];
  kind: NonNullable<Scope>["kind"];
  onOpen: (s: NonNullable<Scope>) => void;
};
const PAGE = 120;

export function GroupGrid({ groups, kind, onOpen }: Props) {
  const [n, setN] = useState(PAGE);

  if (!groups.length)
    return <p className="px-6 py-16 text-center text-muted">該当するものがありません</p>;

  return (
    <div className="px-4 md:px-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {groups.slice(0, n).map((g) => {
          const first = g.songs[0];
          const art =
            kind === "game" ? (games[first.gameKey]?.cover ?? artworkOf(first)) : undefined;
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
                  className="aspect-square w-full rounded-md bg-elev object-cover object-top shadow-lg"
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
      {n < groups.length && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setN(n + PAGE)}
            className="rounded-full border border-line px-5 py-2 text-sm font-semibold hover:bg-elev"
          >
            さらに表示（残り {groups.length - n}）
          </button>
        </div>
      )}
    </div>
  );
}
