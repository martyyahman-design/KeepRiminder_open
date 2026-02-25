import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMemos } from '../../src/contexts/MemoContext';
import { useThemeColors, Spacing, FontSize, BorderRadius } from '../../src/theme';
import { MemoColor, MEMO_COLORS, Trigger } from '../../src/types/models';
import { useColorScheme } from 'react-native';
import MapViewComponent from '../../src/components/MapViewComponent';
import { CalendarDatePicker } from '../../src/components/CalendarDatePicker';

export default function MemoEditScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { memos, updateMemo, deleteMemo, deleteTrigger } = useMemos();
    const colors = useThemeColors();
    const colorScheme = useColorScheme();

    const memo = memos.find(m => m.id === id);

    const [title, setTitle] = useState(memo?.title || '');
    const [content, setContent] = useState(memo?.content || '');
    const [color, setColor] = useState<MemoColor>(memo?.color || 'default');
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);

    useEffect(() => {
        if (memo) {
            setTitle(memo.title);
            setContent(memo.content);
            setColor(memo.color);
        }
    }, [memo?.id]);

    // Auto-save on change
    useEffect(() => {
        if (!id) return;
        const timer = setTimeout(() => {
            updateMemo(id, { title, content, color });
        }, 500);
        return () => clearTimeout(timer);
    }, [title, content, color, id]);

    const handleTogglePin = async () => {
        if (!id || !memo) return;
        await updateMemo(id, { isPinned: !memo.isPinned });
    };

    const handleDelete = () => {
        const performDelete = async () => {
            if (id) {
                await deleteMemo(id);
                router.back();
            }
        };

        if (Platform.OS === 'web') {
            if (window.confirm('このメモを削除してもよろしいですか？')) {
                performDelete();
            }
            return;
        }

        Alert.alert(
            'メモを削除',
            'このメモを削除してもよろしいですか？',
            [
                { text: 'キャンセル', style: 'cancel' },
                {
                    text: '削除',
                    style: 'destructive',
                    onPress: performDelete,
                },
            ]
        );
    };

    const handleDeleteTrigger = (triggerId: string) => {
        const performDelete = () => deleteTrigger(triggerId);

        if (Platform.OS === 'web') {
            if (window.confirm('このトリガーを削除してもよろしいですか？')) {
                performDelete();
            }
            return;
        }

        Alert.alert(
            'トリガーを削除',
            'このトリガーを削除してもよろしいですか？',
            [
                { text: 'キャンセル', style: 'cancel' },
                {
                    text: '削除',
                    style: 'destructive',
                    onPress: performDelete,
                },
            ]
        );
    };

    const getCardBg = (c: MemoColor) => {
        const colorDef = MEMO_COLORS[c];
        return colorScheme === 'dark' ? colorDef.bgDark : colorDef.bg;
    };

    const getTriggerDescription = (trigger: Trigger): string => {
        switch (trigger.type) {
            case 'datetime':
                return trigger.scheduledAt
                    ? new Date(trigger.scheduledAt).toLocaleString('ja-JP')
                    : '日時未設定';
            case 'timer':
                if (trigger.durationSeconds) {
                    const mins = Math.floor(trigger.durationSeconds / 60);
                    const secs = trigger.durationSeconds % 60;
                    return mins > 0 ? `${mins}分${secs > 0 ? `${secs}秒` : ''}` : `${secs}秒`;
                }
                return 'タイマー未設定';
            case 'location_enter':
                return `${trigger.locationName || '場所'}に入った時`;
            case 'location_exit':
                return `${trigger.locationName || '場所'}から出た時`;
            default:
                return '';
        }
    };

    const getTriggerIcon = (type: string) => {
        switch (type) {
            case 'datetime': return 'calendar';
            case 'timer': return 'timer';
            case 'location_enter': return 'enter';
            case 'location_exit': return 'exit';
            default: return 'notifications';
        }
    };

    if (!memo) {
        return (
            <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
                <Text style={{ color: colors.textSecondary }}>メモが見つかりません</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: getCardBg(color) }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* Top Actions */}
            <View style={styles.topActions}>
                <TouchableOpacity
                    onPress={handleTogglePin}
                    style={[styles.actionBtn, { backgroundColor: `${colors.text}10` }]}
                >
                    <Ionicons
                        name={memo.isPinned ? 'pin' : 'pin-outline'}
                        size={20}
                        color={memo.isPinned ? colors.primary : colors.textSecondary}
                    />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setShowColorPicker(!showColorPicker)}
                    style={[styles.actionBtn, { backgroundColor: `${colors.text}10` }]}
                >
                    <Ionicons name="color-palette-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={handleDelete}
                    style={[styles.actionBtn, { backgroundColor: `${colors.error}10` }]}
                >
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                </TouchableOpacity>
            </View>

            {/* Color Picker */}
            {showColorPicker && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.colorPicker}
                    contentContainerStyle={styles.colorPickerContent}
                >
                    {(Object.keys(MEMO_COLORS) as MemoColor[]).map(colorKey => (
                        <TouchableOpacity
                            key={colorKey}
                            style={[
                                styles.colorDot,
                                {
                                    backgroundColor: getCardBg(colorKey),
                                    borderColor: colorKey === color ? colors.primary : colors.border,
                                    borderWidth: colorKey === color ? 2.5 : 1,
                                },
                            ]}
                            onPress={() => {
                                setColor(colorKey);
                                setShowColorPicker(false);
                            }}
                        >
                            {colorKey === color && (
                                <Ionicons name="checkmark" size={14} color={colors.primary} />
                            )}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}

            <ScrollView style={styles.scrollContent} keyboardDismissMode="on-drag">
                {/* Title */}
                <TextInput
                    style={[styles.titleInput, { color: colorScheme === 'dark' ? '#F5F5F7' : '#1A1A2E' }]}
                    placeholder="タイトル"
                    placeholderTextColor={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
                    value={title}
                    onChangeText={setTitle}
                    multiline
                />

                {/* Content */}
                <TextInput
                    style={[styles.contentInput, { color: colorScheme === 'dark' ? '#D1D5DB' : '#374151' }]}
                    placeholder="メモを入力..."
                    placeholderTextColor={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
                    value={content}
                    onChangeText={setContent}
                    multiline
                    textAlignVertical="top"
                />

                {/* TODO Settings */}
                <View style={styles.todoSection}>
                    <Text style={[styles.sectionTitle, { color: colorScheme === 'dark' ? '#D1D5DB' : '#374151' }]}>
                        TODO設定
                    </Text>
                    <View style={styles.todoTypeContainer}>
                        {(['none', 'deadline'] as const).map((type) => (
                            <TouchableOpacity
                                key={type}
                                style={[
                                    styles.todoTypeBtn,
                                    memo.todoType === type && { backgroundColor: `${colors.primary}20`, borderColor: colors.primary }
                                ]}
                                onPress={() => updateMemo(memo.id, { todoType: type, todoDate: type !== 'none' ? (memo.todoDate || new Date().toISOString().split('T')[0]) : null })}
                            >
                                <Text style={[styles.todoTypeBtnText, { color: memo.todoType === type ? colors.primary : colors.textSecondary }]}>
                                    {type === 'none' ? 'なし' : '期限付き'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {memo.todoType !== 'none' && (
                        <TouchableOpacity
                            style={styles.todoDateContainer}
                            onPress={() => setShowDatePicker(true)}
                        >
                            <Ionicons name="calendar-outline" size={20} color={colors.textTertiary} />
                            <Text style={[styles.dateText, { color: colors.text }]}>
                                {memo.todoDate || '日付を選択'}
                            </Text>
                            <Text style={[styles.todoNote, { color: colors.textTertiary }]}>
                                ※ 終わるまで毎日「今日」に表示されます
                            </Text>
                        </TouchableOpacity>
                    )}
                    <CalendarDatePicker
                        visible={showDatePicker}
                        onClose={() => setShowDatePicker(false)}
                        onSelect={(date) => updateMemo(memo.id, { todoDate: date })}
                        initialDate={memo.todoDate || undefined}
                    />
                </View>

                {/* Triggers Section */}
                <View style={styles.triggersSection}>
                    <View style={styles.triggersSectionHeader}>
                        <Text style={[styles.triggersTitle, { color: colorScheme === 'dark' ? '#D1D5DB' : '#374151' }]}>
                            トリガー
                        </Text>
                        <TouchableOpacity
                            style={[styles.addTriggerBtn, { backgroundColor: `${colors.primary}15` }]}
                            onPress={() => router.push({ pathname: '/trigger/edit', params: { memoId: id } })}
                        >
                            <Ionicons name="add" size={18} color={colors.primary} />
                            <Text style={[styles.addTriggerText, { color: colors.primary }]}>追加</Text>
                        </TouchableOpacity>
                    </View>

                    {memo.triggers.length === 0 ? (
                        <Text style={[styles.noTriggers, { color: colors.textTertiary }]}>
                            トリガーを追加して、条件が揃ったときに通知を受け取りましょう
                        </Text>
                    ) : (
                        memo.triggers.map(trigger => (
                            <View
                                key={trigger.id}
                                style={[
                                    styles.triggerCard,
                                    {
                                        backgroundColor: `${colors.text}05`,
                                        borderColor: `${colors.text}10`,
                                    },
                                ]}
                            >
                                <View style={styles.triggerCardLeft}>
                                    <Ionicons
                                        name={getTriggerIcon(trigger.type) as any}
                                        size={20}
                                        color={trigger.isActive ? colors.primary : colors.textTertiary}
                                    />
                                    <View style={styles.triggerInfo}>
                                        <Text style={[styles.triggerType, { color: colorScheme === 'dark' ? '#F5F5F7' : '#1A1A2E' }]}>
                                            {trigger.type === 'datetime' ? '日時' :
                                                trigger.type === 'timer' ? 'タイマー' :
                                                    trigger.type === 'location_enter' ? 'エリア入場' : 'エリア退場'}
                                        </Text>
                                        <Text style={[styles.triggerDesc, { color: colors.textSecondary }]}>
                                            {getTriggerDescription(trigger)}
                                        </Text>
                                        <View style={styles.triggerAction}>
                                            <Ionicons
                                                name={trigger.actionType === 'alarm' ? 'alarm' : 'notifications-outline'}
                                                size={12}
                                                color={colors.textTertiary}
                                            />
                                            <Text style={[styles.triggerActionText, { color: colors.textTertiary }]}>
                                                {trigger.actionType === 'alarm' ? 'アラーム' : '通知'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                                <TouchableOpacity onPress={() => handleDeleteTrigger(trigger.id)}>
                                    <Ionicons name="close-circle" size={22} color={colors.textTertiary} />
                                </TouchableOpacity>
                            </View>
                        ))
                    )}
                </View>

                {/* Map Section for Location Triggers */}
                {memo.triggers.some(t => t.type === 'location_enter' || t.type === 'location_exit') && (
                    <View style={styles.mapSection}>
                        <Text style={[styles.sectionTitle, { color: colorScheme === 'dark' ? '#D1D5DB' : '#374151' }]}>
                            エリア確認
                        </Text>
                        <View style={[styles.mapContainer, { borderColor: colors.border }]}>
                            <MapViewComponent
                                location={null} // Will use the first trigger's location as center implicitly via MapViewComponent's logic if we adjust it, or we pass it
                                locationTriggers={memo.triggers
                                    .filter(t => (t.type === 'location_enter' || t.type === 'location_exit') && t.latitude !== undefined)
                                    .map(t => ({ ...t, memoTitle: memo.title, memoId: memo.id }))
                                }
                                onMarkerCalloutPress={() => { }}
                            />
                        </View>
                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    topActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        gap: Spacing.sm,
    },
    actionBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    colorPicker: {
        maxHeight: 50,
        marginBottom: Spacing.sm,
    },
    colorPickerContent: {
        paddingHorizontal: Spacing.lg,
        gap: Spacing.sm,
        alignItems: 'center',
    },
    colorDot: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        flex: 1,
        paddingHorizontal: Spacing.xl,
    },
    titleInput: {
        fontSize: FontSize.xxl,
        fontWeight: '700',
        marginBottom: Spacing.md,
        lineHeight: 32,
    },
    contentInput: {
        fontSize: FontSize.md,
        lineHeight: 24,
        minHeight: 120,
    },
    triggersSection: {
        marginTop: Spacing.xxl,
        paddingTop: Spacing.lg,
        borderTopWidth: 1,
        borderTopColor: 'rgba(128, 128, 128, 0.15)',
    },
    triggersSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    triggersTitle: {
        fontSize: FontSize.lg,
        fontWeight: '700',
    },
    addTriggerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderRadius: BorderRadius.full,
        gap: 4,
    },
    addTriggerText: {
        fontSize: FontSize.sm,
        fontWeight: '600',
    },
    noTriggers: {
        fontSize: FontSize.sm,
        textAlign: 'center',
        paddingVertical: Spacing.xxl,
    },
    triggerCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        marginBottom: Spacing.sm,
    },
    triggerCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: Spacing.md,
    },
    triggerInfo: {
        flex: 1,
    },
    triggerType: {
        fontSize: FontSize.md,
        fontWeight: '600',
    },
    triggerDesc: {
        fontSize: FontSize.sm,
        marginTop: 2,
    },
    triggerAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    triggerActionText: {
        fontSize: FontSize.xs,
    },
    mapSection: {
        marginTop: Spacing.xl,
        marginBottom: Spacing.xxl,
    },
    sectionTitle: {
        fontSize: FontSize.lg,
        fontWeight: '700',
        marginBottom: Spacing.md,
    },
    mapContainer: {
        height: 200,
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
        borderWidth: 1,
    },
    todoSection: {
        marginTop: Spacing.xl,
        paddingTop: Spacing.lg,
        borderTopWidth: 1,
        borderTopColor: 'rgba(128, 128, 128, 0.15)',
    },
    todoTypeContainer: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginTop: Spacing.sm,
    },
    todoTypeBtn: {
        flex: 1,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: 'rgba(128, 128, 128, 0.2)',
    },
    todoTypeBtnText: {
        fontSize: FontSize.sm,
        fontWeight: '600',
    },
    todoDateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: Spacing.md,
        gap: Spacing.sm,
        backgroundColor: 'rgba(128, 128, 128, 0.05)',
        padding: Spacing.sm,
        borderRadius: BorderRadius.md,
    },
    dateText: {
        flex: 1,
        fontSize: FontSize.md,
        fontWeight: '500',
    },
    todoNote: {
        fontSize: FontSize.xs,
        marginLeft: Spacing.sm,
    },
});
