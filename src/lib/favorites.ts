import { useSyncExternalStore } from "react";

/** お気に入り（曲ID）。この端末のブラウザにだけ保存する */
const KEY = "vnmusic:favorites";
let ids: number[] = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "number") : [];
  } catch {
    return [];
  }
})();
let set = new Set(ids);
const listeners = new Set<() => void>();

const write = (next: number[]) => {
  ids = next;
  set = new Set(ids);
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* 保存できなくても今の画面では使える */
  }
  listeners.forEach((l) => l());
};

// 別タブで変えたときも反映する
addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  try {
    write(JSON.parse(e.newValue ?? "[]"));
  } catch {
    /* 壊れた値は無視 */
  }
});

export const toggleFavorite = (id: number) =>
  write(set.has(id) ? ids.filter((x) => x !== id) : [id, ...ids]);

/** 追加した新しい順の曲ID */
export function useFavorites() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => ids,
  );
  return { list, has: (id: number) => set.has(id) };
}
