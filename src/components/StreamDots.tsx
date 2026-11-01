import { services, type Song } from "../lib/songs";

/** 一覧用: 配信が確認できているサービスを色付きドットで表示 */
export function StreamDots({ song }: { song: Song }) {
  const on = services.filter(
    (s) => s.key !== "youtube" && song.stream[s.key as keyof Song["stream"]] > 0,
  );
  if (!on.length) return <span className="text-xs text-muted/60">—</span>;
  return (
    <div className="flex items-center gap-1">
      {on.map((s) => (
        <span
          key={s.key}
          title={s.name}
          className="size-2.5 rounded-full"
          style={{
            background: s.color,
            opacity: song.stream[s.key as keyof Song["stream"]] === 1 ? 0.45 : 1,
          }}
        />
      ))}
    </div>
  );
}
