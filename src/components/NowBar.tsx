import { useEffect, useRef } from "react";
import {
  ExternalLink,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Video,
  Volume1,
  Volume2,
  VolumeX,
  VideoOff,
  Minimize2,
} from "lucide-react";
import { type Song, flagOf, services, searchQuery, links, artworkOf } from "../lib/songs";
import { usePlayer } from "../lib/player";
import { Cover } from "./Cover";

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** 画面下のプレーヤーバー。再生中の曲（なければ選んだ曲）と操作ボタン、配信リンク */
export function NowBar({ song: selected, onOpen }: { song: Song | null; onOpen: () => void }) {
  const p = usePlayer();
  const s = p.current ?? selected;
  if (!s) return null;
  const l = links[s.id] ?? {};
  const q = searchQuery(s);
  // YouTube はサイト内で再生するので外部リンクは出さない
  const avail = services.filter(
    (sv) => sv.key !== "youtube" && (l[sv.key] || flagOf(s, sv.key) > 0),
  );
  const art = artworkOf(s);
  const active = Boolean(p.current);
  return (
    <div className="border-t border-line bg-bg">
      {active && (
        <input
          type="range"
          min={0}
          max={p.duration || 1}
          step={1}
          value={p.time}
          onChange={(e) => p.seek(Number(e.target.value))}
          className="seek block w-full"
          style={
            { "--pct": `${p.duration ? (p.time / p.duration) * 100 : 0}%` } as React.CSSProperties
          }
          aria-label="再生位置"
        />
      )}
      <div className="flex items-center gap-3 px-3 py-2 md:px-4">
        <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {art ? (
            <img src={art} alt="" className="size-12 rounded object-cover" />
          ) : (
            <Cover seed={s.game} className="size-12 rounded text-lg" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{s.title}</p>
            <p className="truncate text-xs text-muted">
              {s.vocal || (/BGM/.test(s.category) ? "（インスト）" : "歌手不明")} ・ {s.game}
            </p>
          </div>
        </button>

        {active && (
          <div className="flex shrink-0 items-center gap-1">
            <span className="mr-1 text-xs text-muted tabular-nums max-sm:hidden">
              {mmss(p.time)} / {mmss(p.duration)}
            </span>
            <button
              onClick={p.prev}
              className="rounded-full p-2 text-muted hover:text-white"
              aria-label="前の曲"
            >
              <SkipBack className="size-4" />
            </button>
            <button
              onClick={p.toggle}
              className="rounded-full p-2 text-white hover:bg-elev"
              aria-label={p.playing ? "一時停止" : "再生"}
              title={p.playing ? "一時停止" : "再生"}
            >
              {p.playing ? (
                <Pause className="size-5 fill-current" />
              ) : (
                <Play className="size-5 fill-current" />
              )}
            </button>
            <button
              onClick={p.next}
              disabled={!p.hasNext}
              className="rounded-full p-2 text-muted hover:text-white disabled:opacity-30"
              aria-label="次の曲"
            >
              <SkipForward className="size-4" />
            </button>
            <div className="ml-1 flex items-center gap-1 max-md:hidden">
              <button
                onClick={p.toggleMute}
                className="rounded-full p-2 text-muted hover:text-white"
                aria-label={p.muted ? "ミュート解除" : "ミュート"}
                title={p.muted ? "ミュート解除" : "ミュート"}
              >
                {p.muted || p.volume === 0 ? (
                  <VolumeX className="size-4" />
                ) : p.volume < 50 ? (
                  <Volume1 className="size-4" />
                ) : (
                  <Volume2 className="size-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={p.muted ? 0 : p.volume}
                onChange={(e) => p.setVolume(Number(e.target.value))}
                className="seek w-24"
                style={{ "--pct": `${p.muted ? 0 : p.volume}%` } as React.CSSProperties}
                aria-label="音量"
                title={`音量 ${p.muted ? 0 : p.volume}`}
              />
            </div>
            <button
              onClick={() => p.setShowVideo(!p.showVideo)}
              className="rounded-full p-2 text-muted hover:text-white"
              aria-label={p.showVideo ? "動画を隠す" : "動画を表示"}
            >
              {p.showVideo ? <Video className="size-4" /> : <VideoOff className="size-4" />}
            </button>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1.5 max-md:hidden">
          {avail.slice(0, 3).map((sv) => (
            <a
              key={sv.key}
              href={l[sv.key] ?? sv.url(q) ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-black transition hover:brightness-110"
              style={{ background: sv.color }}
              title={`${sv.name}で開く`}
            >
              {sv.name}
              {l[sv.key] && <ExternalLink className="size-3" />}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/** YouTube プレーヤー本体。詳細画面の動画枠があればそこに重ね、なければ右下に小さく出す */
export function VideoBox() {
  const p = usePlayer();
  const box = useRef<HTMLDivElement>(null);
  const anchored = Boolean(p.current && p.anchor);
  const visible = Boolean(p.current) && (anchored || p.showVideo);

  // iframe を DOM 上で動かすと読み込み直しになるので、位置だけ枠に合わせて追従させる
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (!anchored || !p.anchor) {
      el.removeAttribute("style");
      return;
    }
    const anchor = p.anchor;
    let raf = 0;
    const tick = () => {
      const r = anchor.getBoundingClientRect();
      const clip = anchor.closest("aside")?.getBoundingClientRect();
      const top = clip ? Math.max(0, clip.top - r.top) : 0;
      const bottom = clip ? Math.max(0, r.bottom - clip.bottom) : 0;
      Object.assign(el.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        right: "auto",
        bottom: "auto",
        clipPath: `inset(${top}px 0 ${bottom}px 0 round 12px)`,
      });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [anchored, p.anchor]);

  return (
    <>
      <div
        ref={box}
        className={`fixed overflow-hidden bg-black ${
          anchored
            ? "z-[60] rounded-xl"
            : "right-3 bottom-[calc(var(--dock-h,80px)+12px)] z-[55] aspect-video w-[320px] rounded-lg shadow-2xl ring-1 ring-line max-md:right-2 max-md:w-[240px]"
        } ${visible ? "" : "pointer-events-none opacity-0"}`}
      >
        <div ref={p.mount} className="size-full [&>iframe]:size-full" />
        {visible && !anchored && (
          <button
            onClick={() => p.setShowVideo(false)}
            className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black"
            aria-label="プレーヤーをしまう（再生は続きます）"
            title="しまう（再生は続きます）"
          >
            <Minimize2 className="size-3.5" />
          </button>
        )}
      </div>
    </>
  );
}
