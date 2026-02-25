import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Pressable,
    ScrollView,
} from 'react-native';
import { useThemeColors, Spacing, FontSize, BorderRadius } from '../theme';

interface TimePickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (values: { hours: number; minutes: number; seconds?: number }) => void;
    initialValues: { hours: number; minutes: number; seconds?: number };
    mode: 'time' | 'duration'; // time: HH:mm, duration: HH:mm:ss
}

export const TimePicker: React.FC<TimePickerProps> = ({
    visible,
    onClose,
    onSelect,
    initialValues,
    mode,
}) => {
    const colors = useThemeColors();
    const [hours, setHours] = useState(initialValues.hours);
    const [minutes, setMinutes] = useState(initialValues.minutes);
    const [seconds, setSeconds] = useState(initialValues.seconds || 0);

    const hourScrollRef = React.useRef<ScrollView>(null);
    const minuteScrollRef = React.useRef<ScrollView>(null);
    const secondScrollRef = React.useRef<ScrollView>(null);

    // Sync state and scroll when visible changes to true
    React.useEffect(() => {
        if (visible) {
            setHours(initialValues.hours);
            setMinutes(initialValues.minutes);
            setSeconds(initialValues.seconds || 0);

            // Small delay to ensure layout is ready
            setTimeout(() => {
                hourScrollRef.current?.scrollTo({ y: initialValues.hours * 44, animated: false });
                minuteScrollRef.current?.scrollTo({ y: initialValues.minutes * 44, animated: false });
                if (mode === 'duration') {
                    secondScrollRef.current?.scrollTo({ y: (initialValues.seconds || 0) * 44, animated: false });
                }
            }, 100);
        }
    }, [visible, initialValues, mode]);

    const handleConfirm = () => {
        onSelect({ hours, minutes, seconds });
        onClose();
    };

    const renderPickerColumn = (
        label: string,
        max: number,
        current: number,
        setter: (val: number) => void,
        scrollRef: React.RefObject<ScrollView | null>
    ) => {
        return (
            <View style={styles.column}>
                <Text style={[styles.columnLabel, { color: colors.textTertiary }]}>{label}</Text>
                <ScrollView
                    ref={scrollRef}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                >
                    {Array.from({ length: max + 1 }).map((_, i) => (
                        <TouchableOpacity
                            key={i}
                            style={[
                                styles.item,
                                current === i && { backgroundColor: `${colors.primary}20`, borderColor: colors.primary }
                            ]}
                            onPress={() => setter(i)}
                        >
                            <Text style={[
                                styles.itemText,
                                { color: current === i ? colors.primary : colors.text }
                            ]}>
                                {i.toString().padStart(2, '0')}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
        );
    };

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
                    <Text style={[styles.modalTitle, { color: colors.text }]}>
                        {mode === 'time' ? '時刻を選択' : '時間を設定'}
                    </Text>

                    <View style={styles.pickerContainer}>
                        {renderPickerColumn(mode === 'time' ? '時' : '時間', mode === 'time' ? 23 : 99, hours, setHours, hourScrollRef)}
                        {renderPickerColumn('分', 59, minutes, setMinutes, minuteScrollRef)}
                        {mode === 'duration' && renderPickerColumn('秒', 59, seconds, setSeconds, secondScrollRef)}
                    </View>

                    <View style={styles.footer}>
                        <TouchableOpacity onPress={onClose} style={styles.btn}>
                            <Text style={[styles.btnText, { color: colors.textSecondary }]}>キャンセル</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleConfirm}
                            style={[styles.btn, styles.confirmBtn, { backgroundColor: colors.primary }]}
                        >
                            <Text style={[styles.btnText, { color: '#FFFFFF' }]}>決定</Text>
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
        width: '90%',
        maxWidth: 400,
        borderRadius: BorderRadius.lg,
        padding: Spacing.xl,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    modalTitle: {
        fontSize: FontSize.lg,
        fontWeight: '700',
        marginBottom: Spacing.xl,
        textAlign: 'center',
    },
    pickerContainer: {
        flexDirection: 'row',
        height: 200,
        justifyContent: 'space-around',
        marginBottom: Spacing.xl,
    },
    column: {
        flex: 1,
        alignItems: 'center',
    },
    columnLabel: {
        fontSize: FontSize.xs,
        fontWeight: '600',
        marginBottom: Spacing.sm,
    },
    scrollContent: {
        paddingHorizontal: Spacing.xs,
    },
    item: {
        width: 50,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: 'transparent',
        marginBottom: 4,
    },
    itemText: {
        fontSize: FontSize.lg,
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: Spacing.md,
    },
    btn: {
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.xl,
        borderRadius: BorderRadius.md,
    },
    confirmBtn: {
        elevation: 2,
    },
    btnText: {
        fontSize: FontSize.md,
        fontWeight: '700',
    },
});
