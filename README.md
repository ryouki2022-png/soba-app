# 📒 きろくノート（そば・体重）

「そば記録」と「体重記録」をひとつにまとめた、モバイル対応の記録アプリです。最初の画面でどちらを使うか選びます。PWA対応で、ホーム画面に追加すると全画面のアプリとして起動します。

## できること

### 🍜 そば記録
- **記録** — 店名・複数メニュー・トッピング・温かい/冷たい・こしの強さ・値段・総合評価・写真・メモ・日付
- **Google マップ連携** — マップの共有リンクを貼ると店名と位置情報を自動取得（フルURL形式）
- **お店ごと管理** — 店単位で集計（訪問回数・平均評価・値段帯・温/冷）、その店の全記録を時系列表示
- **賢い入力** — 2回目以降は店名から過去訪問を表示し、前回のマップリンクを自動補完
- **🗺️ マップ** — 位置情報つきの記録を地図にピン表示（Leaflet + OpenStreetMap、APIキー不要）
- **📊 グラフ** — 評価の推移（折れ線）、月別の記録数（棒）
- **📋 データ** — 一覧（表）、JSON/CSV書き出し、JSONから復元
- **検索・絞り込み** — 店名/メニュー/トッピングで検索、温かい・冷たいでフィルタ

### ⚖️ 体重記録
- **0.1kg単位の記録** — ステッパー（±0.1 / ±0.5 / ±1.0）と数値入力、1日1件（同日は上書き）
- **変化グラフ** — 1週間 / 1ヶ月 / 3ヶ月 / 全期間で表示
- **サマリー** — 現在の体重、前回比・期間比、最小/最大
- **記録リスト** — 日付・体重・前日比（増減で色分け）、タップで編集・削除

### 共通
- データはブラウザの **localStorage** に保存（サーバー不要・外部送信なし）
- **PWA** — ホーム画面に追加で全画面起動・オフライン対応

## 技術スタック

- Vite + React + TypeScript
- グラフは依存ライブラリなしの自作SVG（`src/charts/`）
- 地図は Leaflet + OpenStreetMap（APIキー不要）
- PWA は vite-plugin-pwa
- 永続化は localStorage（バックエンドなし）

## 開発

```bash
npm install      # 依存関係のインストール
npm run dev      # 開発サーバー起動
npm run build    # 本番ビルド（型チェック込み）
npm run preview  # ビルド結果をプレビュー
```

## 公開（GitHub Pages）

`main` 系の作業ブランチへ push すると、GitHub Actions（`.github/workflows/deploy.yml`）が
自動でビルドして GitHub Pages へデプロイします。公開URL: https://ryouki2022-png.github.io/soba-app/

## ディレクトリ構成

```
src/
├── App.tsx              # ランチャー（そば / 体重 を選択）
├── SobaApp.tsx          # そばアプリ（記録・お店・マップ・グラフ）
├── WeightApp.tsx        # 体重アプリ
├── types.ts             # そばの記録の型
├── storage.ts           # そばの保存（旧データの自動移行つき）
├── charts/
│   ├── LineChart.tsx    # 折れ線グラフ（自作SVG）
│   └── BarChart.tsx     # 棒グラフ（自作SVG）
├── components/          # そばアプリのUI
│   ├── RecordForm.tsx / RecordCard.tsx / RecordDetail.tsx
│   ├── StoreList.tsx / StoreDetail.tsx
│   ├── DataView.tsx / MapView.tsx / StatsView.tsx
│   ├── StarRating.tsx / TagInput.tsx
├── utils/               # maps / image / dataIO / stores
└── weight/              # 体重アプリの型・保存
```

## メモ
- Google マップの短縮URL（`maps.app.goo.gl`）はブラウザのCORS制約で店名を自動取得できません（手入力で補えます）。
- 地図のピンは、座標を取得できた記録（フルURLを貼った場合）に表示されます。
