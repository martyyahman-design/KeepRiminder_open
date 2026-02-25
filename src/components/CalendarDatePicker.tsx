import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, Spacing, FontSize, BorderRadius } from '../theme';

interface CalendarDatePickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (date: string) => void;
    initialDate?: string; // YYYY-MM-DD
}

export const CalendarDatePicker: React.FC<CalendarDatePickerProps> = ({
    visible,
    onClose,
    onSelect,
    initialDate,
}) => {
    const colors = useThemeColors();

    const now = new Date();
    const [viewDate, setViewDate] = useState(() => {
        if (initialDate) {
            const [y, m, d] = initialDate.split('-').map(Number);
            return new Date(y, m - 1, 1);
        }
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });

    const [selectedDate, setSelectedDate] = useState(initialDate || now.toISOString().split('T')[0]);

    const viewYear = viewDate.getFullYear();
    const viewMonth = viewDate.getMonth();

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();

    const prevMonth = () => {
        setViewDate(new Date(viewYear, viewMonth - 1, 1));
    };

    const nextMonth = () => {
        setViewDate(new Date(viewYear, viewMonth + 1, 1));
    };

    const handleSelectDay = (day: number) => {
        const formattedDate = `${viewYear}-${(viewMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        setSelectedDate(formattedDate);
        onSelect(formattedDate);
        onClose();
    };

    const renderDays = () => {
        const days = [];
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${viewYear}-${(viewMonth + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
            const isSelected = selectedDate === dateStr;
            const isToday = now.toISOString().split('T')[0] === dateStr;

            days.push(
                <TouchableOpacity
                    key={d}
                    style={[
                        styles.dayCell,
                        isSelected && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => handleSelectDay(d)}
                >
                    <Text
                        style={[
                            styles.dayText,
                            { color: isSelected ? '#FFFFFF' : colors.text },
                            isToday && !isSelected && { color: colors.primary, fontWeight: '700' },
                        ]}
                    >
                        {d}
                    </Text>
                    {isToday && !isSelected && <View style={[styles.todayDot, { backgroundColor: colors.primary }]} />}
                </TouchableOpacity>
            );
        }

        return days;
    };

    const weekDays = ['日', '月', '火', '水', '木', '金', '土'];

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.centeredView}>
                <Pressable style={styles.overlay} onPress={onClose} />
                <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
                            <Ionicons name="chevron-back" size={24} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={[styles.monthYearText, { color: colors.text }]}>
                            {viewYear}年 {viewMonth + 1}月
                        </Text>
                        <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
                            <Ionicons name="chevron-forward" size={24} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.weekRow}>
                        {weekDays.map((d, i) => (
                            <View key={i} style={styles.dayCell}>
                                <Text style={[styles.weekDayText, { color: colors.textTertiary }]}>{d}</Text>
                            </View>
                        ))}
                    </View>

                    <View style={styles.daysGrid}>
                        {renderDays()}
                    </View>

                    <View style={styles.footer}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Text style={[styles.closeBtnText, { color: colors.textSecondary }]}>キャンセル</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
        width: '85%',
        maxWidth: 340,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    navBtn: {
        padding: Spacing.sm,
    },
    monthYearText: {
        fontSize: FontSize.lg,
        fontWeight: '700',
    },
    weekRow: {
        flexDirection: 'row',
        marginBottom: Spacing.sm,
    },
    weekDayText: {
        fontSize: FontSize.xs,
        fontWeight: '600',
        textAlign: 'center',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        aspectRatio: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: BorderRadius.full,
    },
    dayText: {
        fontSize: FontSize.md,
    },
    todayDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        position: 'absolute',
        bottom: 4,
    },
    footer: {
        marginTop: Spacing.lg,
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    closeBtn: {
        padding: Spacing.sm,
    },
    closeBtnText: {
        fontSize: FontSize.md,
        fontWeight: '600',
    },
});
