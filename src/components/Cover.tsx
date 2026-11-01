import { coverStyle } from "../lib/songs";

/** ジャケット画像の代わりに、ゲーム名から生成したグラデーション + 頭文字 */
export function Cover({
  seed,
  label,
  className = "",
}: {
  seed: string;
  label?: string;
  className?: string;
}) {
  const ch = [...(label ?? seed).replace(/^[『「【\s]+/, "")][0] ?? "♪";
  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden font-black text-white/90 select-none ${className}`}
      style={coverStyle(seed)}
      aria-hidden
    >
      <span className="drop-shadow-[0_1px_6px_rgba(0,0,0,.35)]">{ch}</span>
    </div>
  );
}
