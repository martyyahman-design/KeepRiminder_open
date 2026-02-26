import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemos } from '../../src/contexts/MemoContext';
import { useThemeColors, Spacing, FontSize, BorderRadius, getCardShadow } from '../../src/theme';
import { router } from 'expo-router';
import { MemoWithTriggers } from '../../src/types/models';

export default function CalendarScreen() {
    const { memos } = useMemos();
    const colors = useThemeColors();
    const [viewDate, setViewDate] = useState(new Date());
    const [filterDay, setFilterDay] = useState<number | null>(null);

    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const currentYear = viewDate.getFullYear();
    const currentMonth = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

    const changeMonth = (offset: number) => {
        setFilterDay(null);
        setViewDate(new Date(currentYear, currentMonth + offset, 1));
    };

    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const formatDate = (day: number) => `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // すべてのメモから日付に関連するものを抽出して統合
    const allEvents = useMemo(() => {
        const eventMap: Record<string, { memo: MemoWithTriggers; date: string; types: Set<'todo' | 'trigger'> }> = {};

        memos.forEach(m => {
            // ToDoの日付
            if (m.todoDate && m.todoType !== 'none') {
                const key = `${m.id}-${m.todoDate}`;
                if (!eventMap[key]) eventMap[key] = { memo: m, date: m.todoDate, types: new Set() };
                eventMap[key].types.add('todo');
            }

            // 日時トリガーの日付
            m.triggers.forEach(t => {
                if (t.type === 'datetime' && t.scheduledAt) {
                    const d = t.scheduledAt.split('T')[0];
                    const key = `${m.id}-${d}`;
                    if (!eventMap[key]) eventMap[key] = { memo: m, date: d, types: new Set() };
                    eventMap[key].types.add('trigger');
                }
            });
        });

        return Object.values(eventMap)
            .map(e => ({ ...e, types: Array.from(e.types) }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [memos]);

    // 今月のイベント
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const monthlyEvents = allEvents.filter(e => e.date.startsWith(monthPrefix));

    // フィルター適用後の表示用リスト
    const displayedEvents = useMemo(() => {
        if (filterDay === null) return monthlyEvents;
        const targetDate = formatDate(filterDay);
        return monthlyEvents.filter(e => e.date === targetDate);
    }, [monthlyEvents, filterDay, currentYear, currentMonth]);

    const handleDayPress = (day: number) => {
        const targetDate = formatDate(day);
        const hasContent = monthlyEvents.some(e => e.date === targetDate);

        if (!hasContent) {
            setFilterDay(null);
        } else {
            setFilterDay(filterDay === day ? null : day);
        }
    };

    const TODO_COLOR = '#2196F3';
    const TRIGGER_COLOR = '#FF9800';

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navBtn}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    {currentYear}年 {currentMonth + 1}月
                </Text>
                <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navBtn}>
                    <Ionicons name="chevron-forward" size={24} color={colors.text} />
                </TouchableOpacity>
            </View>

            <View style={styles.calendarContainer}>
                <View style={styles.calendarGrid}>
                    {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                        <View key={d} style={styles.dayHeader}>
                            <Text style={[styles.dayHeaderText, { color: i === 0 ? '#FF5252' : i === 6 ? colors.primary : colors.textTertiary }]}>{d}</Text>
                        </View>
                    ))}
                    {days.map((day, idx) => {
                        if (day === null) return <View key={`empty-${idx}`} style={styles.dayCell} />;

                        const dateStr = formatDate(day);
                        const dayEvents = monthlyEvents.filter(e => e.date === dateStr);
                        const hasTodo = dayEvents.some(e => e.types.includes('todo'));
                        const hasTrigger = dayEvents.some(e => e.types.includes('trigger'));
                        const isSelected = filterDay === day;

                        return (
                            <TouchableOpacity
                                key={idx}
                                style={[
                                    styles.dayCell,
                                    isSelected && { backgroundColor: `${colors.primary}15`, borderRadius: BorderRadius.md }
                                ]}
                                onPress={() => handleDayPress(day)}
                            >
                                <Text style={[
                                    styles.dayText,
                                    { color: colors.text },
                                    isSelected && { color: colors.primary, fontWeight: '700' }
                                ]}>
                                    {day}
                                </Text>
                                <View style={styles.indicatorContainer}>
                                    {hasTodo && <View style={[styles.indicator, { backgroundColor: TODO_COLOR }]} />}
                                    {hasTrigger && <View style={[styles.indicator, { backgroundColor: TRIGGER_COLOR }]} />}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            <View style={styles.footer}>
                <View style={styles.footerHeader}>
                    <Text style={[styles.footerTitle, { color: colors.textSecondary }]}>
                        {filterDay ? `${filterDay}日の予定` : 'この月のToDo'}
                    </Text>
                    {filterDay && (
                        <TouchableOpacity onPress={() => setFilterDay(null)}>
                            <Text style={{ color: colors.primary, fontSize: FontSize.xs }}>すべて表示</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                    {displayedEvents.map((e, index) => (
                        <TouchableOpacity
                            key={`${e.memo.id}-${index}`}
                            style={[
                                styles.taskItem,
                                {
                                    borderLeftColor: e.types.includes('todo') ? TODO_COLOR : TRIGGER_COLOR,
                                    backgroundColor: colors.surface,
                                    ...getCardShadow(colors)
                                }
                            ]}
                            onPress={() => router.push(`/memo/${e.memo.id}`)}
                        >
                            <View style={styles.taskMeta}>
                                <Text style={[styles.taskDate, { color: colors.textSecondary }]}>{e.date.split('-')[2]}日</Text>
                                <View style={{ flexDirection: 'row', gap: 4 }}>
                                    {e.types.includes('todo') && (
                                        <View style={[styles.typeBadge, { backgroundColor: `${TODO_COLOR}20` }]}>
                                            <Text style={[styles.typeBadgeText, { color: TODO_COLOR }]}>ToDo</Text>
                                        </View>
                                    )}
                                    {e.types.includes('trigger') && (
                                        <View style={[styles.typeBadge, { backgroundColor: `${TRIGGER_COLOR}20` }]}>
                                            <Text style={[styles.typeBadgeText, { color: TRIGGER_COLOR }]}>通知</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                            <Text style={[styles.taskTitle, { color: colors.text }, e.memo.isCompleted && styles.completedText]} numberOfLines={1}>
                                {e.memo.title || '(無題)'}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                        </TouchableOpacity>
                    ))}
                    {displayedEvents.length === 0 && (
                        <View style={styles.emptyContainer}>
                            <Ionicons name="calendar-outline" size={48} color={colors.textTertiary} />
                            <Text style={[styles.noItems, { color: colors.textTertiary }]}>予定はありません</Text>
                        </View>
                    )}
                </ScrollView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingTop: Platform.OS === 'web' ? Spacing.lg : 0,
        paddingBottom: Spacing.md,
    },
    navBtn: {
        padding: Spacing.sm,
    },
    headerTitle: { fontSize: FontSize.lg, fontWeight: '800' },
    calendarContainer: {
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.md,
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        backgroundColor: 'rgba(128,128,128,0.03)',
        padding: Spacing.sm,
        borderRadius: BorderRadius.lg,
    },
    dayHeader: { width: '14.28%', alignItems: 'center', paddingVertical: Spacing.sm },
    dayHeaderText: { fontSize: FontSize.xs, fontWeight: '700' },
    dayCell: {
        width: '14.28%',
        height: 50,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 2,
    },
    dayText: { fontSize: FontSize.md, fontWeight: '500' },
    indicatorContainer: { flexDirection: 'row', gap: 3, marginTop: 4 },
    indicator: { width: 5, height: 5, borderRadius: 2.5 },
    footer: { flex: 1, paddingHorizontal: Spacing.lg },
    footerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
        marginTop: Spacing.sm,
    },
    footerTitle: { fontSize: FontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    taskItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        marginBottom: Spacing.sm,
        borderLeftWidth: 4,
        gap: Spacing.md,
    },
    taskMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    taskDate: { fontSize: FontSize.sm, fontWeight: '700', width: 28 },
    typeBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    typeBadgeText: {
        fontSize: 10,
        fontWeight: '700',
    },
    taskTitle: { fontSize: FontSize.md, flex: 1, fontWeight: '600' },
    completedText: { textDecorationLine: 'line-through', opacity: 0.5 },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 40,
        opacity: 0.5,
    },
    noItems: { textAlign: 'center', marginTop: Spacing.md, fontSize: FontSize.sm, fontWeight: '500' },
});
