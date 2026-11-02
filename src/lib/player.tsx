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
export const playable = (s: Song) => Boolean(links[s.id]?.yt || links[s.id]?.nico);

const NICO = "https://embed.nicovideo.jp";

type YTPlayer = {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allow: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setVolume: (v: number) => void;
  mute: () => void;
  unMute: () => void;
};

const VOL_KEY = "vnmusic:volume";
const loadVolume = () => {
  try {
    const v = Number(localStorage.getItem(VOL_KEY));
    return localStorage.getItem(VOL_KEY) !== null && v >= 0 && v <= 100 ? v : 80;
  } catch {
    return 80;
  }
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

export type Repeat = "off" | "all" | "one";
const MODE_KEY = "vnmusic:mode";
const loadMode = (): { repeat: Repeat; shuffle: boolean } => {
  try {
    const m = JSON.parse(localStorage.getItem(MODE_KEY) ?? "{}");
    return {
      repeat: ["off", "all", "one"].includes(m.repeat) ? m.repeat : "off",
      shuffle: Boolean(m.shuffle),
    };
  } catch {
    return { repeat: "off", shuffle: false };
  }
};

type State = {
  current: Song | null;
  playing: boolean;
  time: number;
  duration: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** off: 最後で止まる / all: 先頭に戻る / one: 同じ曲をくり返す */
  repeat: Repeat;
  shuffle: boolean;
  showVideo: boolean;
  /** 0〜100 */
  volume: number;
  muted: boolean;
  /** 詳細画面の動画枠。あればプレーヤーをそこに重ねて表示する */
  anchor: HTMLElement | null;
};
type Api = State & {
  /** list の中の song から再生。list は「次の曲」に使う */
  play: (song: Song, list: Song[]) => void;
  toggle: () => void;
  next: () => void;
  /** off → all → one → off */
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  prev: () => void;
  seek: (t: number) => void;
  setShowVideo: (v: boolean) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  mount: (el: HTMLDivElement | null) => void;
  setAnchor: (el: HTMLElement | null) => void;
};

const Ctx = createContext<Api | null>(null);
export const usePlayer = () => useContext(Ctx)!;

export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useRef<YTPlayer | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const ytBox = useRef<HTMLDivElement | null>(null);
  const nicoFrame = useRef<HTMLIFrameElement | null>(null);
  /** いま鳴らしているのが YouTube かニコニコか */
  const kind = useRef<"yt" | "nico">("yt");
  const nicoPost = (eventName: string, data?: unknown) =>
    nicoFrame.current?.contentWindow?.postMessage(
      { eventName, data, sourceConnectorType: 1, playerId: "1" },
      NICO,
    );
  const queue = useRef<Song[]>([]);
  const idx = useRef(-1);
  const errors = useRef(0);
  /** 自分で一時停止したか。動画を隠している間にブラウザ側で止められたら再開するため */
  const userPaused = useRef(false);
  const hidden = useRef(false);
  const volRef = useRef({ volume: 80, muted: false });
  const [st, setSt] = useState<State>({
    current: null,
    playing: false,
    time: 0,
    duration: 0,
    hasPrev: false,
    hasNext: false,
    ...loadMode(),
    showVideo: false,
    volume: loadVolume(),
    muted: false,
    anchor: null,
  });

  const mode = useRef(loadMode());
  /** シャッフル中に聴いた順（前の曲に戻るため） */
  const history = useRef<number[]>([]);

  /** 次（前）の曲へ。auto は曲が終わって自動で進むとき */
  const step = useCallback((dir: 1 | -1, auto = false) => {
    const q = queue.current;
    const { repeat, shuffle } = mode.current;
    if (auto && repeat === "one" && idx.current >= 0) return start(idx.current, true);
    if (shuffle) {
      if (dir === -1) {
        const back = history.current.pop();
        if (back !== undefined) return start(back, true);
        return;
      }
      const cand = q.map((_, i) => i).filter((i) => i !== idx.current && playable(q[i]));
      if (cand.length) {
        if (idx.current >= 0) history.current.push(idx.current);
        return start(cand[Math.floor(Math.random() * cand.length)], true);
      }
      if (repeat === "all" && idx.current >= 0) return start(idx.current, true);
      return setSt((s) => ({ ...s, playing: false }));
    }
    for (let i = idx.current + dir; i >= 0 && i < q.length; i += dir) {
      if (playable(q[i])) return start(i);
    }
    // 最後まで行ったら、全曲リピートなら反対の端から
    if (repeat === "all") {
      for (let n = 0, i = dir === 1 ? 0 : q.length - 1; n < q.length; n++, i += dir) {
        if (playable(q[i])) return start(i);
      }
    }
    setSt((s) => ({ ...s, playing: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(
    async (i: number, keepHistory = false) => {
      if (!keepHistory) history.current = [];
      idx.current = i;
      const song = queue.current[i];
      const nico = links[song.id]?.yt ? undefined : links[song.id]?.nico;
      const id = links[song.id]?.yt;
      const q = queue.current;
      setSt((s) => ({
        ...s,
        current: song,
        time: 0,
        duration: 0,
        hasPrev: q.slice(0, i).some(playable) || history.current.length > 0,
        hasNext:
          q.slice(i + 1).some(playable) || mode.current.repeat !== "off" || mode.current.shuffle,
      }));
      if (nico) {
        // ニコニコ動画は埋め込みプレーヤーを postMessage で操作する
        kind.current = "nico";
        player.current?.pauseVideo?.();
        ytBox.current!.style.display = "none";
        nicoFrame.current!.style.display = "";
        nicoFrame.current!.src = `${NICO}/watch/${nico}?jsapi=1&playerId=1&autoplay=1`;
        return;
      }
      kind.current = "yt";
      if (nicoFrame.current?.style.display !== "none") {
        nicoFrame.current!.src = "about:blank";
        nicoFrame.current!.style.display = "none";
        ytBox.current!.style.display = "";
      }
      await loadApi();
      if (!player.current) {
        const el = document.createElement("div");
        ytBox.current!.appendChild(el);
        player.current = new window.YT!.Player(el, {
          width: "100%",
          height: "100%",
          videoId: id,
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: location.origin },
          events: {
            onReady: () => {
              player.current?.setVolume(volRef.current.volume);
              if (volRef.current.muted) player.current?.mute();
            },
            onStateChange: (e: { data: number }) => {
              if (e.data === 1) errors.current = 0;
              if (e.data === 2 && hidden.current && !userPaused.current) {
                player.current?.playVideo();
                return;
              }
              if (e.data === 0) step(1, true); // ended
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
      } else player.current.loadVideoById(id!);
    },
    [step],
  );

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== NICO || kind.current !== "nico") return;
      const { eventName, data } = (e.data ?? {}) as { eventName?: string; data?: any };
      if (eventName === "loadComplete") {
        const d = Number(data?.videoInfo?.lengthInSeconds) || 0;
        setSt((s) => ({ ...s, duration: d }));
        nicoPost("volumeChange", { volume: volRef.current.volume / 100 });
        nicoPost("mute", { mute: volRef.current.muted });
        nicoPost("play");
      } else if (eventName === "playerStatusChange") {
        const st = data?.playerStatus;
        if (st === 2) errors.current = 0;
        if (st === 4) step(1, true);
        setSt((s) => ({ ...s, playing: st === 2 || st === 1 }));
      } else if (eventName === "playerMetadataChange") {
        const t = (data?.currentTime ?? 0) / 1000;
        setSt((s) => {
          const d = data?.duration ? data.duration / 1000 : s.duration;
          return Math.abs(s.time - t) < 0.4 && s.duration === d
            ? s
            : { ...s, time: t, duration: d };
        });
      } else if (eventName === "error") {
        if (++errors.current < 3) step(1);
        else setSt((s) => ({ ...s, playing: false }));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      const p = player.current;
      if (kind.current !== "yt" || !p?.getCurrentTime) return;
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

  const setMode = (m: { repeat: Repeat; shuffle: boolean }) => {
    mode.current = m;
    history.current = [];
    try {
      localStorage.setItem(MODE_KEY, JSON.stringify(m));
    } catch {
      /* 保存できなくても動く */
    }
    const q = queue.current;
    const i = idx.current;
    setSt((s) => ({
      ...s,
      ...m,
      hasNext: (i >= 0 && q.slice(i + 1).some(playable)) || m.repeat !== "off" || m.shuffle,
    }));
  };

  hidden.current = !st.showVideo && !st.anchor;
  volRef.current = { volume: st.volume, muted: st.muted };
  const api: Api = {
    ...st,
    play: (song, list) => {
      const l = list.includes(song) ? list : [song];
      queue.current = l;
      errors.current = 0;
      userPaused.current = false;
      void start(l.indexOf(song));
    },
    toggle: () => {
      if (kind.current === "nico") {
        userPaused.current = st.playing;
        return nicoPost(st.playing ? "pause" : "play");
      }
      if (!player.current) return;
      const state = player.current.getPlayerState?.();
      userPaused.current = state === 1 || state === 3;
      if (userPaused.current) player.current.pauseVideo();
      else player.current.playVideo();
    },
    next: () => step(1),
    cycleRepeat: () => {
      const r: Repeat = st.repeat === "off" ? "all" : st.repeat === "all" ? "one" : "off";
      setMode({ repeat: r, shuffle: st.shuffle });
    },
    toggleShuffle: () => setMode({ repeat: st.repeat, shuffle: !st.shuffle }),
    prev: () => {
      if (st.time > 5)
        return kind.current === "nico"
          ? nicoPost("seek", { time: 0 })
          : player.current?.seekTo(0, true);
      step(-1);
    },
    seek: (t) =>
      kind.current === "nico"
        ? nicoPost("seek", { time: t * 1000 })
        : player.current?.seekTo(t, true),
    setShowVideo: (v) => setSt((s) => ({ ...s, showVideo: v })),
    setVolume: (v) => {
      player.current?.setVolume?.(v);
      if (v > 0) player.current?.unMute?.();
      nicoPost("volumeChange", { volume: v / 100 });
      if (v > 0) nicoPost("mute", { mute: false });
      try {
        localStorage.setItem(VOL_KEY, String(v));
      } catch {
        /* 保存できなくても動く */
      }
      setSt((s) => ({ ...s, volume: v, muted: v === 0 ? s.muted : false }));
    },
    toggleMute: () => {
      if (st.muted) player.current?.unMute?.();
      else player.current?.mute?.();
      nicoPost("mute", { mute: !st.muted });
      setSt((s) => ({ ...s, muted: !s.muted }));
    },
    setAnchor: (el) => setSt((s) => (s.anchor === el ? s : { ...s, anchor: el })),
    mount: (el) => {
      host.current = el;
      if (!el || ytBox.current) return;
      ytBox.current = document.createElement("div");
      ytBox.current.className = "size-full";
      const f = document.createElement("iframe");
      f.className = "size-full";
      f.style.display = "none";
      f.allow = "autoplay; fullscreen";
      f.allowFullscreen = true;
      nicoFrame.current = f;
      el.append(ytBox.current, f);
    },
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
