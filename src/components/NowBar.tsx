import { ExternalLink } from "lucide-react";
import { type Song, services, searchQuery, links, artworkOf } from "../lib/songs";
import { Cover } from "./Cover";

/** 画面下の「再生中」風バー。選んだ曲と、すぐ開ける配信リンクを出す */
export function NowBar({ song: s, onOpen }: { song: Song | null; onOpen: () => void }) {
  if (!s) return null;
  const l = links[s.id] ?? {};
  const q = searchQuery(s);
  const avail = services.filter(
    (sv) => l[sv.key] || (sv.key !== "youtube" && s.stream[sv.key] > 0),
  );
  const shown = avail.length ? avail : services.filter((sv) => sv.key === "youtube");
  const art = artworkOf(s);
  return (
    <div className="flex items-center gap-3 border-t border-line bg-bg px-3 py-2 md:px-4">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {art ? (
          <img src={art} alt="" className="size-12 rounded object-cover" />
        ) : (
          <Cover seed={s.game} className="size-12 rounded text-lg" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{s.title}</p>
          <p className="truncate text-xs text-muted">
            {s.vocal || "（インスト）"} ・ {s.game}
          </p>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        {shown.slice(0, 4).map((sv) => (
          <a
            key={sv.key}
            href={l[sv.key] ?? sv.url(q) ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-black transition hover:brightness-110"
            style={{ background: sv.color }}
            title={`${sv.name}で開く`}
          >
            <span className="max-sm:hidden">{sv.name}</span>
            <span className="sm:hidden">{sv.name.split(" ")[0]}</span>
            {l[sv.key] && <ExternalLink className="size-3" />}
          </a>
        ))}
      </div>
    </div>
  );
}
