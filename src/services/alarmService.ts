import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { Memo, Trigger } from '../types/models';
import { sendNotification } from './notificationService';

let currentSound: Audio.Sound | null = null;
let vibrationInterval: ReturnType<typeof setInterval> | null = null;
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
    // Stop any existing alarm first
    await stopAlarm();

    isAlarmActive = true;
    currentAlarmMemo = memo;
    currentAlarmTrigger = trigger;

    // Also send a notification so user can see it
    await sendNotification(memo, trigger, '⏰ アラーム！タップして停止');

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
            // Attempt to use a bundled alarm sound if available
            const { sound } = await Audio.Sound.createAsync(
                { uri: 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg' },
                {
                    isLooping: true,
                    volume: 1.0,
                    shouldPlay: true,
                }
            );
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

export async function stopAlarm(): Promise<void> {
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

    currentAlarmMemo = null;
    currentAlarmTrigger = null;

    notifyListeners();
}

function startVibration(): void {
    if (vibrationInterval) clearInterval(vibrationInterval);

    // Vibrate every second
    vibrationInterval = setInterval(async () => {
        if (!isAlarmActive) {
            stopVibration();
            return;
        }
        try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch {
            // ignore on web or unsupported
        }
    }, 1000);
}

function stopVibration(): void {
    if (vibrationInterval) {
        clearInterval(vibrationInterval);
        vibrationInterval = null;
    }
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
