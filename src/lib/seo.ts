import { type Song, artworkOf, people } from "./songs";

const SITE = "https://a-kaibu.github.io/vnmusic/";
const DEFAULT_DESC =
  "ギャルゲ・エロゲの主題歌・挿入歌・BGMを約1.8万曲収録。ゲーム・ブランド・歌手・作詞作曲で探せて、YouTube やニコニコ動画でそのまま聴ける。";

const meta = (attr: "name" | "property", key: string, value: string) => {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
};

/** 画面の状態に合わせてタイトル・説明・canonical・OGP・構造化データを書き換える */
export function updateSeo({
  title,
  search,
  song,
}: {
  title: string;
  search: string;
  song: Song | null;
}) {
  const url = SITE + search;
  const desc = song
    ? `${song.title}${song.vocal ? `（歌: ${song.vocal}）` : ""} — 『${song.game}』${song.category ? song.category : ""}${song.brand ? ` / ${song.brand}` : ""}。${song.release ? `${song.release.slice(0, 4)}年。` : ""}vnmusic で試聴・配信リンク・収録CDを確認。`
    : DEFAULT_DESC;
  document.title = title;
  meta("name", "description", desc);
  meta("property", "og:title", title);
  meta("property", "og:description", desc);
  meta("property", "og:url", url);
  meta("name", "twitter:title", title);
  meta("name", "twitter:description", desc);
  const img = (song && artworkOf(song)) || `${SITE}og.png`;
  meta("property", "og:image", img);
  meta("name", "twitter:image", img);
  let canon = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canon) {
    canon = document.createElement("link");
    canon.rel = "canonical";
    document.head.appendChild(canon);
  }
  // 曲ページは ?song= だけを正規URLにする（並び順や絞り込みの違いは同じページ扱い）
  canon.href = song ? `${SITE}?song=${song.id}` : url;

  document.getElementById("ld-song")?.remove();
  if (!song) return;
  const ld = document.createElement("script");
  ld.type = "application/ld+json";
  ld.id = "ld-song";
  ld.text = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: song.title,
    url: `${SITE}?song=${song.id}`,
    byArtist: people(song.vocal).map((name) => ({ "@type": "MusicGroup", name })),
    ...(song.album ? { inAlbum: { "@type": "MusicAlbum", name: song.album } } : {}),
    ...(song.release ? { datePublished: song.release.replace(/\//g, "-") } : {}),
    ...(artworkOf(song) ? { image: artworkOf(song) } : {}),
    recordingOf: {
      "@type": "MusicComposition",
      name: song.title,
      ...(song.composer
        ? { composer: people(song.composer).map((name) => ({ "@type": "Person", name })) }
        : {}),
      ...(song.lyrics
        ? { lyricist: people(song.lyrics).map((name) => ({ "@type": "Person", name })) }
        : {}),
    },
    isPartOf: {
      "@type": "VideoGame",
      name: song.game,
      ...(song.brand ? { publisher: { "@type": "Organization", name: song.brand } } : {}),
    },
  });
  document.head.appendChild(ld);
}
