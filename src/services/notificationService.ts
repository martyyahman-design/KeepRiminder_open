import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Memo, Trigger } from '../types/models';

// Configure notification handler
Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
        const data = notification.request.content.data as any;
        const isAlarm = data && data.actionType === 'alarm';

        return {
            shouldShowAlert: !isAlarm,
            shouldPlaySound: !isAlarm,
            shouldSetBadge: true,
            shouldShowBanner: !isAlarm,
            shouldShowList: true,
        };
    },
});

export async function requestNotificationPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;

    console.log('notificationService: getPermissionsAsync...');
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('notificationService: current status:', existingStatus);
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        console.log('notificationService: requestPermissionsAsync...');
        const { status } = await Notifications.requestPermissionsAsync();
        console.log('notificationService: new status:', status);
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        return false;
    }

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('reminders', {
            name: 'リマインダー',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF6B6B',
            sound: 'default',
        });

        await Notifications.setNotificationChannelAsync('alarms', {
            name: 'アラーム',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 500, 500],
            lightColor: '#FF0000',
            sound: 'default',
        });
    }

    return true;
}

export async function sendNotification(
    memo: Memo,
    trigger: Trigger,
    body?: string
): Promise<string> {
    if (Platform.OS === 'web') {
        console.log('Web Notification:', memo.title, body || memo.content);
        return 'web-notification-id';
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
            title: memo.title || 'KeepReminder',
            body: body || memo.content || getTriggerDescription(trigger),
            data: { memoId: memo.id, triggerId: trigger.id, actionType: trigger.actionType },
            sound: true,
            ...(Platform.OS === 'android' && {
                channelId: trigger.actionType === 'alarm' ? 'alarms' : 'reminders',
            }),
        },
        trigger: null, // immediate
    });

    return notificationId;
}

export async function scheduleNotificationAt(
    memo: Memo,
    trigger: Trigger,
    date: Date
): Promise<string> {
    if (Platform.OS === 'web') {
        console.log('Web Scheduled Notification at', date, memo.title);
        return 'web-notification-id';
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
            title: memo.title || 'KeepReminder',
            body: memo.content || getTriggerDescription(trigger),
            data: { memoId: memo.id, triggerId: trigger.id, actionType: trigger.actionType },
            sound: true,
            ...(Platform.OS === 'android' && {
                channelId: trigger.actionType === 'alarm' ? 'alarms' : 'reminders',
            }),
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date,
        },
    });

    return notificationId;
}

export async function cancelNotification(notificationId: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export async function cancelAllNotifications(): Promise<void> {
    if (Platform.OS === 'web') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
}

function getTriggerDescription(trigger: Trigger): string {
    switch (trigger.type) {
        case 'datetime':
            return `予定の時刻になりました`;
        case 'timer':
            return `タイマーが終了しました`;
        case 'location_enter':
            return `${trigger.locationName || '場所'}に到着しました`;
        case 'location_exit':
            return `${trigger.locationName || '場所'}から離れました`;
        default:
            return 'リマインダー';
    }
}
