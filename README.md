# Script Player

MediaDict の Repeat Player に近い、Android 向け学習プレイヤー（MVP）。

## できること（v0.1）

- ローカル動画を開く
- **学習用字幕 SRT** と **翻訳字幕 SRT** を選び、セリフ一覧に **常時2行表示**
- セリフ行タップでその区間を再生（終端で停止）
- 動画内の **複数音声トラック** を切り替え
- 動画内の **埋め込み字幕トラック** をプレイヤー表示（トラックがある場合）

## まだこれから

- 埋め込み字幕からスクリプト一覧を自動生成（今は SRT から一覧を作る）
- 同フォルダ SRT の自動検出
- ブックマーク、RewindSub、辞書

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

## 技術

- Kotlin + Jetpack Compose
- Media3 ExoPlayer
