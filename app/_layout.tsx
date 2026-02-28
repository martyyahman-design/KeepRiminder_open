import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { MemoProvider } from '../src/contexts/MemoContext';
import { AuthProvider } from '../src/contexts/AuthContext';
import { SyncProvider } from '../src/contexts/SyncContext';
import { requestNotificationPermissions } from '../src/services/notificationService';
import { requestLocationPermissions, syncGeofences } from '../src/services/geofencingService';
import { scheduleAllDatetimeTriggers, scheduleAllTimerTriggers } from '../src/services/schedulerService';
import { Colors } from '../src/theme';

export default function RootLayout() {
    const colorScheme = useColorScheme();
    const colors = colorScheme === 'dark' ? Colors.dark : Colors.light;

    // Ignore Expo's "Unable to activate keep awake" unhandled promise rejection during dev
    if (__DEV__) {
        const originalConsoleError = console.error;
        console.error = (...args) => {
            if (args[0] && typeof args[0] === 'string' && args[0].includes('Unable to activate keep awake')) {
                return;
            }
            originalConsoleError(...args);
        };

        // Also suppress unhandled promise rejections specifically for keep awake
        const { ErrorUtils } = global as any;
        if (ErrorUtils) {
            const originalHandler = ErrorUtils.getGlobalHandler();
            ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
                if (error && error.message && error.message.includes('Unable to activate keep awake')) {
                    console.log('Suppressed keep awake error');
                    return;
                }
                if (originalHandler) {
                    originalHandler(error, isFatal);
                }
            });
        }
    }

    useEffect(() => {
        initializeApp();
    }, []);

    async function initializeApp() {
        try {
            await requestNotificationPermissions();
            await requestLocationPermissions();
            // Sync geofences and schedule triggers on app start
            await syncGeofences();
            await scheduleAllDatetimeTriggers();
            await scheduleAllTimerTriggers();
        } catch (err) {
            console.error('Error initializing app:', err);
        }
    }

    return (
        <AuthProvider>
            <MemoProvider>
                <SyncProvider>
                    <StatusBar style={colors.statusBar} />
                    <Stack
                        screenOptions={{
                            headerStyle: {
                                backgroundColor: colors.background,
                            },
                            headerTintColor: colors.text,
                            headerShadowVisible: false,
                            contentStyle: {
                                backgroundColor: colors.background,
                            },
                            animation: 'slide_from_right',
                        }}
                    >
                        <Stack.Screen
                            name="(tabs)"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="memo/[id]"
                            options={{
                                title: 'メモ',
                                headerBackTitle: '戻る',
                            }}
                        />
                        <Stack.Screen
                            name="trigger/edit"
                            options={{
                                title: 'トリガー設定',
                                headerBackTitle: '戻る',
                                presentation: 'modal',
                            }}
                        />
                        <Stack.Screen
                            name="alarm"
                            options={{
                                headerShown: false,
                                presentation: 'fullScreenModal',
                                gestureEnabled: false,
                            }}
                        />
                    </Stack>
                </SyncProvider>
            </MemoProvider>
        </AuthProvider>
    );
}
