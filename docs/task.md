# KeepReminder - Next Features

## 目標
実機テストにおいて判明した「再起動時のログアウト」問題を解消し、オフラインでも即座にメモが参照できる「オフライン優先の自動ログイン・同期」を実装します。

## オフライン優先の自動ログイン・同期 (Offline-First Auto-Login & Sync)
- [x] **要件整理・計画策定**
  - [x] 実装計画のレビュー依頼
- [x] **自動ログインの実装 (AuthContext)**
  - [x] `signInSilently` を用いたバックグラウンド認証の追加
- [x] **同期ロジックの改善 (SyncContext)**
  - [x] ローカルデータ優先表示と、バックグラウンド同期インジケーターの実装
- [x] **UIへの反映 (_layout.tsx)**
  - [x] 同期状況を示す控えめなUIの追加、および認証待ち状態のハンドリング
- [x] **スプラッシュ画面の変更**
  - [x] `app.json` の `splash.image` をアプリアイコンに更新
  - [x] ネイティブ設定の同期 (`expo prebuild`)
- [x] **ナビゲーションと戻るボタンの改善**
  - [x] `app/_layout.tsx` の `Stack` 常時表示化
  - [x] `AlarmOverlay.tsx` での Android 戻るボタンのハンドリング
- [x] **自動ログインの不具合修正（レベル2）**
  - [x] `@react-native-async-storage/async-storage` の導入
  - [x] `offlineAccess: true` の設定
  - [x] ログインフラグの永続化と起動時判定の強化
- [x] **ビルドの再作成（完了）**
  - [x] デバッグ版ビルド
  - [x] リリース版ビルド
- [x] **Web版のデプロイ（完了）**
  - [x] `app.json` の `baseUrl` 設定
  - [x] `dist` フォルダの書き出し
  - [x] 公開用リポジトリへのアップロード (PAT使用)
  - [x] `.nojekyll` 追加によるアセット読み込み不備の修正
- [x] **動作検証**
  - [x] 実機でのタスクキル後再起動テスト
  - [x] 公開されたWeb版の動作確認（正常稼働中）
