import React, { useEffect, useRef, useState } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, AppState, Alert, NativeModules, Platform, LogBox } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MemoProvider } from '../src/contexts/MemoContext';
import { AuthProvider } from '../src/contexts/AuthContext';
import { SyncProvider } from '../src/contexts/SyncContext';
import { NetworkProvider } from '../src/contexts/NetworkContext';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermissions } from '../src/services/notificationService';
import { requestLocationPermissions, syncGeofences } from '../src/services/geofencingService';
import { scheduleAllDatetimeTriggers, scheduleAllTimerTriggers } from '../src/services/schedulerService';
import { getMemo } from '../src/database/repositories/memoRepository';
import { getTrigger } from '../src/database/repositories/triggerRepository';
import { Colors } from '../src/theme';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import AlarmOverlay from '../src/components/AlarmOverlay';
import { useAuth } from '../src/contexts/AuthContext';
import { useSync } from '../src/contexts/SyncContext';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

SplashScreen.preventAutoHideAsync();

// Ignore Expo's "Unable to activate keep awake" unhandled promise rejection during dev
LogBox.ignoreLogs(['Unable to activate keep awake']);

function SyncIndicator() {
    const { isSyncing, lastSyncedAt, syncError } = useSync();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    if (!isSyncing && !lastSyncedAt && !syncError) return null;

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <View style={styles.syncIndicatorContainer}>
            {isSyncing ? (
                <View style={styles.syncRow}>
                    <ActivityIndicator size="small" color={isDark ? '#aaa' : '#888'} />
                    {Platform.OS === 'web' && <Text style={[styles.syncText, { color: isDark ? '#aaa' : '#888' }]}>同期中...</Text>}
                </View>
            ) : syncError ? (
                <View style={styles.syncRow}>
                    <Ionicons name="warning" size={14} color="#FF5252" />
                    {Platform.OS === 'web' && (
                        <Text style={[styles.syncText, { color: '#FF5252' }]} numberOfLines={1}>
                            同期失敗: {syncError}
                        </Text>
                    )}
                </View>
            ) : lastSyncedAt && Platform.OS === 'web' ? (
                <View style={styles.syncRow}>
                    <Text style={[styles.syncText, { color: isDark ? '#666' : '#999' }]}>
                        {formatTime(lastSyncedAt)} 同期済
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

export default function RootLayout() {
    return (
        <NetworkProvider>
            <AuthProvider>
                <MemoProvider>
                    <SyncProvider>
                        <RootLayoutContent />
                    </SyncProvider>
                </MemoProvider>
            </AuthProvider>
        </NetworkProvider>
    );
}

function RootLayoutContent() {
    const colorScheme = useColorScheme();
    const colors = colorScheme === 'dark' ? Colors.dark : Colors.light;
    const { loading: authLoading } = useAuth();
    const segments = useSegments();
    const currentSegmentsRef = useRef(segments);
    const isInitializingRef = useRef(false);
    const [isAppReady, setIsAppReady] = useState(false);
    const [hasPendingAlarm, setHasPendingAlarm] = useState(false);

    useEffect(() => {
        currentSegmentsRef.current = segments;
    }, [segments]);

    useEffect(() => {
        if (isInitializingRef.current) return;
        isInitializingRef.current = true;
        initializeApp();
    }, []);

    async function initializeApp() {
        const withTimeout = (promise: Promise<any>, timeoutMs: number, name: string) =>
            Promise.race([
                promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} timeout`)), timeoutMs))
            ]);

        try {
            await withTimeout(requestNotificationPermissions(), 5000, 'Notification Permission').catch(console.warn);
            await withTimeout(requestLocationPermissions(), 5000, 'Location Permission').catch(console.warn);
            await withTimeout(syncGeofences(), 5000, 'Sync Geofences').catch(console.warn);
            await withTimeout(scheduleAllDatetimeTriggers(), 5000, 'Schedule Datetime').catch(console.warn);
            await withTimeout(scheduleAllTimerTriggers(), 5000, 'Schedule Timer').catch(console.warn);

            // 「他のアプリの上に重ねて表示」の権限チェック (Androidのみ)
            if (Platform.OS === 'android' && NativeModules.OverlayPermissionModule) {
                const hasPermission = await NativeModules.OverlayPermissionModule.canDrawOverlays();
                if (!hasPermission) {
                    Alert.alert(
                        'アラームの全画面表示',
                        'バックグラウンドでもアラーム画面を最前面に表示するには、「他のアプリの上に重ねて表示」の権限が必要です。',
                        [
                            { text: '設定しない', style: 'cancel' },
                            {
                                text: '設定画面へ',
                                onPress: () => {
                                    NativeModules.OverlayPermissionModule.requestOverlayPermission();
                                }
                            }
                        ]
                    );
                }
            }

            // Androidネイティブのインテント（アラーム画面起動命令）を検知して瞬時にアラームを開始する
            let foundPendingAlarm = false;
            const checkPendingAlarm = async () => {
                // 1. Check if the app was opened via the alarm deep link
                const initialUrl = await Linking.getInitialURL();
                if (initialUrl && initialUrl.includes('/alarm')) {
                    const parsedUrl = Linking.parse(initialUrl);
                    const memoId = parsedUrl.queryParams?.memoId;
                    const triggerId = parsedUrl.queryParams?.triggerId;

                    if (memoId && triggerId) {
                        const { getAlarmState } = require('../src/services/alarmService');
                        if (!getAlarmState().isActive) {
                            const memo = await getMemo(memoId as string);
                            const trigger = await getTrigger(triggerId as string);
                            if (memo && trigger && trigger.isActive) {
                                foundPendingAlarm = true;
                                setHasPendingAlarm(true);
                                const { startAlarm } = require('../src/services/alarmService');
                                await startAlarm(memo, trigger);
                            }
                        }
                    }
                }

                if (!foundPendingAlarm && Platform.OS === 'android' && NativeModules.OverlayPermissionModule) {
                    try {
                        const result = await NativeModules.OverlayPermissionModule.consumePendingAlarm();
                        if (result && typeof result === 'string') {
                            const [memoId, triggerId] = result.split(',');
                            if (memoId && triggerId) {
                                const { startAlarm, getAlarmState } = require('../src/services/alarmService');
                                if (!getAlarmState().isActive) {
                                    const memo = await getMemo(memoId);
                                    const trigger = await getTrigger(triggerId);
                                    if (memo && trigger && trigger.isActive) {
                                        foundPendingAlarm = true;
                                        setHasPendingAlarm(true);
                                        await startAlarm(memo, trigger);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Failed to consume pending alarm intent:', e);
                    }
                }
            };

            // アプリ起動時にチェック
            await checkPendingAlarm();

            // アプリがバックグラウンドから復帰した時にもチェック
            AppState.addEventListener('change', (nextAppState) => {
                if (nextAppState === 'active') {
                    // 復帰時にアラームがなければ通常のナビゲーションツリーを見せる
                    checkPendingAlarm().then(() => {
                        const { getAlarmState } = require('../src/services/alarmService');
                        if (!getAlarmState().isActive) {
                            setHasPendingAlarm(false);
                        }
                    });
                }
            });

            // AlarmStatusのグローバル監視
            const { addAlarmListener } = require('../src/services/alarmService');
            addAlarmListener((active: boolean) => {
                if (!active) {
                    setHasPendingAlarm(false);
                }
            });

            // ナビゲーション関数（不要になったが通知タップ用の安全装置として残す）
            const safeNavigate = (path: string) => {
                router.push(path as any);
            };

            // 通知を受信したとき（フォアグラウンド時）
            Notifications.addNotificationReceivedListener(async (notification) => {
                const data = notification.request.content.data as any;
                if (data && data.actionType === 'alarm' && data.memoId && data.triggerId) {
                    const memo = await getMemo(data.memoId);
                    const trigger = await getTrigger(data.triggerId);
                    if (memo && trigger) {
                        const { startAlarm, getAlarmState } = require('../src/services/alarmService');
                        if (!getAlarmState().isActive) {
                            setHasPendingAlarm(true);
                            await startAlarm(memo, trigger);
                        }
                    }
                }
            });

            // 通知をタップしたとき（バックグラウンド/キル状態から復帰時）
            Notifications.addNotificationResponseReceivedListener(async (response) => {
                const data = response.notification.request.content.data as any;
                if (data && data.actionType === 'alarm' && data.memoId && data.triggerId) {
                    const memo = await getMemo(data.memoId);
                    const trigger = await getTrigger(data.triggerId);
                    if (memo && trigger) {
                        if (!trigger.isActive) {
                            console.log('Tap on an old alarm notification. Routing to memo detail.');
                            safeNavigate(`/memo/${data.memoId}`);
                            return;
                        }
                        const { startAlarm, getAlarmState } = require('../src/services/alarmService');
                        if (!getAlarmState().isActive) {
                            setHasPendingAlarm(true);
                            await startAlarm(memo, trigger);
                        }
                    }
                } else if (data && data.memoId) {
                    safeNavigate(`/memo/${data.memoId}`);
                }
            });

        } catch (err) {
            console.error('Error initializing app:', err);
        } finally {
            setIsAppReady(true);
        }
    }

    // Keep splash screen visible until initialization completes AND the first render happens
    useEffect(() => {
        if (isAppReady && !authLoading && !hasPendingAlarm) {
            const hideSplash = async () => {
                try {
                    await SplashScreen.hideAsync();
                } catch (e) {
                    console.warn('Failed to hide splash screen', e);
                }
            };
            setTimeout(hideSplash, 100);
        }
    }, [isAppReady, authLoading, hasPendingAlarm]);

    if (!isAppReady) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.text, marginTop: 10 }}>アプリを初期化中...</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <StatusBar style={colors.statusBar} />
            <AlarmOverlay />
            <SyncIndicator />
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
        </View>
    );
}

const styles = StyleSheet.create({
    syncIndicatorContainer: {
        position: 'absolute',
        top: Platform.OS === 'web' ? 45 : 62,
        right: Platform.OS === 'web' ? 15 : 100, // Android ではアカウントアイコンの左側に配置
        zIndex: 9999,
        backgroundColor: 'transparent',
    },
    syncRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    syncText: {
        fontSize: 10,
        fontWeight: '500',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
