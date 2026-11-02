import { useEffect, useRef } from "react";
import {
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
  Repeat,
  Repeat1,
  Shuffle,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import { type Song, artworkOf } from "../lib/songs";
import { usePlayer } from "../lib/player";
import { Cover } from "./Cover";
import { FavButton } from "./FavButton";

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** 画面下のプレーヤーバー。再生中の曲（なければ選んだ曲）と操作ボタン、配信リンク */
/** YouTube と同じキー操作。文字入力中は効かせない */
function useShortcuts(p: ReturnType<typeof usePlayer>) {
  const ref = useRef(p);
  ref.current = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = ref.current;
      if (!p.current || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing =
        t?.isContentEditable ||
        t?.tagName === "TEXTAREA" ||
        t?.tagName === "SELECT" ||
        (t?.tagName === "INPUT" && (t as HTMLInputElement).type !== "range");
      if (typing) return;
      const vol = (d: number) =>
        p.setVolume(Math.max(0, Math.min(100, (p.muted ? 0 : p.volume) + d)));
      const seek = (d: number) => p.seek(Math.max(0, Math.min(p.duration || 0, p.time + d)));
      const k = e.key;
      if (k === " " || k === "k" || k === "K") p.toggle();
      else if (k === "ArrowLeft") seek(-5);
      else if (k === "ArrowRight") seek(5);
      else if (k === "j" || k === "J") seek(-10);
      else if (k === "l" || k === "L") seek(10);
      else if (k === "ArrowUp") vol(5);
      else if (k === "ArrowDown") vol(-5);
      else if (k === "m" || k === "M") p.toggleMute();
      else if (k === "N" && e.shiftKey) p.next();
      else if (k === "P" && e.shiftKey) p.prev();
      else if (k === "Home") p.seek(0);
      else if (k === "r" || k === "R") p.cycleRepeat();
      else if (k === "s" || k === "S") p.toggleShuffle();
      else if (/^[0-9]$/.test(k) && p.duration) p.seek((p.duration * Number(k)) / 10);
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
}

/** 音量バーの上でホイールを回すと音量が変わる */
function useWheelVolume(p: ReturnType<typeof usePlayer>) {
  const ref = useRef(p);
  ref.current = p;
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = ref.current;
      const d = e.deltaY < 0 ? 5 : -5;
      p.setVolume(Math.max(0, Math.min(100, (p.muted ? 0 : p.volume) + d)));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  });
  return el;
}

export function NowBar({
  song: selected,
  onOpen,
  detailOpen,
  onToggleDetail,
}: {
  song: Song | null;
  onOpen: () => void;
  detailOpen: boolean;
  onToggleDetail: () => void;
}) {
  const p = usePlayer();
  useShortcuts(p);
  const wheel = useWheelVolume(p);
  const s = p.current ?? selected;
  if (!s) return null;
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
        <FavButton id={s.id} className="shrink-0" />

        {active && (
          <div className="flex shrink-0 items-center gap-1">
            <span className="mr-1 text-xs text-muted tabular-nums max-sm:hidden">
              {mmss(p.time)} / {mmss(p.duration)}
            </span>
            <button
              onClick={p.toggleShuffle}
              className={`rounded-full p-2 max-sm:hidden ${p.shuffle ? "text-accent" : "text-muted hover:text-white"}`}
              aria-label={p.shuffle ? "シャッフルをオフ" : "シャッフル"}
              aria-pressed={p.shuffle}
              title={p.shuffle ? "シャッフル: オン (S)" : "シャッフル: オフ (S)"}
            >
              <Shuffle className="size-4" />
            </button>
            <button
              onClick={p.prev}
              className="rounded-full p-2 text-muted hover:text-white"
              aria-label="前の曲"
              title="前の曲 (Shift+P)"
            >
              <SkipBack className="size-4" />
            </button>
            <button
              onClick={p.toggle}
              className="rounded-full p-2 text-white hover:bg-elev"
              aria-label={p.playing ? "一時停止" : "再生"}
              title={p.playing ? "一時停止 (スペース)" : "再生 (スペース)"}
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
              title="次の曲 (Shift+N)"
            >
              <SkipForward className="size-4" />
            </button>
            <button
              onClick={p.cycleRepeat}
              className={`rounded-full p-2 ${p.repeat !== "off" ? "text-accent" : "text-muted hover:text-white"}`}
              aria-label={
                p.repeat === "off"
                  ? "リピート: オフ"
                  : p.repeat === "all"
                    ? "リピート: すべて"
                    : "リピート: 1曲"
              }
              title={
                (p.repeat === "off"
                  ? "リピート: オフ"
                  : p.repeat === "all"
                    ? "リピート: すべて"
                    : "リピート: 1曲") + " (R)"
              }
            >
              {p.repeat === "one" ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
            </button>
            <div
              ref={wheel}
              className="ml-1 flex items-center gap-1 max-md:hidden"
              title="ホイールでも音量を変えられます"
            >
              <button
                onClick={p.toggleMute}
                className="rounded-full p-2 text-muted hover:text-white"
                aria-label={p.muted ? "ミュート解除" : "ミュート"}
                title={p.muted ? "ミュート解除 (M)" : "ミュート (M)"}
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
        <button
          onClick={onToggleDetail}
          className={`shrink-0 rounded-full p-2 ${detailOpen ? "text-white" : "text-muted hover:text-white"}`}
          aria-label={detailOpen ? "詳細を閉じる" : "詳細を開く"}
          aria-pressed={detailOpen}
          title={detailOpen ? "詳細を閉じる" : "詳細を開く"}
        >
          {detailOpen ? (
            <PanelRightClose className="size-4" />
          ) : (
            <PanelRightOpen className="size-4" />
          )}
        </button>
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
        <div ref={p.mount} className="size-full [&_iframe]:size-full" />
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
