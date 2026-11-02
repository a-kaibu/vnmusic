import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronDown, Search, Check } from "lucide-react";
import { type Group, brandImage } from "../lib/songs";
import { normalize } from "../lib/search";

/** ブランドで絞り込み。検索できる大きめの一覧（曲数の多い順） */
export function BrandPicker({
  brands,
  value,
  onChange,
}: {
  brands: Group[];
  value: string | null;
  onChange: (name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const sorted = useMemo(
    () =>
      [...brands].sort(
        (a, b) => b.songs.length - a.songs.length || a.name.localeCompare(b.name, "ja"),
      ),
    [brands],
  );
  const list = useMemo(() => {
    const t = normalize(q.trim());
    return t ? sorted.filter((b) => normalize(b.name).includes(t)) : sorted;
  }, [q, sorted]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener("mousedown", onDown);
    return () => removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (name: string | null) => {
    onChange(name);
    setOpen(false);
    setQ("");
  };

  return (
    <div
      ref={box}
      className="relative ml-auto"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className={`flex max-w-56 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${value ? "bg-white text-black" : "bg-elev text-white hover:bg-line"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{value ?? "ブランド"}</span>
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 flex max-h-[min(28rem,70vh)] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl bg-elev shadow-2xl ring-1 ring-line">
          <label className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <Search className="size-4 shrink-0 text-muted" aria-hidden />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && list[0]) pick(list[0].name);
              }}
              placeholder={`${brands.length} ブランドから検索`}
              aria-label="ブランドを検索"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </label>
          <ul role="listbox" aria-label="ブランド" className="overflow-y-auto py-1">
            {!q && (
              <li>
                <button
                  role="option"
                  aria-selected={!value}
                  onClick={() => pick(null)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-line focus:bg-line"
                >
                  <span className="size-8 shrink-0" />
                  <span className="flex-1 font-semibold">すべてのブランド</span>
                  {!value && <Check className="size-4 text-accent" aria-hidden />}
                </button>
              </li>
            )}
            {list.map((b) => {
              const img = brandImage(b.name, b.songs);
              return (
                <li key={b.name}>
                  <button
                    role="option"
                    aria-selected={value === b.name}
                    onClick={() => pick(b.name)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-line focus:bg-line"
                  >
                    {img ? (
                      <img
                        src={img}
                        alt=""
                        loading="lazy"
                        className={`size-8 shrink-0 rounded ${img.includes("img/brand/") ? "bg-white object-contain p-0.5" : "object-cover"}`}
                      />
                    ) : (
                      <span className="size-8 shrink-0 rounded bg-line" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {b.songs.length}曲
                    </span>
                    {value === b.name && (
                      <Check className="size-4 shrink-0 text-accent" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
            {!list.length && (
              <li className="px-3 py-6 text-center text-sm text-muted">見つかりません</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
