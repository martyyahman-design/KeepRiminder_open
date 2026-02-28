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
    Modal,
    Platform,
    Image,
    useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMemos } from '../../src/contexts/MemoContext';
import { useThemeColors, Spacing, FontSize, BorderRadius, getCardShadow } from '../../src/theme';
import { MemoWithTriggers, MEMO_COLORS, MemoColor } from '../../src/types/models';
import { CountdownText } from '../../src/components/CountdownText';
import { useAuth } from '../../src/contexts/AuthContext';
import { useSync } from '../../src/contexts/SyncContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = Spacing.sm;
const CARD_WIDTH = (SCREEN_WIDTH - Spacing.lg * 2 - CARD_MARGIN) / 2;

export default function MemoListScreen() {
    const { memos, loading, createMemo, updateMemo, refreshMemos } = useMemos();
    const { user, signIn, signOut, loading: authLoading } = useAuth();
    const { isSyncing } = useSync();
    const colors = useThemeColors();
    const colorScheme = useColorScheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchVisible, setIsSearchVisible] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [filterType, setFilterType] = useState<'all' | 'todo' | 'datetime' | 'timer' | 'location'>('all');
    const [isAccountMenuVisible, setIsAccountMenuVisible] = useState(false);

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
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            }
            return 0; // Default sorting for other filters
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

    const getTodayStr = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = (now.getMonth() + 1).toString().padStart(2, '0');
        const d = now.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const todayStr = getTodayStr();

    const todayMemos = memos.filter(m => {
        if (m.isCompleted) return false;
        if (m.todoType === 'daily') return true;
        if (m.todoType === 'deadline' && m.todoDate) {
            return m.todoDate <= todayStr;
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
            {/* Trigger & ToDo Tags */}
            <View style={[styles.triggerBadges, { marginTop: Spacing.sm }]}>
                {/* ToDo Date Tag */}
                {item.todoType !== 'none' && item.todoDate && (
                    <View style={[styles.triggerBadge, { backgroundColor: '#2196F320', borderColor: '#2196F340', borderWidth: 1 }]}>
                        <Ionicons name="checkbox-outline" size={12} color="#2196F3" />
                        <Text style={[styles.triggerBadgeText, { color: '#2196F3', fontWeight: '600' }]}>
                            {item.todoDate.split('-').slice(1).join('/')}
                        </Text>
                    </View>
                )}

                {/* Triggers Tags */}
                {item.triggers.map(trigger => {
                    let label = '';
                    if (trigger.type === 'datetime' && trigger.scheduledAt) {
                        const d = new Date(trigger.scheduledAt);
                        label = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
                    } else if (trigger.type === 'timer') {
                        label = 'タイマー';
                    } else if (trigger.type === 'location_enter') {
                        label = trigger.locationName || '到着';
                    } else if (trigger.type === 'location_exit') {
                        label = trigger.locationName || '出発';
                    }

                    const isNotifyType = trigger.type === 'datetime' || trigger.type === 'timer' || trigger.type.startsWith('location');
                    const themeColor = isNotifyType ? '#FF9800' : colors.primary;

                    return (
                        <View key={trigger.id} style={styles.badgeWrapper}>
                            <View
                                style={[
                                    styles.triggerBadge,
                                    {
                                        backgroundColor: trigger.isActive
                                            ? `${themeColor}20`
                                            : `${colors.textTertiary}15`,
                                        borderColor: trigger.isActive ? `${themeColor}40` : 'transparent',
                                        borderWidth: trigger.isActive ? 1 : 0,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name={getTriggerIcon(trigger.type) as any}
                                    size={11}
                                    color={trigger.isActive ? themeColor : colors.textTertiary}
                                />
                                <Text
                                    style={[
                                        styles.triggerBadgeText,
                                        { color: trigger.isActive ? themeColor : colors.textTertiary, fontWeight: trigger.isActive ? '600' : '400' },
                                    ]}
                                >
                                    {label}
                                </Text>
                                {trigger.type === 'timer' && trigger.isActive && (
                                    <CountdownText
                                        trigger={trigger}
                                        style={[styles.countdownText, { color: themeColor }]}
                                        hideIcon={true}
                                    />
                                )}
                            </View>
                        </View>
                    );
                })}
            </View>
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
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <View style={[styles.logoContainer, { backgroundColor: colors.primary + '15' }]}>
                        <Image source={require('../../assets/keepreminder_icon.png')} style={{ width: 26, height: 26, borderRadius: 6 }} />
                    </View>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>KeepReminder</Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                    {/* Search Button */}
                    <TouchableOpacity
                        onPress={() => setIsSearchVisible(!isSearchVisible)}
                        style={[
                            styles.authBtn,
                            { backgroundColor: isSearchVisible ? colors.primary + '20' : colors.surface, borderColor: isSearchVisible ? colors.primary : 'transparent', borderWidth: isSearchVisible ? 1 : 0 },
                            getCardShadow(colors)
                        ]}
                    >
                        <Ionicons name="search" size={20} color={isSearchVisible ? colors.primary : colors.textSecondary} />
                    </TouchableOpacity>

                    {/* Trash Button */}
                    <TouchableOpacity
                        onPress={() => router.push('/trash' as any)}
                        style={[
                            styles.authBtn,
                            { backgroundColor: colors.surface },
                            getCardShadow(colors)
                        ]}
                    >
                        <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>

                    {/* Auth Button */}
                    <TouchableOpacity
                        onPress={user ? () => setIsAccountMenuVisible(true) : signIn}
                        disabled={authLoading}
                        style={[
                            styles.authBtn,
                            { backgroundColor: colors.surface },
                            getCardShadow(colors)
                        ]}
                    >
                        {authLoading ? (
                            <View style={{ opacity: 0.5 }}>
                                <Ionicons name="cloud-outline" size={24} color={colors.textTertiary} />
                            </View>
                        ) : user ? (
                            user.photo ? (
                                <Image source={{ uri: user.photo }} style={styles.userPhoto} />
                            ) : (
                                <View style={styles.userIconPlaceholder}>
                                    <Ionicons name="person-circle" size={32} color={colors.primary} />
                                    {isSyncing && <View style={[styles.syncBadge, { backgroundColor: colors.success }]} />}
                                </View>
                            )
                        ) : (
                            <Ionicons name="log-in-outline" size={24} color={colors.primary} />
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Top Search Bar (Visible when toggled from header) */}
            {isSearchVisible && (
                <View style={styles.topSearchWrapper}>
                    <View style={[styles.searchRowInside, { marginBottom: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, getCardShadow(colors)]}>
                        <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIconInside} />
                        <TextInput
                            style={[styles.searchInputInside, { color: colors.text, fontSize: FontSize.md }]}
                            placeholder="メモを検索..."
                            placeholderTextColor={colors.textSecondary}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoFocus
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {/* Web Notice */}
            {Platform.OS === 'web' && (
                <View style={styles.webNotice}>
                    <Ionicons name="notifications-off-outline" size={12} color={colors.textTertiary} />
                    <Text style={[styles.webNoticeText, { color: colors.textTertiary }]}>
                        ※Web版では通知・アラーム機能は動作しません
                    </Text>
                </View>
            )}

            {/* Account Info Modal */}
            <Modal
                visible={isAccountMenuVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsAccountMenuVisible(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setIsAccountMenuVisible(false)}
                >
                    <Pressable
                        style={[styles.accountMenu, { backgroundColor: colors.surface }, getCardShadow(colors)]}
                        onPress={(e) => e.stopPropagation()}
                    >
                        {user && (
                            <>
                                <View style={styles.accountHeader}>
                                    {user.photo ? (
                                        <Image source={{ uri: user.photo }} style={styles.menuUserPhoto} />
                                    ) : (
                                        <View style={[styles.menuUserIcon, { backgroundColor: colors.primary + '15' }]}>
                                            <Ionicons name="person" size={24} color={colors.primary} />
                                        </View>
                                    )}
                                    <View style={styles.userInfo}>
                                        <Text style={[styles.userName, { color: colors.text }]}>{user.name || 'ユーザー'}</Text>
                                        <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user.email}</Text>
                                    </View>
                                </View>

                                <View style={[styles.menuSeparator, { backgroundColor: colors.border }]} />

                                <TouchableOpacity
                                    style={styles.logoutBtn}
                                    onPress={() => {
                                        setIsAccountMenuVisible(false);
                                        signOut();
                                    }}
                                >
                                    <Ionicons name="log-out-outline" size={20} color={colors.error} />
                                    <Text style={[styles.logoutText, { color: colors.error }]}>ログアウト</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Login Warning Banner */}
            {!user && !authLoading && (
                <View style={[styles.warningBanner, { backgroundColor: colors.surface, borderColor: colors.warning + '40' }, getCardShadow(colors)]}>
                    <View style={[styles.warningIconContainer, { backgroundColor: colors.warning + '15' }]}>
                        <Ionicons name="cloud-offline" size={20} color={colors.warning} />
                    </View>
                    <View style={styles.warningContent}>
                        <Text style={[styles.warningTitle, { color: colors.text }]}>同期オフ</Text>
                        <Text style={[styles.warningText, { color: colors.textSecondary }]}>
                            ログインすると Google Drive でデータを同期できます
                        </Text>
                    </View>
                    <TouchableOpacity onPress={signIn} style={[styles.warningAction, { backgroundColor: colors.primary }]}>
                        <Text style={styles.warningActionText}>ログイン</Text>
                    </TouchableOpacity>
                </View>
            )}

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
                ListHeaderComponent={(todayMemos.length > 0 || filteredMemos.length > 0) ? (
                    <View>
                        {todayMemos.length > 0 && (
                            <View style={[styles.todaySection, { backgroundColor: colors.surface + '80', borderColor: colors.border }]}>
                                <View style={styles.sectionHeader}>
                                    <Ionicons name="today" size={18} color={colors.primary} />
                                    <Text style={[styles.sectionTitle, { color: colors.text }]}>今日のToDo</Text>
                                    <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                                        <Text style={styles.badgeText}>{todayMemos.length}</Text>
                                    </View>
                                </View>
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
                        )}

                        {/* 2. メモ一覧セクション: 見出しとフィルター */}
                        <View style={styles.listSectionHeader}>
                            <Text style={[styles.listSectionTitle, { color: colors.textSecondary }]}>メモ一覧</Text>
                            <View style={[styles.line, { backgroundColor: colors.border }]} />
                        </View>

                        <View style={styles.filterContainerResponsive}>
                            {(['all', 'timer', 'todo', 'datetime', 'location'] as const).map((type) => (
                                <TouchableOpacity
                                    key={type}
                                    activeOpacity={0.7}
                                    style={[
                                        styles.filterChipInside,
                                        filterType === type && { backgroundColor: `${colors.primary}15`, borderColor: colors.primary }
                                    ]}
                                    onPress={() => setFilterType(type)}
                                >
                                    {type === 'todo' && <Ionicons name="checkmark-circle-outline" size={14} color={filterType === type ? colors.primary : colors.textSecondary} />}
                                    {type === 'datetime' && <Ionicons name="calendar-outline" size={14} color={filterType === type ? colors.primary : colors.textSecondary} />}
                                    {type === 'timer' && <Ionicons name="time-outline" size={14} color={filterType === type ? colors.primary : colors.textSecondary} />}
                                    {type === 'location' && <Ionicons name="location-outline" size={14} color={filterType === type ? colors.primary : colors.textSecondary} />}
                                    <Text style={[
                                        styles.filterText,
                                        { color: filterType === type ? colors.primary : colors.textSecondary }
                                    ]}>
                                        {type === 'all' ? 'すべて' :
                                            type === 'todo' ? 'TODO' :
                                                type === 'datetime' ? '日時' :
                                                    type === 'timer' ? 'タイマー' : 'エリア'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>


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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.xl,
        paddingBottom: Spacing.md,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    logoContainer: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: FontSize.xl,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    searchRow: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        height: 44,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
    },
    authBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    userPhoto: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    userIconPlaceholder: {
        position: 'relative',
    },
    syncBadge: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: '#fff',
    },
    filterContainerResponsive: {
        flexDirection: 'row',
        flexWrap: 'nowrap', // Force single line
        paddingHorizontal: Spacing.sm, // Reduce from lg
        gap: 4, // Reduce from Spacing.sm
        marginBottom: Spacing.lg,
        marginTop: -Spacing.sm,
        justifyContent: 'space-between', // Distribute evenly
    },
    filterChipInside: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6, // Reduce from 10
        paddingVertical: 6,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(128, 128, 128, 0.2)',
        gap: 2, // Reduce from 4
    },
    topSearchWrapper: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    filterText: {
        fontSize: 11, // Reduce from FontSize.xs (12)
        fontWeight: '700',
    },
    filterDivider: {
        width: 1,
        height: 24,
        alignSelf: 'center',
        marginHorizontal: 2,
        opacity: 0.1,
    },
    searchRowInside: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: Spacing.lg,
        marginBottom: Spacing.lg,
        paddingHorizontal: Spacing.md,
        paddingVertical: 10,
        borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(128, 128, 128, 0.05)',
        gap: Spacing.sm,
    },
    searchIconInside: {
        opacity: 0.5,
    },
    searchInputInside: {
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
        marginBottom: Spacing.xxl,
        marginTop: Spacing.sm,
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    sectionTitle: {
        fontSize: FontSize.lg,
        fontWeight: '800',
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: BorderRadius.full,
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
    },
    listSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        marginBottom: Spacing.lg,
    },
    listSectionTitle: {
        fontSize: FontSize.sm,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    line: {
        flex: 1,
        height: 1,
        opacity: 0.5,
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
    warningBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: Spacing.lg,
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        gap: Spacing.md,
        marginBottom: Spacing.lg,
    },
    warningIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    warningContent: {
        flex: 1,
    },
    warningTitle: {
        fontSize: FontSize.sm,
        fontWeight: '700',
        marginBottom: 2,
    },
    warningText: {
        fontSize: 11,
        lineHeight: 14,
    },
    warningAction: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        borderRadius: BorderRadius.full,
    },
    warningActionText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    badgeWrapper: {
        gap: 4,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        paddingTop: 80,
        paddingRight: Spacing.lg,
    },
    accountMenu: {
        width: 240,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
    },
    accountHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        marginBottom: Spacing.md,
    },
    menuUserPhoto: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    menuUserIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: FontSize.md,
        fontWeight: '700',
    },
    userEmail: {
        fontSize: FontSize.xs,
        marginTop: 2,
    },
    menuSeparator: {
        height: 1,
        marginBottom: Spacing.sm,
        opacity: 0.1,
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: 8,
    },
    logoutText: {
        fontSize: FontSize.sm,
        fontWeight: '700',
    },
    webNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.xs,
        gap: Spacing.xs,
        opacity: 0.8,
    },
    webNoticeText: {
        fontSize: 10,
        fontWeight: '500',
    },
});
