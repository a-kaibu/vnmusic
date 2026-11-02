import { Heart } from "lucide-react";
import { toggleFavorite, useFavorites } from "../lib/favorites";

/** お気に入りのハート */
export function FavButton({ id, className = "" }: { id: number; className?: string }) {
  const fav = useFavorites().has(id);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(id);
      }}
      className={`rounded-full p-1.5 transition ${fav ? "text-accent" : "text-muted hover:text-white"} ${className}`}
      aria-label={fav ? "お気に入りから外す" : "お気に入りに追加"}
      aria-pressed={fav}
      title={fav ? "お気に入りから外す" : "お気に入りに追加"}
    >
      <Heart className={`size-4 ${fav ? "fill-current" : ""}`} />
    </button>
  );
}
