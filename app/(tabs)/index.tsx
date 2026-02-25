import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    RefreshControl,
    ScrollView,
    Dimensions,
    Animated,
    Pressable,
    GestureResponderEvent,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMemos } from '../../src/contexts/MemoContext';
import { useThemeColors, Spacing, FontSize, BorderRadius, getCardShadow } from '../../src/theme';
import { MemoWithTriggers, MEMO_COLORS, MemoColor } from '../../src/types/models';
import { CountdownText } from '../../src/components/CountdownText';
import { useColorScheme } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = Spacing.sm;
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - CARD_MARGIN) / 2;

export default function MemoListScreen() {
    const { memos, loading, createMemo, updateMemo, refreshMemos } = useMemos();
    const colors = useThemeColors();
    const colorScheme = useColorScheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [filterType, setFilterType] = useState<'all' | 'todo' | 'datetime' | 'timer' | 'location'>('all');

    const filteredMemos = memos
        .filter(m => {
            // Search filter
            const matchesSearch = !searchQuery.trim() ||
                m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                m.content.toLowerCase().includes(searchQuery.toLowerCase());

            if (!matchesSearch) return false;

            // Trigger type filter
            if (filterType === 'all') return true;
            if (filterType === 'todo') return m.todoType !== 'none';
            if (filterType === 'datetime') return m.triggers.some(t => t.type === 'datetime');
            if (filterType === 'timer') return m.triggers.some(t => t.type === 'timer');
            if (filterType === 'location') return m.triggers.some(t => t.type === 'location_enter' || t.type === 'location_exit');

            return true;
        })
        .sort((a, b) => {
            if (filterType === 'all') {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
            return 0; // Default sorting for other filters (could be customized)
        });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refreshMemos();
        setRefreshing(false);
    }, [refreshMemos]);

    const handleCreateMemo = async () => {
        const memo = await createMemo();
        router.push(`/memo/${memo.id}`);
    };

    const getCardColor = (color: MemoColor) => {
        const colorDef = MEMO_COLORS[color];
        return colorScheme === 'dark' ? colorDef.bgDark : colorDef.bg;
    };

    const handleToggleTodo = async (item: MemoWithTriggers) => {
        const isCompleted = !item.isCompleted;
        const completedAt = isCompleted ? new Date().toISOString() : null;
        await updateMemo(item.id, { isCompleted, completedAt });
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

    const todayStr = new Date().toISOString().split('T')[0];
    const todayMemos = memos.filter(m => {
        if (m.isCompleted) return false;
        if (m.todoType === 'deadline') {
            // Deadline tasks for today or older (carry over if not completed)
            return !m.todoDate || m.todoDate <= todayStr;
        }
        return false;
    });

    const renderMemoCard = ({ item }: { item: MemoWithTriggers }) => (
        <TouchableOpacity
            style={[
                styles.card,
                {
                    backgroundColor: getCardColor(item.color),
                    borderColor: item.color === 'default' ? colors.border : 'transparent',
                    borderWidth: item.color === 'default' ? 1 : 0,
                    ...getCardShadow(colors),
                },
            ]}
            onPress={() => router.push(`/memo/${item.id}`)}
            activeOpacity={0.7}
        >
            {item.isPinned && (
                <View style={styles.pinBadge}>
                    <Ionicons name="pin" size={12} color={colors.primary} />
                </View>
            )}
            {item.title ? (
                <View style={styles.cardHeader}>
                    {item.todoType !== 'none' && (
                        <Pressable
                            onPress={(e: GestureResponderEvent) => {
                                e.stopPropagation();
                                const isCompleted = !item.isCompleted;
                                const completedAt = isCompleted ? new Date().toISOString() : null;
                                updateMemo(item.id, { isCompleted, completedAt });
                            }}
                            style={styles.checkbox}
                            hitSlop={8}
                        >
                            <Ionicons
                                name={item.isCompleted ? "checkbox" : "square-outline"}
                                size={20}
                                color={item.isCompleted ? colors.primary : colors.textTertiary}
                            />
                        </Pressable>
                    )}
                    <Text
                        style={[
                            styles.cardTitle,
                            { color: colorScheme === 'dark' ? '#F5F5F7' : '#1A1A2E' },
                            item.isCompleted && styles.completedText
                        ]}
                        numberOfLines={2}
                    >
                        {item.title}
                    </Text>
                </View>
            ) : null}
            {item.content ? (
                <Text
                    style={[
                        styles.cardContent,
                        { color: colorScheme === 'dark' ? '#D1D5DB' : '#4B5563' },
                        item.isCompleted && styles.completedText
                    ]}
                    numberOfLines={6}
                >
                    {item.content}
                </Text>
            ) : null}
            {item.triggers.length > 0 && (
                <View style={styles.triggerBadges}>
                    {item.triggers.map(trigger => (
                        <View key={trigger.id} style={{ gap: 4 }}>
                            <View
                                style={[
                                    styles.triggerBadge,
                                    {
                                        backgroundColor: trigger.isActive
                                            ? `${colors.primary}20`
                                            : `${colors.textTertiary}15`,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name={getTriggerIcon(trigger.type) as any}
                                    size={11}
                                    color={trigger.isActive ? colors.primary : colors.textTertiary}
                                />
                                <Text
                                    style={[
                                        styles.triggerBadgeText,
                                        { color: trigger.isActive ? colors.primary : colors.textTertiary },
                                    ]}
                                >
                                    {trigger.type === 'datetime' ? '日時' :
                                        trigger.type === 'timer' ? 'タイマー' :
                                            trigger.type === 'location_enter' ? '入場' : '退場'}
                                </Text>
                                {trigger.type === 'timer' && trigger.isActive && (
                                    <CountdownText
                                        trigger={trigger}
                                        style={[styles.countdownText, { color: colors.primary }]}
                                        hideIcon={true}
                                    />
                                )}
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </TouchableOpacity>
    );

    const renderEmptyState = () => (
        <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
                メモがありません
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
                + ボタンをタップして新しいメモを作成しましょう
            </Text>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Search Bar */}
            <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="search" size={18} color={colors.textTertiary} />
                <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder="メモを検索..."
                    placeholderTextColor={colors.textTertiary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                {searchQuery ? (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                ) : null}
            </View>

            {/* Filter Chips */}
            <View style={styles.filterContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                    <TouchableOpacity
                        style={[styles.filterChip, filterType === 'all' && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}
                        onPress={() => setFilterType('all')}
                    >
                        <Text style={[styles.filterText, { color: filterType === 'all' ? colors.primary : colors.textSecondary }]}>すべて</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterChip, filterType === 'todo' && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}
                        onPress={() => setFilterType('todo')}
                    >
                        <Ionicons name="checkmark-circle-outline" size={14} color={filterType === 'todo' ? colors.primary : colors.textSecondary} />
                        <Text style={[styles.filterText, { color: filterType === 'todo' ? colors.primary : colors.textSecondary }]}>TODO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterChip, filterType === 'datetime' && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}
                        onPress={() => setFilterType('datetime')}
                    >
                        <Ionicons name="calendar" size={14} color={filterType === 'datetime' ? colors.primary : colors.textSecondary} />
                        <Text style={[styles.filterText, { color: filterType === 'datetime' ? colors.primary : colors.textSecondary }]}>日時</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterChip, filterType === 'timer' && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}
                        onPress={() => setFilterType('timer')}
                    >
                        <Ionicons name="timer" size={14} color={filterType === 'timer' ? colors.primary : colors.textSecondary} />
                        <Text style={[styles.filterText, { color: filterType === 'timer' ? colors.primary : colors.textSecondary }]}>タイマー</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.filterChip, filterType === 'location' && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }]}
                        onPress={() => setFilterType('location')}
                    >
                        <Ionicons name="location" size={14} color={filterType === 'location' ? colors.primary : colors.textSecondary} />
                        <Text style={[styles.filterText, { color: filterType === 'location' ? colors.primary : colors.textSecondary }]}>エリア</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>

            {/* Memo Grid */}
            <FlatList
                data={filteredMemos}
                renderItem={renderMemoCard}
                keyExtractor={(item) => item.id}
                numColumns={2}
                columnWrapperStyle={styles.row}
                contentContainerStyle={[
                    styles.listContent,
                    filteredMemos.length === 0 && todayMemos.length === 0 && styles.listEmpty,
                ]}
                ListHeaderComponent={todayMemos.length > 0 ? (
                    <View style={styles.todaySection}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>今日のタスク</Text>
                        {todayMemos.map(m => (
                            <TouchableOpacity
                                key={m.id}
                                style={[styles.todayItem, { backgroundColor: getCardColor(m.color), ...getCardShadow(colors) }]}
                                onPress={() => router.push(`/memo/${m.id}`)}
                            >
                                <Pressable
                                    onPress={(e: GestureResponderEvent) => {
                                        e.stopPropagation();
                                        handleToggleTodo(m);
                                    }}
                                    hitSlop={8}
                                >
                                    <Ionicons name="ellipse-outline" size={24} color={colors.primary} />
                                </Pressable>
                                <Text style={[styles.todayItemText, { color: colors.text }]}>{m.title || '(無題)'}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                ) : null}
                ListEmptyComponent={!loading ? renderEmptyState : null}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                    />
                }
                showsVerticalScrollIndicator={false}
            />

            {/* FAB */}
            <TouchableOpacity
                style={[styles.fab, { backgroundColor: colors.fab, ...getCardShadow(colors) }]}
                onPress={handleCreateMemo}
                activeOpacity={0.8}
            >
                <Ionicons name="add" size={28} color={colors.fabText} />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: Spacing.lg,
        marginTop: Spacing.md,
        marginBottom: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        gap: Spacing.sm,
    },
    filterContainer: {
        marginBottom: Spacing.md,
    },
    filterScroll: {
        paddingHorizontal: Spacing.lg,
        gap: Spacing.sm,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(128, 128, 128, 0.2)',
        gap: 6,
    },
    filterText: {
        fontSize: FontSize.sm,
        fontWeight: '600',
    },
    searchInput: {
        flex: 1,
        fontSize: FontSize.md,
        padding: 0,
    },
    listContent: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: 100,
    },
    listEmpty: {
        flex: 1,
    },
    row: {
        justifyContent: 'space-between',
        marginBottom: CARD_MARGIN,
    },
    card: {
        width: CARD_WIDTH,
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        minHeight: 100,
    },
    pinBadge: {
        position: 'absolute',
        top: Spacing.sm,
        right: Spacing.sm,
    },
    cardTitle: {
        flex: 1,
        fontSize: FontSize.md,
        fontWeight: '700',
        lineHeight: 22,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginBottom: Spacing.xs,
    },
    checkbox: {
        marginTop: 1,
    },
    completedText: {
        textDecorationLine: 'line-through',
        opacity: 0.6,
    },
    cardContent: {
        fontSize: FontSize.sm,
        lineHeight: 18,
        marginBottom: Spacing.sm,
    },
    triggerBadges: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 'auto' as any,
    },
    triggerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: BorderRadius.sm,
        gap: 3,
    },
    triggerBadgeText: {
        fontSize: FontSize.xs,
        fontWeight: '500',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 80,
    },
    emptyTitle: {
        fontSize: FontSize.lg,
        fontWeight: '600',
        marginTop: Spacing.lg,
    },
    emptySubtitle: {
        fontSize: FontSize.sm,
        marginTop: Spacing.sm,
    },
    fab: {
        position: 'absolute',
        right: Spacing.xl,
        bottom: 30,
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    todaySection: {
        marginBottom: Spacing.xl,
        marginTop: Spacing.sm,
    },
    sectionTitle: {
        fontSize: FontSize.lg,
        fontWeight: '700',
        marginBottom: Spacing.md,
    },
    todayItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        marginBottom: Spacing.sm,
        gap: Spacing.md,
    },
    todayItemText: {
        fontSize: FontSize.md,
        fontWeight: '600',
        flex: 1,
    },
    countdownText: {
        fontSize: 11,
        fontWeight: '700',
        marginLeft: 2,
    },
});
