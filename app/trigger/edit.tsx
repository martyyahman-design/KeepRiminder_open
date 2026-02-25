import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Alert,
    Platform,
    Switch,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, Spacing, FontSize, BorderRadius } from '../../src/theme';
import { useMemos } from '../../src/contexts/MemoContext';
import { CalendarDatePicker } from '../../src/components/CalendarDatePicker';
import { TimePicker } from '../../src/components/TimePicker';
import { TriggerType, ActionType } from '../../src/types/models';
import { registerGeofence } from '../../src/services/geofencingService';
import { scheduleDatetimeTrigger, startTimerTrigger } from '../../src/services/schedulerService';
import { getCurrentLocation } from '../../src/services/geofencingService';

const TRIGGER_TYPES: { type: TriggerType; icon: string; label: string; desc: string }[] = [
    { type: 'timer', icon: 'timer', label: 'タイマー', desc: '設定時間後に発火' },
    { type: 'datetime', icon: 'calendar', label: '日時', desc: '指定した日時に発火' },
    { type: 'location_enter', icon: 'enter', label: 'エリア入場', desc: '場所に入った時に発火' },
    { type: 'location_exit', icon: 'exit', label: 'エリア退場', desc: '場所から出た時に発火' },
];

export default function TriggerEditScreen() {
    const { memoId } = useLocalSearchParams<{ memoId: string }>();
    const { createTrigger } = useMemos();
    const colors = useThemeColors();

    const [selectedType, setSelectedType] = useState<TriggerType>('timer');
    const [actionType, setActionType] = useState<ActionType>('alarm');

    // Datetime state
    const [isDatePickerVisible, setDatePickerVisible] = useState(false);
    const [isTimePickerVisible, setTimePickerVisible] = useState(false);
    const [year, setYear] = useState(new Date().getFullYear().toString());
    const [month, setMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [day, setDay] = useState(new Date().getDate().toString().padStart(2, '0'));
    const [hour, setHour] = useState(new Date().getHours().toString().padStart(2, '0'));
    const [minute, setMinute] = useState(new Date().getMinutes().toString().padStart(2, '0'));

    // Timer state
    const [isDurationPickerVisible, setDurationPickerVisible] = useState(false);
    const [isTargetTimePickerVisible, setTargetTimePickerVisible] = useState(false);
    const [timerMode, setTimerMode] = useState<'countdown' | 'time'>('countdown');
    const [timerHours, setTimerHours] = useState('0');
    const [timerMinutes, setTimerMinutes] = useState('5');
    const [timerSeconds, setTimerSeconds] = useState('0');
    const [targetTime, setTargetTime] = useState(() => {
        const d = new Date();
        d.setMinutes(d.getMinutes() + 5);
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    });

    // Location state
    const [locationName, setLocationName] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [radius, setRadius] = useState('200');

    const handleUseCurrentLocation = async () => {
        const location = await getCurrentLocation();
        if (location) {
            setLatitude(location.coords.latitude.toFixed(6));
            setLongitude(location.coords.longitude.toFixed(6));
            setLocationName('現在地');
        } else {
            Alert.alert('エラー', '現在地を取得できませんでした');
        }
    };

    const handleSave = async () => {
        console.log('handleSave called with memoId:', memoId);
        if (!memoId) {
            console.error('memoId is missing in handleSave');
            Alert.alert('エラー', 'メモIDが見つかりません');
            return;
        }

        try {
            let trigger;

            switch (selectedType) {
                case 'datetime': {
                    const scheduledAt = new Date(
                        parseInt(year), parseInt(month) - 1, parseInt(day),
                        parseInt(hour), parseInt(minute)
                    ).toISOString();

                    trigger = await createTrigger({
                        memoId,
                        type: 'datetime',
                        actionType,
                        scheduledAt,
                    });
                    await scheduleDatetimeTrigger(trigger);
                    break;
                }

                case 'timer': {
                    let durationSeconds = 0;
                    if (timerMode === 'countdown') {
                        durationSeconds =
                            parseInt(timerHours || '0') * 3600 +
                            parseInt(timerMinutes || '0') * 60 +
                            parseInt(timerSeconds || '0');
                    } else {
                        // Time specification mode
                        const [targetH, targetM] = targetTime.split(':').map(n => parseInt(n));
                        if (isNaN(targetH) || isNaN(targetM)) {
                            Alert.alert('エラー', '有効な時刻形式（例: 15:00）で入力してください');
                            return;
                        }
                        const now = new Date();
                        const targetDate = new Date();
                        targetDate.setHours(targetH, targetM, 0, 0);

                        // If the target time is already past today, assume it's for tomorrow
                        if (targetDate <= now) {
                            targetDate.setDate(targetDate.getDate() + 1);
                        }

                        durationSeconds = Math.floor((targetDate.getTime() - now.getTime()) / 1000);
                    }

                    if (durationSeconds <= 0) {
                        Alert.alert('エラー', 'タイマーの時間を設定してください');
                        return;
                    }

                    trigger = await createTrigger({
                        memoId,
                        type: 'timer',
                        actionType,
                        durationSeconds,
                    });
                    await startTimerTrigger(trigger);
                    break;
                }

                case 'location_enter':
                case 'location_exit': {
                    const lat = parseFloat(latitude);
                    const lng = parseFloat(longitude);
                    const rad = parseFloat(radius) || 200;

                    if (isNaN(lat) || isNaN(lng)) {
                        Alert.alert('エラー', '位置情報を設定してください');
                        return;
                    }

                    trigger = await createTrigger({
                        memoId,
                        type: selectedType,
                        actionType,
                        latitude: lat,
                        longitude: lng,
                        radius: rad,
                        locationName: locationName || '場所',
                    });
                    await registerGeofence(trigger);
                    break;
                }
            }

            console.log('Trigger saved successfully, navigating back...');

            // On web, showAlert might be block, but on native it's async
            if (Platform.OS === 'web') {
                console.log('Web: Navigating to', `/memo/${memoId}`);
                router.replace(`/memo/${memoId}`);
            } else {
                Alert.alert('成功', 'トリガーを保存しました', [
                    {
                        text: 'OK',
                        onPress: () => {
                            console.log('Native: Navigating to', `/memo/${memoId}`);
                            router.replace(`/memo/${memoId}`);
                        }
                    }
                ]);
            }
        } catch (err: any) {
            console.error('Error saving trigger:', err);
            Alert.alert('エラー', err.message || 'トリガーの作成に失敗しました');
        }
    };

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.content}
        >
            {/* Trigger Type Selection */}
            <Text style={[styles.sectionTitle, { color: colors.text }]}>トリガータイプ</Text>
            <View style={styles.typeGrid}>
                {TRIGGER_TYPES.map(t => (
                    <TouchableOpacity
                        key={t.type}
                        style={[
                            styles.typeCard,
                            {
                                backgroundColor: selectedType === t.type ? `${colors.primary}15` : colors.surface,
                                borderColor: selectedType === t.type ? colors.primary : colors.border,
                            },
                        ]}
                        onPress={() => setSelectedType(t.type)}
                    >
                        <Ionicons
                            name={t.icon as any}
                            size={24}
                            color={selectedType === t.type ? colors.primary : colors.textSecondary}
                        />
                        <Text
                            style={[
                                styles.typeLabel,
                                { color: selectedType === t.type ? colors.primary : colors.text },
                            ]}
                        >
                            {t.label}
                        </Text>
                        <Text style={[styles.typeDesc, { color: colors.textTertiary }]}>{t.desc}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Type-specific Settings */}
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: Spacing.xxl }]}>設定</Text>

            {selectedType === 'datetime' && (
                <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.settingLabel, { color: colors.textSecondary }]}>日時</Text>
                    <TouchableOpacity
                        style={[styles.pickerTrigger, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                        onPress={() => setDatePickerVisible(true)}
                    >
                        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                        <Text style={[styles.pickerTriggerText, { color: colors.text }]}>
                            {year}/{month}/{day}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.pickerTrigger, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, marginTop: Spacing.md }]}
                        onPress={() => {
                            const now = new Date();
                            setHour(now.getHours().toString().padStart(2, '0'));
                            setMinute(now.getMinutes().toString().padStart(2, '0'));
                            setTimePickerVisible(true);
                        }}
                    >
                        <Ionicons name="time-outline" size={20} color={colors.primary} />
                        <Text style={[styles.pickerTriggerText, { color: colors.text }]}>
                            {hour}:{minute}
                        </Text>
                    </TouchableOpacity>

                    <CalendarDatePicker
                        visible={isDatePickerVisible}
                        onClose={() => setDatePickerVisible(false)}
                        initialDate={`${year}-${month}-${day}`}
                        onSelect={(date) => {
                            const [y, m, d] = date.split('-');
                            setYear(y);
                            setMonth(m);
                            setDay(d);
                        }}
                    />

                    <TimePicker
                        visible={isTimePickerVisible}
                        onClose={() => setTimePickerVisible(false)}
                        mode="time"
                        initialValues={{ hours: parseInt(hour), minutes: parseInt(minute) }}
                        onSelect={(vals) => {
                            setHour(vals.hours.toString().padStart(2, '0'));
                            setMinute(vals.minutes.toString().padStart(2, '0'));
                        }}
                    />
                </View>
            )}

            {selectedType === 'timer' && (
                <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.modeTabs}>
                        <TouchableOpacity
                            style={[styles.modeTab, timerMode === 'countdown' && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}
                            onPress={() => setTimerMode('countdown')}
                        >
                            <Text style={[styles.modeTabText, { color: timerMode === 'countdown' ? colors.primary : colors.textSecondary }]}>カウントダウン</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.modeTab, timerMode === 'time' && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}
                            onPress={() => setTimerMode('time')}
                        >
                            <Text style={[styles.modeTabText, { color: timerMode === 'time' ? colors.primary : colors.textSecondary }]}>時刻指定</Text>
                        </TouchableOpacity>
                    </View>

                    {timerMode === 'countdown' ? (
                        <TouchableOpacity
                            style={[styles.pickerTrigger, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                            onPress={() => setDurationPickerVisible(true)}
                        >
                            <Ionicons name="timer-outline" size={20} color={colors.primary} />
                            <Text style={[styles.pickerTriggerText, { color: colors.text }]}>
                                {parseInt(timerHours) > 0 ? `${timerHours}時間 ` : ''}{timerMinutes}分 {timerSeconds}秒
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.targetTimeRow}>
                            <TouchableOpacity
                                style={[styles.pickerTrigger, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, flex: 1 }]}
                                onPress={() => {
                                    const now = new Date();
                                    setTargetTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
                                    setTargetTimePickerVisible(true);
                                }}
                            >
                                <Ionicons name="alarm-outline" size={22} color={colors.primary} />
                                <Text style={[styles.pickerTriggerText, { color: colors.text, fontSize: FontSize.xl, fontWeight: '700' }]}>
                                    {targetTime}
                                </Text>
                            </TouchableOpacity>
                            <Text style={[styles.targetTimeDesc, { color: colors.textTertiary }]}>にアラームを鳴らす</Text>
                        </View>
                    )}

                    <TimePicker
                        visible={isDurationPickerVisible}
                        onClose={() => setDurationPickerVisible(false)}
                        mode="duration"
                        initialValues={{
                            hours: parseInt(timerHours),
                            minutes: parseInt(timerMinutes),
                            seconds: parseInt(timerSeconds)
                        }}
                        onSelect={(vals) => {
                            setTimerHours(vals.hours.toString());
                            setTimerMinutes(vals.minutes.toString());
                            setTimerSeconds((vals.seconds || 0).toString());
                        }}
                    />

                    <TimePicker
                        visible={isTargetTimePickerVisible}
                        onClose={() => setTargetTimePickerVisible(false)}
                        mode="time"
                        initialValues={{
                            hours: parseInt(targetTime.split(':')[0]),
                            minutes: parseInt(targetTime.split(':')[1])
                        }}
                        onSelect={(vals) => {
                            setTargetTime(`${vals.hours.toString().padStart(2, '0')}:${vals.minutes.toString().padStart(2, '0')}`);
                        }}
                    />
                </View>
            )}

            {(selectedType === 'location_enter' || selectedType === 'location_exit') && (
                <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TextInput
                        style={[styles.locationNameInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                        value={locationName}
                        onChangeText={setLocationName}
                        placeholder="場所の名前（例: 自宅、会社）"
                        placeholderTextColor={colors.textTertiary}
                    />

                    <TouchableOpacity
                        style={[styles.currentLocBtn, { backgroundColor: `${colors.primary}15` }]}
                        onPress={handleUseCurrentLocation}
                    >
                        <Ionicons name="locate" size={18} color={colors.primary} />
                        <Text style={[styles.currentLocText, { color: colors.primary }]}>現在地を使用</Text>
                    </TouchableOpacity>

                    <View style={styles.coordRow}>
                        <View style={styles.coordInput}>
                            <Text style={[styles.coordLabel, { color: colors.textSecondary }]}>緯度</Text>
                            <TextInput
                                style={[styles.coordField, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                                value={latitude}
                                onChangeText={setLatitude}
                                keyboardType="decimal-pad"
                                placeholder="35.6812"
                                placeholderTextColor={colors.textTertiary}
                            />
                        </View>
                        <View style={styles.coordInput}>
                            <Text style={[styles.coordLabel, { color: colors.textSecondary }]}>経度</Text>
                            <TextInput
                                style={[styles.coordField, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                                value={longitude}
                                onChangeText={setLongitude}
                                keyboardType="decimal-pad"
                                placeholder="139.7671"
                                placeholderTextColor={colors.textTertiary}
                            />
                        </View>
                    </View>

                    <View style={styles.radiusRow}>
                        <Text style={[styles.coordLabel, { color: colors.textSecondary }]}>半径 (m)</Text>
                        <TextInput
                            style={[styles.radiusField, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                            value={radius}
                            onChangeText={setRadius}
                            keyboardType="number-pad"
                            placeholder="200"
                            placeholderTextColor={colors.textTertiary}
                        />
                    </View>
                </View>
            )}

            {/* Action Type */}
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: Spacing.xxl }]}>アクション</Text>
            <View style={styles.actionRow}>
                <TouchableOpacity
                    style={[
                        styles.actionCard,
                        {
                            backgroundColor: actionType === 'alarm' ? `${colors.accent}15` : colors.surface,
                            borderColor: actionType === 'alarm' ? colors.accent : colors.border,
                        },
                    ]}
                    onPress={() => setActionType('alarm')}
                >
                    <Ionicons
                        name="alarm"
                        size={28}
                        color={actionType === 'alarm' ? colors.accent : colors.textSecondary}
                    />
                    <Text
                        style={[
                            styles.actionLabel,
                            { color: actionType === 'alarm' ? colors.accent : colors.text },
                        ]}
                    >
                        アラーム
                    </Text>
                    <Text style={[styles.actionDesc, { color: colors.textTertiary }]}>
                        音+バイブで通知
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.actionCard,
                        {
                            backgroundColor: actionType === 'notification' ? `${colors.primary}15` : colors.surface,
                            borderColor: actionType === 'notification' ? colors.primary : colors.border,
                        },
                    ]}
                    onPress={() => setActionType('notification')}
                >
                    <Ionicons
                        name="notifications-outline"
                        size={28}
                        color={actionType === 'notification' ? colors.primary : colors.textSecondary}
                    />
                    <Text
                        style={[
                            styles.actionLabel,
                            { color: actionType === 'notification' ? colors.primary : colors.text },
                        ]}
                    >
                        通知
                    </Text>
                    <Text style={[styles.actionDesc, { color: colors.textTertiary }]}>
                        通知バナーに表示
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Save Button */}
            <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                activeOpacity={0.7}
            >
                <Ionicons name="checkmark" size={22} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>トリガーを保存</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: Spacing.xl,
        paddingBottom: 60,
    },
    sectionTitle: {
        fontSize: FontSize.lg,
        fontWeight: '700',
        marginBottom: Spacing.md,
    },
    typeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
    },
    typeCard: {
        width: '48%' as any,
        padding: Spacing.lg,
        borderRadius: BorderRadius.md,
        borderWidth: 1.5,
        alignItems: 'center',
        gap: Spacing.xs,
    },
    typeLabel: {
        fontSize: FontSize.md,
        fontWeight: '700',
        marginTop: Spacing.xs,
    },
    typeDesc: {
        fontSize: FontSize.xs,
        textAlign: 'center',
    },
    settingsCard: {
        padding: Spacing.lg,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        gap: Spacing.md,
    },
    settingLabel: {
        fontSize: FontSize.sm,
        fontWeight: '600',
    },
    dateTimeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    dateInput: {
        width: 50,
        textAlign: 'center',
        padding: Spacing.sm,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        fontSize: FontSize.md,
    },
    yearInput: {
        width: 70,
    },
    timerRow: {
        flexDirection: 'row',
        gap: Spacing.lg,
    },
    timerInput: {
        alignItems: 'center',
        gap: Spacing.xs,
    },
    timerField: {
        width: 60,
        textAlign: 'center',
        padding: Spacing.sm,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        fontSize: FontSize.xl,
        fontWeight: '700',
    },
    timerUnit: {
        fontSize: FontSize.sm,
    },
    modeTabs: {
        flexDirection: 'row',
        backgroundColor: 'rgba(128, 128, 128, 0.05)',
        borderRadius: BorderRadius.md,
        padding: 4,
        marginBottom: Spacing.lg,
    },
    modeTab: {
        flex: 1,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
        borderRadius: BorderRadius.sm,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    modeTabText: {
        fontSize: FontSize.sm,
        fontWeight: '600',
    },
    targetTimeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        justifyContent: 'center',
        paddingVertical: Spacing.md,
    },
    targetTimeField: {
        width: 100,
        textAlign: 'center',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        borderWidth: 1.5,
        fontSize: FontSize.xl,
        fontWeight: '700',
    },
    targetTimeDesc: {
        fontSize: FontSize.md,
    },
    locationNameInput: {
        padding: Spacing.md,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        fontSize: FontSize.md,
    },
    currentLocBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.sm,
        gap: Spacing.sm,
    },
    currentLocText: {
        fontSize: FontSize.md,
        fontWeight: '600',
    },
    coordRow: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
    coordInput: {
        flex: 1,
        gap: Spacing.xs,
    },
    coordLabel: {
        fontSize: FontSize.sm,
        fontWeight: '500',
    },
    coordField: {
        padding: Spacing.sm,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        fontSize: FontSize.md,
    },
    radiusRow: {
        gap: Spacing.xs,
    },
    radiusField: {
        padding: Spacing.sm,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        fontSize: FontSize.md,
        width: 100,
    },
    actionRow: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
    actionCard: {
        flex: 1,
        padding: Spacing.lg,
        borderRadius: BorderRadius.md,
        borderWidth: 1.5,
        alignItems: 'center',
        gap: Spacing.xs,
    },
    actionLabel: {
        fontSize: FontSize.md,
        fontWeight: '700',
    },
    actionDesc: {
        fontSize: FontSize.xs,
        textAlign: 'center',
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.lg,
        borderRadius: BorderRadius.lg,
        marginTop: Spacing.xxxl,
        gap: Spacing.sm,
        elevation: 4,
        shadowColor: '#6C5CE7',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    saveBtnText: {
        color: '#FFFFFF',
        fontSize: FontSize.lg,
        fontWeight: '700',
    },
    pickerTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        borderWidth: 1.5,
        gap: Spacing.md,
    },
    pickerTriggerText: {
        fontSize: FontSize.lg,
        fontWeight: '500',
    },
});
