import { type ReactNode, useEffect, useRef, useState } from "react";
import { X, ExternalLink, Disc, Mic, Globe, Search, Play, Link2, Check } from "lucide-react";
import { usePlayer } from "../lib/player";
import { type Song, services, searchQuery, links, games, artworkOf, flagOf, cds } from "../lib/songs";
import type { Scope } from "../App";
import { Cover } from "./Cover";
import { ScopeLink } from "./ScopeLink";

type Props = {
  song: Song;
  onClose: () => void;
  onScope: (s: NonNullable<Scope>) => void;
  onPlay: (s: Song) => void;
};

const e = encodeURIComponent;
const karaoke = [
  {
    key: "dam",
    name: "DAM",
    url: (q: string) => `https://www.clubdam.com/karaokesearch/?keyword=${e(q)}`,
  },
  {
    key: "joysound",
    name: "JOYSOUND",
    url: (q: string) => `https://www.joysound.com/web/search/cross?match=1&keyword=${e(q)}`,
  },
  { key: "karatetsu", name: "カラオケの鉄人", url: null },
  { key: "pasela", name: "パセラ", url: null },
] as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

export function SongDetail({ song: s, onClose, onScope, onPlay }: Props) {
  const player = usePlayer();
  const isCurrent = player.current?.id === s.id;
  const [copied, setCopied] = useState(false);
  const ytId = links[s.id]?.yt;
  const nicoId = ytId ? undefined : links[s.id]?.nico;
  const yt = ytId || nicoId;
  const thumb = ytId
    ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`
    : nicoId
      ? `https://nicovideo.cdn.nimg.jp/thumbnails/${nicoId.slice(2)}/${nicoId.slice(2)}`
      : undefined;
  const frame = useRef<HTMLDivElement>(null);
  const { setAnchor } = player;
  useEffect(() => {
    if (!isCurrent) return;
    setAnchor(frame.current);
    return () => setAnchor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrent, s.id]);
  useEffect(() => setCopied(false), [s.id]);
  const q = searchQuery(s);
  const l = links[s.id] ?? {};
  const g = games[s.gameKey] ?? {};
  const art = artworkOf(s);
  const anyKaraoke = Object.values(s.karaoke).some(Boolean);

  return (
    <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto rounded-xl bg-panel max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:bottom-[var(--dock-h,0px)] max-lg:z-50 max-lg:w-auto max-lg:rounded-none">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-panel/90 px-4 py-3 backdrop-blur">
        <p className="truncate text-sm font-bold">{s.game}</p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => {
              const url = location.href;
              if (navigator.share) void navigator.share({ title: s.title, url }).catch(() => {});
              else void navigator.clipboard?.writeText(url).then(() => setCopied(true));
            }}
            className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-muted hover:bg-elev hover:text-white"
            title="この曲のURLをコピー"
          >
            {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
            {copied ? "コピーしました" : "URL"}
          </button>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 hover:bg-elev"
            aria-label="閉じる"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      <div className="px-4 pb-6">
        {yt ? (
          // 再生中はここに YouTube / ニコニコのプレーヤーが重なる（VideoBox）
          <div
            ref={frame}
            className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-2xl"
          >
            {!isCurrent && (
              <button
                onClick={() => onPlay(s)}
                className="group absolute inset-0"
                aria-label={`${s.title}を再生`}
              >
                <img
                  src={thumb}
                  alt=""
                  className="size-full object-cover opacity-80 transition group-hover:opacity-100"
                />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid size-16 place-items-center rounded-full bg-accent text-black shadow-xl transition group-hover:scale-110">
                    <Play className="size-7 translate-x-0.5 fill-current" />
                  </span>
                </span>
              </button>
            )}
          </div>
        ) : art ? (
          <img
            src={art}
            alt={`${s.album || s.game} ジャケット`}
            className="aspect-square w-full rounded-lg object-cover shadow-2xl"
          />
        ) : (
          <Cover
            seed={s.game}
            label={s.game}
            className="aspect-square w-full rounded-lg text-7xl shadow-2xl"
          />
        )}

        <div className={`mt-4 ${yt ? "flex items-start gap-3" : ""}`}>
          {yt &&
            (art ? (
              <img
                src={art}
                alt={`${s.album || s.game} ジャケット`}
                className="size-20 shrink-0 rounded-lg object-cover shadow-lg"
              />
            ) : (
              <Cover seed={s.game} className="size-20 shrink-0 rounded-lg text-2xl" />
            ))}
          <div className="min-w-0">
            {s.category && (
              <p className="text-xs font-bold text-accent">
                <ScopeLink kind="category" value={s.category} onScope={onScope} />
              </p>
            )}
            <h2 className="mt-1 text-2xl font-extrabold break-words">{s.title}</h2>
            {s.vocal && (
              <p className="mt-1 text-sm text-muted">
                <ScopeLink kind="artist" value={s.vocal} onScope={onScope} split />
              </p>
            )}
          </div>
        </div>

        {l.apple && (
          <section className="mt-4">
            <iframe
              title="Apple Music"
              src={l.apple.replace("https://music.apple.com/", "https://embed.music.apple.com/")}
              allow="autoplay *; encrypted-media *; clipboard-write"
              sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
              className="h-[175px] w-full overflow-hidden rounded-xl"
            />
            <p className="mt-1 text-[11px] text-muted/80">
              Apple Music にサインインしていればフル再生、それ以外は試聴です。
            </p>
          </section>
        )}

        {/* 配信 */}
        <section className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Play className="size-4" /> 聴く
          </h3>
          <div className="flex flex-col gap-1.5">
            {services.map((sv) => {
              const direct = l[sv.key];
              if (!direct && !flagOf(s, sv.key) && sv.key !== "youtube") return null;
              return (
                <a
                  key={sv.key}
                  href={direct ?? sv.url(q) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg bg-elev px-3 py-2.5 text-sm transition hover:bg-line"
                >
                  <span className="size-3 shrink-0 rounded-full" style={{ background: sv.color }} />
                  <span className="flex-1 font-semibold">{sv.name}</span>
                  {direct ? (
                    <ExternalLink className="size-4 text-muted" />
                  ) : (
                    <Search className="size-4 text-muted" />
                  )}
                </a>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted/80">
            <ExternalLink className="inline size-3" /> は曲ページへの直リンク、
            <Search className="inline size-3" /> は検索結果を開きます。
          </p>
        </section>

        {/* CD */}
        <section className="mt-5">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold">
            <Disc className="size-4" /> 収録CD・楽曲情報
          </h3>
          <dl>
            <Row label="収録">
              {s.album && <ScopeLink kind="album" value={s.album} onScope={onScope} />}
              {l.album && (
                <a
                  href={l.album}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted hover:text-white"
                >
                  Apple Music <ExternalLink className="size-3" />
                </a>
              )}
            </Row>
            <Row label="CD">
              {cds[s.id] && (
                <span className="flex flex-wrap gap-1.5">
                  {cds[s.id].map((c) => (
                    <a
                      key={c.name}
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:bg-elev hover:text-white"
                    >
                      {c.name} <ExternalLink className="size-3" />
                    </a>
                  ))}
                </span>
              )}
            </Row>
            <Row label="作詞">
              {s.lyrics && <ScopeLink kind="lyrics" value={s.lyrics} onScope={onScope} split />}
            </Row>
            <Row label="作曲">
              {s.composer && (
                <ScopeLink kind="composer" value={s.composer} onScope={onScope} split />
              )}
            </Row>
            <Row label="編曲">
              {s.arranger && (
                <ScopeLink kind="arranger" value={s.arranger} onScope={onScope} split />
              )}
            </Row>
            <Row label="区分">
              {s.category && <ScopeLink kind="category" value={s.category} onScope={onScope} />}
            </Row>
            <Row label="ゲーム">
              <ScopeLink kind="game" value={s.game} onScope={onScope} />
            </Row>
            <Row label="ブランド">
              <ScopeLink kind="brand" value={s.brand} onScope={onScope} />
            </Row>
            <Row label="発売日">
              {s.release && (
                <>
                  <ScopeLink kind="year" value={s.release.slice(0, 4)} onScope={onScope} />
                  {s.release.slice(4)}
                </>
              )}
            </Row>
          </dl>
          {g.official && (
            <a
              href={g.official}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-elev"
            >
              <Globe className="size-3.5" /> ゲーム公式サイト
            </a>
          )}
        </section>

        {/* カラオケ */}
        <section className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Mic className="size-4" /> カラオケ
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {karaoke.map((k) => {
              const f = s.karaoke[k.key];
              const inner = (
                <>
                  <span className="font-semibold">{k.name}</span>
                  <span className={`text-xs ${f ? "text-accent" : "text-muted/60"}`}>
                    {f === 2 ? "配信あり" : f === 1 ? "一部" : "情報なし"}
                  </span>
                </>
              );
              const cls = `flex flex-col rounded-lg px-3 py-2 text-sm ${f ? "bg-elev" : "bg-elev/40"}`;
              return k.url && f ? (
                <a
                  key={k.key}
                  href={k.url(q)}
                  target="_blank"
                  rel="noreferrer"
                  className={`${cls} hover:bg-line`}
                >
                  {inner}
                </a>
              ) : (
                <div key={k.key} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
          {!anyKaraoke && (
            <p className="mt-2 text-xs text-muted">
              2023年7月時点でカラオケ配信の情報はありません。
            </p>
          )}
        </section>

        {s.note && (
          <section className="mt-5 text-sm">
            <h3 className="mb-1 font-bold">メモ</h3>
            <dl>
              <Row label="備考">{s.note}</Row>
            </dl>
          </section>
        )}
      </div>
    </aside>
  );
}
