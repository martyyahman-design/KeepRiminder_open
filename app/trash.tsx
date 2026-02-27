import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Platform, useColorScheme } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMemos } from '../src/contexts/MemoContext';
import { useThemeColors, Spacing, FontSize, BorderRadius, getCardShadow } from '../src/theme';
import { MEMO_COLORS } from '../src/types/models';

export default function TrashScreen() {
    const { deletedMemos, restoreMemo, permanentlyDeleteMemo, emptyTrash, loading } = useMemos();
    const colors = useThemeColors();
    const colorScheme = useColorScheme();

    const handleRestore = (id: string) => {
        restoreMemo(id);
    };

    const handleDelete = (id: string) => {
        if (Platform.OS === 'web') {
            if (window.confirm('このメモを完全に削除しますか？\nこの操作は取り消せません。')) {
                permanentlyDeleteMemo(id);
            }
            return;
        }

        Alert.alert(
            'メモを完全に削除',
            'この操作は取り消せません。本当に削除しますか？',
            [
                { text: 'キャンセル', style: 'cancel' },
                { text: '削除', style: 'destructive', onPress: () => permanentlyDeleteMemo(id) },
            ]
        );
    };

    const handleEmptyTrash = () => {
        if (deletedMemos.length === 0) return;

        if (Platform.OS === 'web') {
            if (window.confirm('ごみ箱を空にしますか？\nごみ箱内のすべてのメモを完全に削除します。この操作は取り消せません。')) {
                emptyTrash();
            }
            return;
        }

        Alert.alert(
            'ごみ箱を空にする',
            'ごみ箱内のすべてのメモを完全に削除します。この操作は取り消せません。',
            [
                { text: 'キャンセル', style: 'cancel' },
                { text: 'すべて削除', style: 'destructive', onPress: () => emptyTrash() },
            ]
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: colors.textSecondary }}>読み込み中...</Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen
                options={{
                    title: 'ごみ箱',
                    headerRight: () => (
                        <TouchableOpacity
                            onPress={handleEmptyTrash}
                            disabled={deletedMemos.length === 0}
                            style={{ opacity: deletedMemos.length === 0 ? 0.3 : 1 }}
                        >
                            <Text style={{ color: '#FF5252', fontWeight: '600', marginRight: Spacing.md }}>空にする</Text>
                        </TouchableOpacity>
                    ),
                }}
            />

            <FlatList
                data={deletedMemos}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="trash-outline" size={64} color={colors.textTertiary} />
                        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>ごみ箱は空です</Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <View
                        style={[
                            styles.memoCard,
                            {
                                backgroundColor: colorScheme === 'dark'
                                    ? MEMO_COLORS[item.color].bgDark
                                    : MEMO_COLORS[item.color].bg,
                                ...getCardShadow(colors)
                            }
                        ]}
                    >
                        <View style={styles.cardHeader}>
                            <Text style={[styles.memoTitle, { color: MEMO_COLORS[item.color].text }]} numberOfLines={1}>
                                {item.title || '(無題)'}
                            </Text>
                        </View>
                        <Text style={[styles.memoContent, { color: MEMO_COLORS[item.color].text }]} numberOfLines={2}>
                            {item.content || '(内容なし)'}
                        </Text>

                        <View style={styles.cardActions}>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: 'rgba(0,0,0,0.05)' }]}
                                onPress={() => handleRestore(item.id)}
                            >
                                <Ionicons name="refresh" size={18} color={colors.textSecondary} />
                                <Text style={[styles.actionText, { color: colors.textSecondary }]}>復元</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: 'rgba(255,82,82,0.1)' }]}
                                onPress={() => handleDelete(item.id)}
                            >
                                <Ionicons name="trash" size={18} color="#FF5252" />
                                <Text style={[styles.actionText, { color: '#FF5252' }]}>削除</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    listContent: { padding: Spacing.md, paddingBottom: 40 },
    emptyContainer: { alignItems: 'center', marginTop: 100, opacity: 0.5 },
    emptyText: { marginTop: Spacing.md, fontSize: FontSize.md, fontWeight: '500' },
    memoCard: {
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        marginBottom: Spacing.md,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
    memoTitle: { fontSize: FontSize.md, fontWeight: '700' },
    memoContent: { fontSize: FontSize.sm, opacity: 0.8, marginBottom: Spacing.md },
    cardActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: Spacing.sm,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
        paddingTop: Spacing.sm,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 6,
        borderRadius: BorderRadius.sm,
        gap: 4,
    },
    actionText: { fontSize: FontSize.xs, fontWeight: '600' },
});
