import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { stopAlarm, getAlarmState, addAlarmListener } from '../services/alarmService';
import { FontSize, useThemeColors } from '../theme';
import { Memo, Trigger } from '../types/models';

import * as SplashScreen from 'expo-splash-screen';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function AlarmOverlay() {
    const colors = useThemeColors();
    const [isActive, setIsActive] = useState(getAlarmState().isActive);
    const [alarmMemo, setAlarmMemo] = useState<Memo | null>(getAlarmState().memo || null);
    const [alarmTrigger, setAlarmTrigger] = useState<Trigger | null>(getAlarmState().trigger || null);

    useEffect(() => {
        const unsubscribe = addAlarmListener((active, memo, trigger) => {
            setIsActive(active);
            if (active) {
                setAlarmMemo(memo || null);
                setAlarmTrigger(trigger || null);
            }
        });
        return unsubscribe;
    }, []);

    // If the overlay is active, hide the splash screen immediately after the first UI draw
    useEffect(() => {
        if (isActive) {
            // Need a tiny timeout to ensure the View has actually painted to the screen
            setTimeout(() => {
                SplashScreen.hideAsync().catch(() => { });
            }, 50);
        }
    }, [isActive]);

    const handleStop = async () => {
        await stopAlarm();
        setIsActive(false);
    };

    if (!isActive) {
        return null;
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background, zIndex: 99999, ...StyleSheet.absoluteFillObject }]}>
            {/* Pulsing background effect */}
            <View style={styles.pulseOuter} />
            <View style={styles.pulseMiddle} />

            <View style={styles.content}>
                {/* Icon */}
                <View style={styles.iconContainer}>
                    <Ionicons name="alarm" size={64} color="#FFFFFF" />
                </View>

                {/* Title */}
                <Text style={styles.title}>
                    {alarmMemo?.title || 'アラーム'}
                </Text>

                {/* Content */}
                {alarmMemo?.content ? (
                    <Text style={styles.body}>
                        {alarmMemo.content}
                    </Text>
                ) : null}

                {/* Trigger info */}
                {alarmTrigger && (
                    <Text style={styles.triggerInfo}>
                        {alarmTrigger.type === 'datetime' ? '⏰ 予定時刻' :
                            alarmTrigger.type === 'timer' ? '⏱ タイマー終了' :
                                alarmTrigger.type === 'location_enter' ? `📍 ${alarmTrigger.locationName || '場所'}に到着` :
                                    `📍 ${alarmTrigger.locationName || '場所'}から離脱`}
                    </Text>
                )}

                {/* Snooze Buttons */}
                <View style={styles.snoozeContainer}>
                    {[
                        { label: '1分', val: 1 },
                        { label: '5分', val: 5 },
                        { label: '1時間', val: 60 },
                    ].map((s) => (
                        <TouchableOpacity
                            key={s.val}
                            style={styles.snoozeButton}
                            onPress={async () => {
                                if (alarmTrigger?.id) {
                                    const { snoozeTrigger } = require('../services/schedulerService');
                                    await snoozeTrigger(alarmTrigger.id, s.val);
                                    await stopAlarm();
                                    setIsActive(false);
                                }
                            }}
                        >
                            <Text style={styles.snoozeText}>{s.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Stop Button */}
                <TouchableOpacity
                    style={styles.stopButton}
                    onPress={handleStop}
                    activeOpacity={0.8}
                >
                    <Ionicons name="close" size={32} color={colors.primary} />
                    <Text style={[styles.stopButtonText, { color: colors.primary }]}>
                        停止
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pulseOuter: {
        position: 'absolute',
        width: SCREEN_WIDTH * 1.5,
        height: SCREEN_WIDTH * 1.5,
        borderRadius: SCREEN_WIDTH,
        backgroundColor: '#FF6F61',
        opacity: 0.1,
    },
    pulseMiddle: {
        position: 'absolute',
        width: SCREEN_WIDTH * 1.0,
        height: SCREEN_WIDTH * 1.0,
        borderRadius: SCREEN_WIDTH,
        backgroundColor: '#FF3B30',
        opacity: 0.15,
    },
    content: {
        alignItems: 'center',
        padding: 24,
        zIndex: 10,
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#FF3B30',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 32,
        shadowColor: '#FF3B30',
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
    },
    title: {
        fontSize: FontSize.title,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 16,
        textAlign: 'center',
    },
    body: {
        fontSize: FontSize.lg,
        color: 'rgba(255, 255, 255, 0.8)',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 28,
    },
    triggerInfo: {
        fontSize: FontSize.md,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 48,
    },
    snoozeContainer: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 32,
    },
    snoozeButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    snoozeText: {
        color: '#FFFFFF',
        fontSize: FontSize.md,
        fontWeight: '600',
    },
    stopButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 16,
        paddingHorizontal: 48,
        borderRadius: 32,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5,
    },
    stopButtonText: {
        fontSize: FontSize.xxl,
        fontWeight: 'bold',
        marginLeft: 8,
    },
});
