import React, { useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { stopAlarm, getAlarmState, addAlarmListener } from '../src/services/alarmService';
import { Spacing, FontSize, BorderRadius, useThemeColors, getCardShadow } from '../src/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function AlarmScreen() {
    const alarmState = getAlarmState();
    const colors = useThemeColors();

    useEffect(() => {
        const unsubscribe = addAlarmListener((active) => {
            if (!active) {
                router.back();
            }
        });
        return unsubscribe;
    }, []);

    const handleStop = async () => {
        await stopAlarm();
        router.back();
    };

    return (
        <View style={styles.container}>
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
                    {alarmState.memo?.title || 'アラーム'}
                </Text>

                {/* Content */}
                {alarmState.memo?.content ? (
                    <Text style={styles.body}>
                        {alarmState.memo.content}
                    </Text>
                ) : null}

                {/* Trigger info */}
                {alarmState.trigger && (
                    <Text style={styles.triggerInfo}>
                        {alarmState.trigger.type === 'datetime' ? '⏰ 予定時刻' :
                            alarmState.trigger.type === 'timer' ? '⏱ タイマー終了' :
                                alarmState.trigger.type === 'location_enter' ? `📍 ${alarmState.trigger.locationName || '場所'}に到着` :
                                    `📍 ${alarmState.trigger.locationName || '場所'}から離脱`}
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
                                if (alarmState.trigger?.id) {
                                    const { snoozeTrigger } = require('../src/services/schedulerService');
                                    await snoozeTrigger(alarmState.trigger.id, s.val);
                                    router.back();
                                }
                            }}
                        >
                            <Text style={styles.snoozeText}>{s.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Stop Button */}
                <TouchableOpacity
                    style={[styles.stopButton, { ...getCardShadow(colors) }]}
                    onPress={handleStop}
                    activeOpacity={0.7}
                >
                    <Text style={styles.stopButtonText}>停止</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1A2E',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pulseOuter: {
        position: 'absolute',
        width: SCREEN_WIDTH * 1.5,
        height: SCREEN_WIDTH * 1.5,
        borderRadius: SCREEN_WIDTH * 0.75,
        backgroundColor: 'rgba(108, 92, 231, 0.08)',
    },
    pulseMiddle: {
        position: 'absolute',
        width: SCREEN_WIDTH,
        height: SCREEN_WIDTH,
        borderRadius: SCREEN_WIDTH * 0.5,
        backgroundColor: 'rgba(108, 92, 231, 0.15)',
    },
    content: {
        alignItems: 'center',
        padding: Spacing.xxxl,
        width: '100%',
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(108, 92, 231, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.xxxl,
    },
    title: {
        fontSize: FontSize.xxxl,
        fontWeight: '800',
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: Spacing.md,
    },
    body: {
        fontSize: FontSize.lg,
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        marginBottom: Spacing.xl,
        lineHeight: 26,
        paddingHorizontal: Spacing.xl,
    },
    triggerInfo: {
        fontSize: FontSize.md,
        color: 'rgba(162, 155, 254, 0.9)',
        textAlign: 'center',
        marginBottom: Spacing.xxxl,
    },
    stopButton: {
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: '#FF6B6B',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: Spacing.xxl,
    },
    stopButtonText: {
        fontSize: FontSize.xxl,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 2,
    },
    snoozeContainer: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginBottom: Spacing.xxl,
    },
    snoozeButton: {
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    snoozeText: {
        color: '#FFFFFF',
        fontSize: FontSize.md,
        fontWeight: '700',
    },
});
