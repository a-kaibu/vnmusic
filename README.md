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
node scripts/recent.ts           # 2023年以降のゲームの曲を集める（要ネットワーク）
node scripts/enrich.ts egsmusic  # 批評空間の楽曲データを取得（要ネットワーク、SQLを6回投げるだけ）
node scripts/convert.ts          # data/votes.csv + 2023年以降の曲 → src/data/songs.json
node scripts/enrich.ts all       # 直リンク・ジャケット・公式サイトを収集（要ネットワーク）
```

### 2023年以降の曲（`scripts/recent.ts`）

投票CSVは2023年9月発売分までなので、それ以降（と CSV にない2023年の作品）の曲を別に集めます。

1. `vndb` — VNDB から 2023年1月以降に発売された成人向けPCゲーム（企業ブランド）の一覧・ブランド・発売日・公式サイト・ジャケットを取得 → `data/cache/recent.json`
2. `itunes` — ゲーム名で iTunes Search API を検索し、サントラ・主題歌シングルからボーカル曲を拾う（BGM・インスト・別バージョンは除く）
3. `youtube` — 「ゲーム名 主題歌」「ゲーム名 OP ED」で YouTube を検索し、OPムービーや試聴動画のタイトル・説明文にある「OPテーマ『曲名』」などから曲名・歌手を拾う → `data/cache/recent-yt.json`
4. `staff` — VNDB のスタッフ欄（歌手と「OP "曲名"」の注記）から曲を拾う。曲名はローマ字なので、歌手名で iTunes・YouTube を検索して日本語の曲名にローマ字で照合する（見つからなければローマ字のまま）→ `data/cache/recent-staff-songs.json`
5. `site`（任意）— 公式サイトの「主題歌『曲名』」表記から拾う → `data/cache/recent-site.json`

絞り込み条件を変えたときは `node scripts/recent.ts pick`（iTunes）/ `pick-yt`（YouTube）で保存済みの検索結果から選び直せます。
CSV と同じ曲は追加しません。

### 批評空間の楽曲データ（`node scripts/enrich.ts egsmusic`）

批評空間 (ErogameScape) の SQL フォームから、曲（`musiclist`）・ゲームとの関係と区分（`game_music`）・歌手（`singer`）・作詞（`lyrics`）・作曲（`composition`）・編曲（`arrangement`）・収録CD（`musicitem_music`）をテーブルごとに取り、`data/cache/egs-music.json` に保存します。SQLフォームには実行コストの上限があるので、1回で全部は取らず、5秒ずつ空けて6回に分けて投げます。

`convert.ts` はこれを使って次のことをします。

- 2023年以降のゲーム: 批評空間のゲームと VNDB の ID（批評空間の `gamelist.vndb`）か名前・発売日・ブランドで対応づけ、曲名を日本語に、歌手・作詞・作曲・編曲・収録CDを批評空間の値にする。VNDB のローマ字の曲名は、フリガナをローマ字にして読みの近さで照合し、だめなら歌手と区分で照合する
- VNDB の一覧になかった 2023年以降の成人向けPCゲーム（企業ブランド）も、批評空間に歌入りの曲があれば加える
- CSV の曲: 歌手・作詞・作曲・編曲が空欄なら批評空間の値で埋める
- 批評空間のクリエイター名に付く別名の括弧（例: `rino(CooRie、MEGUMI、うらん)`）は、CSV に同じ表記がなければ外す

カラオケ情報はありません。

`enrich.ts` の流れ:

1. `games` — 批評空間 (ErogameScape) のSQLフォームからゲーム一覧を取り、公式サイトURLとジャケットを照合。公式サイトの生存確認もする
2. `apple` — iTunes Search API で Apple Music の曲ページ・アルバム・ジャケットを探す（CSVで配信○△の曲。`--all-songs` で全曲）
3. `odesli` — song.link API で Apple Music のURLから Spotify / YouTube Music / Amazon Music / YouTube のURLを得る
4. `spotify` — `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` があれば Spotify API で残りを補完
5. `write` — `data/cache/` から `src/data/links.json` と `src/data/games.json` を書き出す

APIのレート制限に合わせて待つので、全部で1時間ほどかかります。途中で止めても `data/cache/` から再開できます。
