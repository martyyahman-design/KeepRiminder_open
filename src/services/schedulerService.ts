import { Memo, Trigger } from '../types/models';
import { getMemo } from '../database/repositories/memoRepository';
import { getActiveTriggersByType, updateTrigger } from '../database/repositories/triggerRepository';
import { scheduleNotificationAt, sendNotification, cancelNotification } from './notificationService';
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

export async function cancelDatetimeTrigger(trigger: Trigger): Promise<void> {
    await cancelNotification(trigger.id);
}

export async function startTimerTrigger(trigger: Trigger): Promise<void> {
    if (!trigger.durationSeconds && !trigger.scheduledAt) return;

    let endTime: Date;
    if (trigger.scheduledAt) {
        // If snoozed, prioritize the scheduledAt explicit target time
        endTime = new Date(trigger.scheduledAt);
    } else {
        // Normal unsnoozed timer
        const startTime = trigger.startedAt ? new Date(trigger.startedAt) : new Date();
        endTime = new Date(startTime.getTime() + (trigger.durationSeconds || 0) * 1000);
    }
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

export async function cancelTimerTrigger(trigger: Trigger): Promise<void> {
    await cancelNotification(trigger.id);
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

export async function snoozeTrigger(triggerId: string, minutes: number): Promise<void> {
    const trigger = await getActiveTriggersByType('timer').then(ts => ts.find(t => t.id === triggerId)) ||
        await getActiveTriggersByType('datetime').then(ts => ts.find(t => t.id === triggerId)) ||
        await getActiveTriggersByType('location_enter').then(ts => ts.find(t => t.id === triggerId)) ||
        await getActiveTriggersByType('location_exit').then(ts => ts.find(t => t.id === triggerId));

    if (!trigger) return;

    // Stop current alarm
    await require('./alarmService').stopAlarm();

    const now = new Date();
    const newTime = new Date(now.getTime() + minutes * 60 * 1000);

    if (trigger.type === 'timer') {
        const scheduledAt = newTime.toISOString();
        await updateTrigger(triggerId, {
            isActive: true,
            scheduledAt: scheduledAt
        });
        const updatedTrigger = { ...trigger, isActive: true, scheduledAt };
        await startTimerTrigger(updatedTrigger);
    } else if (trigger.type === 'datetime') {
        const scheduledAt = newTime.toISOString();
        await updateTrigger(triggerId, {
            isActive: true,
            scheduledAt
        });
        const updatedTrigger = { ...trigger, isActive: true, scheduledAt };
        await scheduleDatetimeTrigger(updatedTrigger);
    } else if (trigger.type.startsWith('location')) {
        // Location triggers don't usually have snooze in minutes,
        // but let's just reactivate it for now.
        // If we want a time-based snooze for location, it's more complex.
        // For now, let's just reactive it so it fires again when entering/exiting.
        await updateTrigger(triggerId, { isActive: true });
        const updatedTrigger = { ...trigger, isActive: true };
        await require('./geofencingService').registerGeofence(updatedTrigger);
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
