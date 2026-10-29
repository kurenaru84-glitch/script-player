# Script Player

MediaDict の Repeat Player に近い語学学習プレイヤー。

| 版 | 場所 | デプロイ |
|---|---|---|
| **Web（PWA）** | [`web/`](web/) — Next.js + Tailwind | **GitHub → Vercel**（Root Directory = `web`）→ スマホで URL → ホーム画面に追加 |
| **Android** | `app/` — Kotlin + Compose | Android Studio / GitHub Actions APK |

## できること（v0.2）

- ローカル動画を開く（**一度選んだ動画は保存**・起動時に前回の動画を自動で開く・**保存一覧**から切替）
- 学習／翻訳 SRT も動画ごとに記憶（次回から自動で読み込み）
- **学習用字幕 SRT** と **翻訳字幕 SRT** を選び、セリフ一覧に **常時2行表示**
- セリフ行タップでその区間を再生（終端で停止）
- **リピート**（1 / 2 / 3 / 5 / 10 / 20 回をタップで切替）
- **お気に入り**（動画ごとに保存）・★のみ表示・**お気に入り連続再生**
- **バックグラウンド再生**（画面オフでも音声継続・通知から操作）
- セリフ **AI 解説**（Gemini 3.8 Flash・API キー・生成結果は端末にキャッシュ）
- **連続再生**（セリフ終端で止まらない。リピート ×N はその行だけループ後に続行）
- 動画内の **複数音声トラック** を切り替え
- 動画内の **埋め込み字幕トラック** をプレイヤー表示（トラックがある場合）

## まだこれから

- 埋め込み字幕からスクリプト一覧を自動生成（今は SRT から一覧を作る）
- 同フォルダ SRT の自動検出
- 辞書連携、RewindSub 風の細かい UI

## Web をスマホで使う（ピクスピと同じ流れ）

詳細は [`web/README.md`](web/README.md)。

1. GitHub に push
2. [Vercel](https://vercel.com) で Import → **Root Directory = `web`**
3. Deploy → PC で `https://….vercel.app` を確認
4. URL をスマホに送る → **ホーム画面に追加**

## 開発環境（W 側で必要）

1. **Android Studio**（最新版推奨）をインストール
2. Studio 初回起動で **Android SDK** と **JDK 17** を入れる
3. このフォルダを開く: `/Users/naruki/Projects/script-player`
4. Gradle sync → 実機 or エミュレータで Run

### 実機テスト（Android スマホ）

1. 設定 → 開発者向けオプション → **USB デバッグ** ON
2. USB 接続 → Studio から Run
3. アプリで **動画** → Downloads などから MP4 を選択
4. **学習字幕**（例: `.German.srt`）と **翻訳字幕**（例: `.Japanese.srt`）を選択

※ Android 11+ ではファイルは「選んだ URI」のみ読めます（MediaDict と同様）。

## GitHub Actions で APK ビルド（Android Studio 不要）

`main` に push すると GitHub 上で Debug APK が自動ビルドされます。

### 1. GitHub にリポジトリを作る

[GitHub](https://github.com/new) で **`script-player`**（Public / Private どちらでも可）を作成。

### 2. 初回 push

```bash
cd /Users/naruki/Projects/script-player
git add .
git commit -m "Initial Android MVP with CI"
git branch -M main
git remote add origin git@github.com:<your-user>/script-player.git
git push -u origin main
```

### PAT で workflow エラーが出る場合

`without workflow scope` と出たら、まず **アプリ本体だけ push**（いまの repo は CI ファイルを外してあります）。  
その後 GitHub サイト上で workflow を追加します（ブラウザログインなら PAT の workflow 権限不要）。

1. リポジトリ → **Add file** → **Create new file**
2. ファイル名: `.github/workflows/android-build.yml`
3. 中身を `docs/android-build-workflow.yml` からコピペ
4. **Commit directly to main**

### 3. APK を取る

1. GitHub リポジトリ → **Actions**
2. 最新の **Android Debug APK** ワークフローが緑になったら開く
3. **Artifacts** → `script-player-debug-apk` をダウンロード（中身が `app-debug.apk`）

手動ビルド: Actions → **Android Debug APK** → **Run workflow**

### 4. Android にインストール

1. APK をスマホに転送（Drive / AirDrop / USB など）
2. 設定 → **提供元不明のアプリ** を許可（ファイルアプリ or Chrome など）
3. `app-debug.apk` をタップしてインストール

Vercel は不要です。配布は GitHub Actions の Artifact（または後から Releases）だけで足ります。

## インストールできないとき

**「このデバイスにインストールできません」** が出る場合:

1. **Android 8 未満** → 非対応（minSdk 26）
2. **Android 15 以降（Pixel / 新しめ Samsung など）** → 16 KB ページサイズ非対応 APK の可能性  
   - 最新の CI APK（v0.1.1 / versionCode 2 以降）を再ダウンロード
3. 以前入れた同名アプリがあれば **アンインストール** してから再インストール
4. （上級）開発者向けオプション → **16 KB ページで起動** 利用時は、  
   アプリ情報 → 詳細 → **ページサイズ互換モードで実行** を ON

## 技術

- Kotlin + Jetpack Compose
- Media3 ExoPlayer
