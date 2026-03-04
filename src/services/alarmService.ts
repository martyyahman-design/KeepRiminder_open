import { Audio } from 'expo-av';
import { Platform, Vibration } from 'react-native';
import { Memo, Trigger } from '../types/models';
import { sendNotification } from './notificationService';

let currentSound: Audio.Sound | null = null;
let isAlarmActive = false;
let currentAlarmMemo: Memo | null = null;
let currentAlarmTrigger: Trigger | null = null;

// Listeners for alarm state changes
type AlarmListener = (active: boolean, memo?: Memo, trigger?: Trigger) => void;
const listeners: Set<AlarmListener> = new Set();

export function addAlarmListener(listener: AlarmListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notifyListeners(): void {
    listeners.forEach(l => l(isAlarmActive, currentAlarmMemo || undefined, currentAlarmTrigger || undefined));
}

export async function startAlarm(memo: Memo, trigger: Trigger): Promise<void> {
    if (Platform.OS === 'web') return;
    // Stop any existing alarm first, but don't notify listeners to prevent bouncing
    await stopAlarm(false);

    isAlarmActive = true;
    currentAlarmMemo = memo;
    currentAlarmTrigger = trigger;

    // Also send a notification so user can see it
    // await sendNotification(memo, trigger, '⏰ アラーム！タップして停止');

    try {
        // Set audio mode for alarm
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            staysActiveInBackground: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false,
        });

        // Try to load alarm sound
        try {
            // Use local bundled melodic sound
            const { sound } = await Audio.Sound.createAsync(
                require('../../assets/sounds/melodic_alarm.wav')
            );
            await sound.setIsLoopingAsync(true);
            await sound.setVolumeAsync(1.0);
            await sound.playAsync();
            currentSound = sound;
        } catch (soundErr) {
            console.warn('Could not load alarm sound, continuing with vibration only:', soundErr);
        }
    } catch (err) {
        console.warn('Could not play alarm sound:', err);
    }

    // Start vibration pattern
    startVibration();

    notifyListeners();
}

export async function stopAlarm(notify: boolean = true): Promise<void> {
    isAlarmActive = false;

    // Stop sound
    if (currentSound) {
        try {
            await currentSound.stopAsync();
            await currentSound.unloadAsync();
        } catch {
            // ignore cleanup errors
        }
        currentSound = null;
    }

    // Stop vibration
    stopVibration();

    // Deactivate trigger in DB so tapping the old notification won't restart the alarm
    if (currentAlarmTrigger?.id) {
        try {
            const { updateTrigger } = require('../database/repositories/triggerRepository');
            await updateTrigger(currentAlarmTrigger.id, { isActive: false });
        } catch (e) {
            console.error('Failed to deactivate alarm trigger in DB:', e);
        }
    }

    // Dismiss any lingering alarm notifications from the tray
    try {
        const Notifications = require('expo-notifications');
        await Notifications.dismissAllNotificationsAsync();
    } catch (e) {
        console.error('Failed to dismiss notifications:', e);
    }

    currentAlarmMemo = null;
    currentAlarmTrigger = null;

    if (notify) {
        notifyListeners();
    }
}

function startVibration(): void {
    if (Platform.OS === 'web') return;

    // Pattern: wait 0ms, vibrate 1000ms, wait 1000ms
    const PATTERN = [0, 1000, 1000];
    // true = repeat the pattern
    Vibration.vibrate(PATTERN, true);
}

function stopVibration(): void {
    if (Platform.OS === 'web') return;
    Vibration.cancel();
}

export function getAlarmState(): {
    isActive: boolean;
    memo: Memo | null;
    trigger: Trigger | null;
} {
    return {
        isActive: isAlarmActive,
        memo: currentAlarmMemo,
        trigger: currentAlarmTrigger,
    };
}
