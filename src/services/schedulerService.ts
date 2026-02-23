import { Memo, Trigger } from '../types/models';
import { getMemo } from '../database/repositories/memoRepository';
import { getActiveTriggersByType, updateTrigger } from '../database/repositories/triggerRepository';
import { scheduleNotificationAt, sendNotification } from './notificationService';
import { startAlarm } from './alarmService';

export async function scheduleAllDatetimeTriggers(): Promise<void> {
    const triggers = await getActiveTriggersByType('datetime');
    for (const trigger of triggers) {
        await scheduleDatetimeTrigger(trigger);
    }
}

export async function scheduleDatetimeTrigger(trigger: Trigger): Promise<void> {
    if (!trigger.scheduledAt) return;

    const scheduledDate = new Date(trigger.scheduledAt);
    const now = new Date();

    if (scheduledDate <= now) {
        // Already past, fire immediately if still active
        const memo = await getMemo(trigger.memoId);
        if (memo) {
            await fireTrigger(memo, trigger);
        }
        // Deactivate the trigger
        await updateTrigger(trigger.id, { isActive: false });
        return;
    }

    // Schedule for future
    const memo = await getMemo(trigger.memoId);
    if (!memo) return;

    if (trigger.actionType === 'notification') {
        await scheduleNotificationAt(memo, trigger, scheduledDate);
    } else {
        // For alarms, we still schedule a notification but the handler will start the alarm
        await scheduleNotificationAt(memo, trigger, scheduledDate);
    }
}

export async function startTimerTrigger(trigger: Trigger): Promise<void> {
    if (!trigger.durationSeconds) return;

    const startTime = trigger.startedAt ? new Date(trigger.startedAt) : new Date();
    const endTime = new Date(startTime.getTime() + trigger.durationSeconds * 1000);
    const now = new Date();

    if (endTime <= now) {
        // Timer already expired
        const memo = await getMemo(trigger.memoId);
        if (memo) {
            await fireTrigger(memo, trigger);
        }
        await updateTrigger(trigger.id, { isActive: false });
        return;
    }

    // Schedule notification at end time
    const memo = await getMemo(trigger.memoId);
    if (!memo) return;

    await scheduleNotificationAt(memo, trigger, endTime);
}

export async function scheduleAllTimerTriggers(): Promise<void> {
    const triggers = await getActiveTriggersByType('timer');
    for (const trigger of triggers) {
        await startTimerTrigger(trigger);
    }
}

async function fireTrigger(memo: Memo, trigger: Trigger): Promise<void> {
    if (trigger.actionType === 'alarm') {
        await startAlarm(memo, trigger);
    } else {
        await sendNotification(memo, trigger);
    }
}

export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}時間`);
    if (mins > 0) parts.push(`${mins}分`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`);

    return parts.join('');
}
