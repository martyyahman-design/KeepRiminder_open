import 'expo-router/entry';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const ALARM_NOTIFICATION_TASK = 'ALARM_BACKGROUND_NOTIFICATION_TASK';

// バックグラウンド通知タスクを定義（モジュールスコープ必須）
TaskManager.defineTask(ALARM_NOTIFICATION_TASK, async ({ data, error }: any) => {
    if (error) {
        console.error('Background notification task error:', error);
        return;
    }
    if (!data) return;

    // dataはNotificationTaskPayload
    // フォアグラウンド/バックグラウンドの通知データを取り出す
    const notification = data.notification as Notifications.Notification | undefined;
    const actionIdentifier = (data as any).actionIdentifier;

    const notifData = notification?.request?.content?.data as any;

    if (notifData && notifData.actionType === 'alarm') {
        const { memoId, triggerId } = notifData;

        // JSのバックグラウンドタスク（別スレッド）で expo-av の startAlarm を実行すると、
        // ExoPlayer が 「Player is accessed on the wrong thread」 エラーでクラッシュするため削除。
        // （ネイティブ側からの FullScreenIntent / DeepLink により MainActivity が強制起動され、
        // メインスレッドで alarm.tsx がマウントされた際に startAlarm が安全に実行されます。）
    }
});

// バックグラウンド通知タスクを登録
(async () => {
    if (Platform.OS !== 'web') {
        try {
            await Notifications.registerTaskAsync(ALARM_NOTIFICATION_TASK);
        } catch (e) {
            console.warn('Failed to register background notification task:', e);
        }
    }
})();
