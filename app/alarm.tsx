import React, { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { getAlarmState, startAlarm } from '../src/services/alarmService';
import { getMemo } from '../src/database/repositories/memoRepository';
import { getTrigger } from '../src/database/repositories/triggerRepository';

/**
 * Headless route receiver for Expo Router Deep Links.
 * Instead of rendering UI here and suffering navigation push delays/flickers,
 * this simply reads the parameters, triggers the global AlarmOverlay,
 * and immediately redirects back to the Home screen behind the scenes.
 */
export default function AlarmScreen() {
    const params = useLocalSearchParams();
    const alarmState = getAlarmState();
    const hasInitialized = React.useRef(false);

    useEffect(() => {
        const initDirectAlarmIfNeeded = async () => {
            if (hasInitialized.current) return;
            hasInitialized.current = true;

            if (params.memoId && params.triggerId && !alarmState.isActive) {
                console.log('Deep-link received. Triggering global overlay and returning to root...');
                try {
                    const memo = await getMemo(params.memoId as string);
                    const trigger = await getTrigger(params.triggerId as string);
                    if (memo && trigger && trigger.isActive) {
                        await startAlarm(memo, trigger);
                    } else if (memo) {
                        // Already inactive, route to memo detail behind the scenes
                        router.replace(`/memo/${memo.id}`);
                        return;
                    }
                } catch (e) {
                    console.error('Failed to init direct alarm from link:', e);
                }
            }

            // Always clear this route from the stack so the user doesn't get stuck on a blank page
            // The AlarmOverlay is currently visible on top of everything anyway.
            router.replace('/');
        };

        // Adding a slight delay to ensure RootLayout has mounted before we push
        setTimeout(initDirectAlarmIfNeeded, 50);
    }, [params.memoId, params.triggerId]);

    return null;
}
