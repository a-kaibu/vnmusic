# vnmusic — ギャルゲソング一覧

ギャルゲ・エロゲソング投票結果（`data/votes.csv`、全2321曲）を、音楽ストリーミングサービス風に一覧できるサイトです。Vite+ (`vp`) + React + Tailwind CSS。

## できること

- 総合ランキング（仮想スクロールで全曲表示）、ゲーム / ブランド / アーティスト別の一覧
- 曲名・ゲーム・ブランド・歌手・作詞作曲者で検索（ひらがな/カタカナ・全角半角を区別しない）
- 区分（OP / ED / 挿入歌 / BGM …）、ブランド、配信ありで絞り込み、発売日順ソート
- 曲詳細: 配信サービス（Spotify / Apple Music / YouTube Music / Amazon Music / mora / AWA / FANZA / YouTube）、収録CD、作詞・作曲・編曲、カラオケ（DAM / JOYSOUND / 鉄人 / パセラ）、過去順位、ゲーム公式サイト

配信リンクは `src/data/links.json` に直リンクがあればそれを、なければ各サービスの検索結果を開きます。

## 開発

```sh
vp install
vp dev          # 開発サーバー
vp build        # dist/ に出力
vp check        # lint + format + 型チェック
```

## データの更新

```sh
node scripts/convert.ts          # data/votes.csv → src/data/songs.json
node scripts/enrich.ts all       # 直リンク・ジャケット・公式サイトを収集（要ネットワーク）
```

`enrich.ts` の流れ:

1. `games` — 批評空間 (ErogameScape) のSQLフォームからゲーム一覧を取り、公式サイトURLとジャケットを照合。公式サイトの生存確認もする
2. `apple` — iTunes Search API で Apple Music の曲ページ・アルバム・ジャケットを探す（CSVで配信○△の曲。`--all-songs` で全曲）
3. `odesli` — song.link API で Apple Music のURLから Spotify / YouTube Music / Amazon Music / YouTube のURLを得る
4. `spotify` — `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` があれば Spotify API で残りを補完
5. `write` — `data/cache/` から `src/data/links.json` と `src/data/games.json` を書き出す

APIのレート制限に合わせて待つので、全部で1時間ほどかかります。途中で止めても `data/cache/` から再開できます。
