import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    FlatList,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, Spacing, FontSize, BorderRadius } from '../theme';
import { LocationPreset } from '../types/models';

interface LocationPresetPickerProps {
    visible: boolean;
    onClose: () => void;
    presets: LocationPreset[];
    onSelect: (preset: LocationPreset) => void;
    onDelete: (id: string) => void;
}

export const LocationPresetPicker: React.FC<LocationPresetPickerProps> = ({
    visible,
    onClose,
    presets,
    onSelect,
    onDelete,
}) => {
    const colors = useThemeColors();

    const handleDelete = (preset: LocationPreset) => {
        Alert.alert(
            'プリセットの削除',
            `「${preset.name}」を削除してもよろしいですか？`,
            [
                { text: 'キャンセル', style: 'cancel' },
                {
                    text: '削除',
                    style: 'destructive',
                    onPress: () => onDelete(preset.id)
                },
            ]
        );
    };

    const renderItem = ({ item }: { item: LocationPreset }) => (
        <View style={[styles.itemContainer, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
                style={styles.itemMain}
                onPress={() => {
                    onSelect(item);
                    onClose();
                }}
            >
                <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}15` }]}>
                    <Ionicons name="location" size={20} color={colors.primary} />
                </View>
                <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.itemDetail, { color: colors.textTertiary }]}>
                        半径 {item.radius}m
                    </Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(item)}
            >
                <Ionicons name="trash-outline" size={20} color={colors.error || '#ff4444'} />
            </TouchableOpacity>
        </View>
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.text }]}>場所のプリセット</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {presets.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Ionicons name="bookmark-outline" size={48} color={colors.textTertiary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                保存された場所はありません。
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={presets}
                            keyExtractor={(item) => item.id}
                            renderItem={renderItem}
                            contentContainerStyle={styles.listContent}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    modalContent: {
        maxHeight: '70%',
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    title: {
        fontSize: FontSize.lg,
        fontWeight: '700',
    },
    listContent: {
        paddingBottom: Spacing.lg,
    },
    itemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
        borderBottomWidth: 1,
    },
    itemMain: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.md,
    },
    itemInfo: {
        flex: 1,
    },
    itemName: {
        fontSize: FontSize.md,
        fontWeight: '600',
    },
    itemDetail: {
        fontSize: FontSize.xs,
        marginTop: 2,
    },
    deleteBtn: {
        padding: Spacing.sm,
    },
    emptyContainer: {
        padding: Spacing.xxl,
        alignItems: 'center',
    },
    emptyText: {
        marginTop: Spacing.md,
        fontSize: FontSize.md,
        textAlign: 'center',
    },
});
