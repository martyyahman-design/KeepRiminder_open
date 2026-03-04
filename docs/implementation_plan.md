# Auto-Login Persistence Fix Plan (Level 2)

## Goal Description
アプリを完全に終了（キル）して再起動した際、確実にログイン状態が復元されるように、Google Sign-In の設定とセッション管理を抜本的に強化します。

## Proposed Changes

### [MODIFY] [AuthContext.tsx](file:///C:/develop/keepReminder/src/contexts/AuthContext.tsx)
- **offlineAccess の有効化**: `GoogleSignin.configure` で `offlineAccess: true` を設定します。これにより、バックグラウンドでのトークン更新（リフレッシュトークン）が許可され、セッション維持がより確実になります。
- **hasPreviousSignIn() の活用**: `signInSilently()` を呼ぶ前に、前回サインインした形跡があるかを明示的にチェックします。
- **ログインヒントの永続化 (AsyncStorage)**: 
  - ユーザーが一度でも手動でログインに成功した際、ローカルストレージに `HAS_LOGGED_IN` フラグを保存します。
  - 起動時、このフラグがある場合は、Googleからの応答が返るまで `loading` 状態を維持（スプラッシュ画面を継続）し、勝手にゲストモードで起動するのを防ぎます。
- **エラーハンドリングの強化**: ネットワーク一時不通などで失敗した場合も、フラグがあればリトライを検討するようにします。

## User Review Required
> [!NOTE]
> この修正により、ログイン済みのユーザーについては起動時の「データ確認中（スプラッシュ画面）」がコンマ数秒長くなる可能性がありますが、確実に前回のログイン状態（Googleドライブ同期）が復元されるようになります。

## Verification Plan
### Manual Verification
1. **確実なセッション復元**: 
   - ログイン後、アプリをタスクキル。
   - 再起動し、ログイン画面を一度も挟まずにメモ一覧が表示され、右上の同期アイコンが動くことを確認。
   - 機内モード（オフライン）での再起動時も、ログイン状態自体は保持されていること（メニューにユーザー情報があること）を確認。
