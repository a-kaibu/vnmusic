import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type Song, links } from "./songs";

/** サイト内で再生できる曲か（YouTube の動画が見つかっているか） */
export const playable = (s: Song) => Boolean(links[s.id]?.yt);

type YTPlayer = {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allow: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setVolume: (v: number) => void;
};
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;
const loadApi = () =>
  (apiPromise ??= new Promise<void>((resolve) => {
    if (window.YT?.Player) return resolve();
    window.onYouTubeIframeAPIReady = () => resolve();
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  }));

type State = {
  current: Song | null;
  playing: boolean;
  time: number;
  duration: number;
  hasPrev: boolean;
  hasNext: boolean;
  showVideo: boolean;
  /** 詳細画面の動画枠。あればプレーヤーをそこに重ねて表示する */
  anchor: HTMLElement | null;
};
type Api = State & {
  /** list の中の song から再生。list は「次の曲」に使う */
  play: (song: Song, list: Song[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (t: number) => void;
  setShowVideo: (v: boolean) => void;
  mount: (el: HTMLDivElement | null) => void;
  setAnchor: (el: HTMLElement | null) => void;
};

const Ctx = createContext<Api | null>(null);
export const usePlayer = () => useContext(Ctx)!;

export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useRef<YTPlayer | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const queue = useRef<Song[]>([]);
  const idx = useRef(-1);
  const errors = useRef(0);
  const [st, setSt] = useState<State>({
    current: null,
    playing: false,
    time: 0,
    duration: 0,
    hasPrev: false,
    hasNext: false,
    showVideo: true,
    anchor: null,
  });

  const step = useCallback((dir: 1 | -1) => {
    const q = queue.current;
    for (let i = idx.current + dir; i >= 0 && i < q.length; i += dir) {
      if (playable(q[i])) return start(i);
    }
    setSt((s) => ({ ...s, playing: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(
    async (i: number) => {
      idx.current = i;
      const song = queue.current[i];
      const id = links[song.id]!.yt!;
      const q = queue.current;
      setSt((s) => ({
        ...s,
        current: song,
        time: 0,
        duration: 0,
        hasPrev: q.slice(0, i).some(playable),
        hasNext: q.slice(i + 1).some(playable),
      }));
      await loadApi();
      if (!player.current) {
        const el = document.createElement("div");
        host.current!.appendChild(el);
        player.current = new window.YT!.Player(el, {
          width: "100%",
          height: "100%",
          videoId: id,
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: location.origin },
          events: {
            onStateChange: (e: { data: number }) => {
              if (e.data === 1) errors.current = 0;
              if (e.data === 0) step(1); // ended
              setSt((s) => ({ ...s, playing: e.data === 1 || e.data === 3 }));
            },
            // 埋め込み不可・削除済みなどは飛ばす
            // 3曲続けて失敗したら止める（環境の問題で全部飛ばし続けないように）
            onError: () => {
              if (++errors.current < 3) step(1);
              else setSt((s) => ({ ...s, playing: false }));
            },
          },
        });
      } else player.current.loadVideoById(id);
    },
    [step],
  );

  useEffect(() => {
    const t = setInterval(() => {
      const p = player.current;
      if (!p?.getCurrentTime) return;
      // イベントを取りこぼしても表示がずれないよう、再生状態も毎回読み直す
      const state = p.getPlayerState?.();
      const playing = state === 1 || state === 3;
      setSt((s) =>
        playing || s.playing !== playing
          ? { ...s, playing, time: p.getCurrentTime(), duration: p.getDuration() }
          : s,
      );
    }, 500);
    return () => clearInterval(t);
  }, []);

  const api: Api = {
    ...st,
    play: (song, list) => {
      const l = list.includes(song) ? list : [song];
      queue.current = l;
      errors.current = 0;
      void start(l.indexOf(song));
    },
    toggle: () => {
      if (!player.current) return;
      const state = player.current.getPlayerState?.();
      if (state === 1 || state === 3) player.current.pauseVideo();
      else player.current.playVideo();
    },
    next: () => step(1),
    prev: () => {
      if (player.current && st.time > 5) return player.current.seekTo(0, true);
      step(-1);
    },
    seek: (t) => player.current?.seekTo(t, true),
    setShowVideo: (v) => setSt((s) => ({ ...s, showVideo: v })),
    setAnchor: (el) => setSt((s) => (s.anchor === el ? s : { ...s, anchor: el })),
    mount: (el) => {
      host.current = el;
    },
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
