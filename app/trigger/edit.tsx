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
import { TriggerType, ActionType } from '../../src/types/models';
import { registerGeofence } from '../../src/services/geofencingService';
import { scheduleDatetimeTrigger, startTimerTrigger } from '../../src/services/schedulerService';
import { getCurrentLocation } from '../../src/services/geofencingService';

const TRIGGER_TYPES: { type: TriggerType; icon: string; label: string; desc: string }[] = [
    { type: 'datetime', icon: 'calendar', label: '日時', desc: '指定した日時に発火' },
    { type: 'timer', icon: 'timer', label: 'タイマー', desc: '設定時間後に発火' },
    { type: 'location_enter', icon: 'enter', label: 'エリア入場', desc: '場所に入った時に発火' },
    { type: 'location_exit', icon: 'exit', label: 'エリア退場', desc: '場所から出た時に発火' },
];

export default function TriggerEditScreen() {
    const { memoId } = useLocalSearchParams<{ memoId: string }>();
    const { createTrigger } = useMemos();
    const colors = useThemeColors();

    const [selectedType, setSelectedType] = useState<TriggerType>('datetime');
    const [actionType, setActionType] = useState<ActionType>('notification');

    // Datetime state
    const [year, setYear] = useState(new Date().getFullYear().toString());
    const [month, setMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [day, setDay] = useState(new Date().getDate().toString().padStart(2, '0'));
    const [hour, setHour] = useState(new Date().getHours().toString().padStart(2, '0'));
    const [minute, setMinute] = useState(new Date().getMinutes().toString().padStart(2, '0'));

    // Timer state
    const [timerHours, setTimerHours] = useState('0');
    const [timerMinutes, setTimerMinutes] = useState('5');
    const [timerSeconds, setTimerSeconds] = useState('0');

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
        if (!memoId) return;

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
                    const durationSeconds =
                        parseInt(timerHours || '0') * 3600 +
                        parseInt(timerMinutes || '0') * 60 +
                        parseInt(timerSeconds || '0');

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

            router.back();
        } catch (err: any) {
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
                    <View style={styles.dateTimeRow}>
                        <TextInput
                            style={[styles.dateInput, styles.yearInput, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                            value={year}
                            onChangeText={setYear}
                            keyboardType="number-pad"
                            maxLength={4}
                            placeholder="年"
                            placeholderTextColor={colors.textTertiary}
                        />
                        <Text style={{ color: colors.textSecondary }}>/</Text>
                        <TextInput
                            style={[styles.dateInput, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                            value={month}
                            onChangeText={setMonth}
                            keyboardType="number-pad"
                            maxLength={2}
                            placeholder="月"
                            placeholderTextColor={colors.textTertiary}
                        />
                        <Text style={{ color: colors.textSecondary }}>/</Text>
                        <TextInput
                            style={[styles.dateInput, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                            value={day}
                            onChangeText={setDay}
                            keyboardType="number-pad"
                            maxLength={2}
                            placeholder="日"
                            placeholderTextColor={colors.textTertiary}
                        />
                    </View>
                    <View style={styles.dateTimeRow}>
                        <TextInput
                            style={[styles.dateInput, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                            value={hour}
                            onChangeText={setHour}
                            keyboardType="number-pad"
                            maxLength={2}
                            placeholder="時"
                            placeholderTextColor={colors.textTertiary}
                        />
                        <Text style={{ color: colors.textSecondary }}>:</Text>
                        <TextInput
                            style={[styles.dateInput, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                            value={minute}
                            onChangeText={setMinute}
                            keyboardType="number-pad"
                            maxLength={2}
                            placeholder="分"
                            placeholderTextColor={colors.textTertiary}
                        />
                    </View>
                </View>
            )}

            {selectedType === 'timer' && (
                <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.settingLabel, { color: colors.textSecondary }]}>カウントダウン</Text>
                    <View style={styles.timerRow}>
                        <View style={styles.timerInput}>
                            <TextInput
                                style={[styles.timerField, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                                value={timerHours}
                                onChangeText={setTimerHours}
                                keyboardType="number-pad"
                                maxLength={3}
                            />
                            <Text style={[styles.timerUnit, { color: colors.textSecondary }]}>時間</Text>
                        </View>
                        <View style={styles.timerInput}>
                            <TextInput
                                style={[styles.timerField, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                                value={timerMinutes}
                                onChangeText={setTimerMinutes}
                                keyboardType="number-pad"
                                maxLength={2}
                            />
                            <Text style={[styles.timerUnit, { color: colors.textSecondary }]}>分</Text>
                        </View>
                        <View style={styles.timerInput}>
                            <TextInput
                                style={[styles.timerField, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                                value={timerSeconds}
                                onChangeText={setTimerSeconds}
                                keyboardType="number-pad"
                                maxLength={2}
                            />
                            <Text style={[styles.timerUnit, { color: colors.textSecondary }]}>秒</Text>
                        </View>
                    </View>
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
                        通知バナーを表示
                    </Text>
                </TouchableOpacity>

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
            </View>

            {/* Save Button */}
            <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
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
});
