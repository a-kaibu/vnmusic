import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Clock3 } from "lucide-react";
import { type Song, year, artworkOf } from "../lib/songs";
import type { Scope } from "../App";
import { Cover } from "./Cover";
import { StreamDots } from "./StreamDots";

type Props = {
  songs: Song[];
  scrollRef: RefObject<HTMLDivElement | null>;
  selectedId?: number;
  onSelect: (s: Song) => void;
  onScope: (s: NonNullable<Scope>) => void;
};

const ROW = 60;
const grid =
  "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] md:grid-cols-[3rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,.7fr)_3.5rem_4rem_5.5rem] items-center gap-3";

export function TrackList({ songs, scrollRef, selectedId, onSelect, onScope }: Props) {
  // ヘッダー等の分だけリストの開始位置がずれるので補正
  const listRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    setMargin(listRef.current?.offsetTop ?? 0);
  });
  const v = useVirtualizer({
    count: songs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW,
    overscan: 12,
    scrollMargin: margin,
  });

  if (!songs.length)
    return <p className="px-6 py-16 text-center text-muted">該当する曲がありません</p>;

  return (
    <div className="px-2 md:px-4">
      <div
        className={`${grid} sticky top-16 z-10 border-b border-line bg-panel px-2 py-2 text-xs text-muted md:px-3`}
      >
        <span className="text-right">#</span>
        <span>タイトル</span>
        <span className="max-md:hidden">ゲーム</span>
        <span className="max-md:hidden">ブランド</span>
        <span className="max-md:hidden">
          <Clock3 className="size-3.5" />
        </span>
        <span className="text-right max-md:hidden">得票</span>
        <span className="max-md:text-right">配信</span>
      </div>
      <div ref={listRef} style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((item) => {
          const s = songs[item.index];
          const active = s.id === selectedId;
          const art = artworkOf(s);
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(s)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(s)}
              className={`${grid} group absolute inset-x-0 cursor-pointer rounded-md px-2 md:px-3 ${active ? "bg-white/10" : "hover:bg-white/5"}`}
              style={{ height: ROW, transform: `translateY(${item.start - margin}px)` }}
            >
              <span
                className={`text-right text-sm tabular-nums ${active ? "text-accent" : "text-muted"}`}
              >
                {s.rank ?? "–"}
              </span>
              <div className="flex min-w-0 items-center gap-3">
                {art ? (
                  <img
                    src={art}
                    alt=""
                    loading="lazy"
                    className="size-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <Cover seed={s.game} className="size-10 rounded text-sm" />
                )}
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm font-semibold ${active ? "text-accent" : "text-white"}`}
                  >
                    {s.title}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {s.vocal || "（インスト）"}
                    <span className="md:hidden"> ・ {s.game}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onScope({ kind: "game", name: s.game });
                }}
                className="truncate text-left text-sm text-muted hover:text-white hover:underline max-md:hidden"
              >
                {s.game}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onScope({ kind: "brand", name: s.brand });
                }}
                className="truncate text-left text-sm text-muted hover:text-white hover:underline max-md:hidden"
              >
                {s.brand}
              </button>
              <span className="text-xs text-muted tabular-nums max-md:hidden">{year(s)}</span>
              <span className="text-right text-xs text-muted tabular-nums max-md:hidden">
                {s.votes}
              </span>
              <div className="max-md:justify-self-end">
                <StreamDots song={s} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
