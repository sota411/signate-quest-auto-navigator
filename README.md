# SIGNATE Quest Auto Navigator

SIGNATEのクエストを自動で進めるChrome拡張機能です。

## 機能

- 「クリア済みにする」ボタンの自動クリック
- 「次へ進む」ボタンの自動クリック
- 問題文の自動読み取りと回答選択
- 「採点する」ボタンの自動クリック
- Gemini API を使用した自動回答（任意）

## インストール方法

1. このディレクトリをローカルにダウンロード
2. Chrome で `chrome://extensions/` を開く
3. 右上の「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. このディレクトリを選択

## 使い方

### 基本的な使い方

1. SIGNATEのクエストページを開く
2. 拡張機能のアイコンをクリック
3. 「開始」ボタンをクリック
4. 自動的にページが進みます
5. 停止したい場合は「停止」ボタンをクリック

### Gemini API の設定（任意）

より正確な回答を得るために、Gemini API を使用することができます。

1. [Google AI Studio](https://makersuite.google.com/app/apikey) で API キーを取得
2. 拡張機能のポップアップを開く
3. 「Gemini API Key」欄に API キーを入力
4. 「保存」ボタンをクリック

API キーを設定しない場合は、フォールバック機能により最初の選択肢が選ばれます。

### 設定

- **遅延時間**: 各操作間の待機時間を調整できます（デフォルト: 2000ミリ秒）
- **Gemini API Key**: Gemini API を使用する場合に設定します

## ファイル構成

```
chrome-extension/
├── manifest.json       # 拡張機能の設定ファイル
├── content.js          # メインロジック（ページ操作）
├── ai-helper.js        # AI連携機能
├── popup.html          # ポップアップUI
├── popup.js            # ポップアップのロジック
├── background.js       # バックグラウンドスクリプト
├── icon16.png          # アイコン (16x16)
├── icon48.png          # アイコン (48x48)
├── icon128.png         # アイコン (128x128)
└── README.md           # このファイル
```

## 開発

### デバッグ

1. Chrome DevTools を開く
2. Console タブで `[QuestNavigator]` でフィルタリング
3. ログを確認

### カスタマイズ

- `content.js`: ボタンのセレクタや動作を変更
- `ai-helper.js`: AI の回答ロジックを変更
- `popup.html/popup.js`: UI をカスタマイズ

## 注意事項

- この拡張機能は教育・学習目的で作成されています
- 使用する際は、SIGNATEの利用規約を確認してください
- 自動化ツールの使用が禁止されている場合は使用しないでください
- API キーは安全に管理してください

## ライセンス

MIT License

## 作成者

Created with Claude Code
