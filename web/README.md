# Script Player（Web / PWA）

MediaDict 風の語学学習 PWA。**動画はサーバーに送らず**各端末の IndexedDB に保存します。

## スマホで使う（GitHub → Vercel）— ピクスピ等と同じ流れ

1. **GitHub** に `script-player` を push（この `web/` フォルダを含む）
2. [Vercel](https://vercel.com) → **Add New Project** → リポジトリを Import
3. **Root Directory** を **`web`** に設定（リポジトリ直下が Android なので必須）
4. Framework Preset: **Next.js** のまま → **Deploy**
5. PC で表示された **`https://xxxx.vercel.app`** を開いて動作確認
6. その URL をスマホに送る（AirDrop / LINE / メールなど）
7. スマホの Safari または Chrome で URL を開く
8. **ホーム画面に追加**
   - **iPhone（Safari）**: 共有 → **ホーム画面に追加**
   - **Android（Chrome）**: メニュー → **アプリをインストール** または **ホーム画面に追加**

以降はホーム画面のアイコンから起動（PWA・スタンドアロン表示）。

### 環境変数（翻訳 SRT 生成）

Vercel → **Settings → Environment Variables**:

| Name | 用途 |
|------|------|
| `GEMINI_API_KEY` | メイン字幕 → 日本語翻訳 SRT の AI 生成 |

追加後 **Redeploy** してください。ローカルでは `web/.env.local` に同じキーを設定。

## Mac ローカル開発

```bash
cd web
npm install
npm run generate:icons   # 初回 or アイコン変更時
npm run dev
```

ブラウザで **http://127.0.0.1:3000** → **Local Files** で MP4 + SRT を登録。

同一 Wi‑Fi のスマホ試験は My List 上部の LAN URL（開発時のみ）。

## 機能

- **My List** … 保存済みメディア
- **Local Files** … MP4 + メイン SRT + 翻訳 SRT
- **Vocabulary** … セリフメモ
- **プレイヤー** … 二言語表示・区間リピート・速度変更

Android 版と同じ SRT パース / 二言語アライン（`src/lib/subtitle/`）。

## 注意

- 大きな MP4 はブラウザの容量制限に依存します
- **PC とスマホで IndexedDB は別** — 動画は端末ごとに Local Files から入れ直し
