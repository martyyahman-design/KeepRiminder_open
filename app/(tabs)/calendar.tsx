import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemos } from '../../src/contexts/MemoContext';
import { useThemeColors, Spacing, FontSize, BorderRadius } from '../../src/theme';
import { router } from 'expo-router';

export default function CalendarScreen() {
    const { memos } = useMemos();
    const colors = useThemeColors();
    const [selectedDate, setSelectedDate] = useState(new Date());

    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const currentYear = selectedDate.getFullYear();
    const currentMonth = selectedDate.getMonth();
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

    const changeMonth = (offset: number) => {
        setSelectedDate(new Date(currentYear, currentMonth + offset, 1));
    };

    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const formatDate = (day: number) => `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const memosForMonth = memos.filter(m => m.todoDate && m.todoDate.startsWith(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`));

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => changeMonth(-1)}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>
                    {currentYear}年 {currentMonth + 1}月
                </Text>
                <TouchableOpacity onPress={() => changeMonth(1)}>
                    <Ionicons name="chevron-forward" size={24} color={colors.text} />
                </TouchableOpacity>
            </View>

            <View style={styles.calendarGrid}>
                {['日', '月', '火', '水', '木', '金', '土'].map(d => (
                    <View key={d} style={styles.dayHeader}>
                        <Text style={[styles.dayHeaderText, { color: colors.textSecondary }]}>{d}</Text>
                    </View>
                ))}
                {days.map((day, idx) => {
                    if (day === null) return <View key={`empty-${idx}`} style={styles.dayCell} />;
                    const dateStr = formatDate(day);
                    const hasTodo = memos.some(m => m.todoDate === dateStr && m.todoType !== 'none');

                    return (
                        <TouchableOpacity key={idx} style={styles.dayCell}>
                            <Text style={[styles.dayText, { color: colors.text }]}>{day}</Text>
                            <View style={styles.indicatorContainer}>
                                {hasTodo && <View style={[styles.indicator, { backgroundColor: colors.primary }]} />}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <ScrollView style={styles.footer}>
                <Text style={[styles.footerTitle, { color: colors.textSecondary }]}>この月のタスク</Text>
                {memosForMonth.map(m => (
                    <TouchableOpacity
                        key={m.id}
                        style={[styles.taskItem, { borderLeftColor: m.isCompleted ? colors.textTertiary : colors.primary }]}
                        onPress={() => router.push(`/memo/${m.id}`)}
                    >
                        <Text style={[styles.taskDate, { color: colors.textSecondary }]}>{m.todoDate?.split('-')[2]}日</Text>
                        <Text style={[styles.taskTitle, { color: colors.text }, m.isCompleted && styles.completedText]} numberOfLines={1}>
                            {m.title || '(無題)'}
                        </Text>
                    </TouchableOpacity>
                ))}
                {memosForMonth.length === 0 && (
                    <Text style={[styles.noItems, { color: colors.textTertiary }]}>予定はありません</Text>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg },
    headerTitle: { fontSize: FontSize.lg, fontWeight: '700' },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.sm },
    dayHeader: { width: '14.28%', alignItems: 'center', paddingVertical: Spacing.sm },
    dayHeaderText: { fontSize: FontSize.xs, fontWeight: '600' },
    dayCell: { width: '14.28%', height: 50, alignItems: 'center', justifyContent: 'center' },
    dayText: { fontSize: FontSize.md },
    indicatorContainer: { flexDirection: 'row', gap: 2, marginTop: 2 },
    indicator: { width: 4, height: 4, borderRadius: 2 },
    footer: { flex: 1, padding: Spacing.lg },
    footerTitle: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: Spacing.md },
    taskItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, backgroundColor: 'rgba(128,128,128,0.05)', borderRadius: BorderRadius.md, marginBottom: Spacing.sm, borderLeftWidth: 4 },
    taskDate: { fontSize: FontSize.sm, width: 30 },
    taskTitle: { fontSize: FontSize.md, flex: 1, fontWeight: '500' },
    completedText: { textDecorationLine: 'line-through', opacity: 0.5 },
    noItems: { textAlign: 'center', marginTop: Spacing.xl, fontSize: FontSize.sm },
});
