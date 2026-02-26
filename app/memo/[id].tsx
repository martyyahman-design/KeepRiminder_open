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
    Pressable,
    GestureResponderEvent,
    Image,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMemos } from '../../src/contexts/MemoContext';
import { useThemeColors, Spacing, FontSize, BorderRadius, getCardShadow } from '../../src/theme';
import { MemoColor, MEMO_COLORS, Trigger } from '../../src/types/models';
import { useColorScheme } from 'react-native';
import { formatDate } from '../../src/utils/dateUtils';
import MapViewComponent from '../../src/components/MapViewComponent';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { CalendarDatePicker } from '../../src/components/CalendarDatePicker';
import { CountdownText } from '../../src/components/CountdownText';
import { ContentBlock } from '../../src/types/models';

export default function MemoEditScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { memos, updateMemo, deleteMemo, deleteTrigger } = useMemos();
    const colors = useThemeColors();
    const colorScheme = useColorScheme();

    const memo = memos.find(m => m.id === id);

    const [title, setTitle] = useState(memo?.title || '');
    const [content, setContent] = useState(memo?.content || '');
    const [color, setColor] = useState<MemoColor>(memo?.color || 'default');
    const [blocks, setBlocks] = useState<ContentBlock[]>(memo?.blocks || [{ id: '1', type: 'text', content: '' }]);
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
    const [selection, setSelection] = useState({ start: 0, end: 0 });
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);

    useEffect(() => {
        if (memo) {
            setTitle(memo.title);
            setContent(memo.content);
            setColor(memo.color);
            setBlocks(memo.blocks);
        }
    }, [memo?.id]);

    // Auto-save on change
    useEffect(() => {
        if (!id) return;
        const timer = setTimeout(() => {
            // Update redundant content field for search compatibility
            const plainContent = blocks.filter(b => b.type === 'text').map(b => b.content).join('\n');
            updateMemo(id, { title, content: plainContent, color, blocks });
        }, 500);
        return () => clearTimeout(timer);
    }, [title, blocks, color, id]);

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

    const handleAddImage = async (insertIndex?: number) => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 0.8,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            const asset = result.assets[0];
            let imageUri = asset.uri;

            // On Native, copy to app's document directory for persistence
            if (Platform.OS !== 'web') {
                const filename = `img_${Date.now()}.jpg`;
                const newUri = `${(FileSystem as any).documentDirectory}${filename}`;
                try {
                    await (FileSystem as any).copyAsync({ from: imageUri, to: newUri });
                    imageUri = newUri;
                } catch (err) {
                    console.error('Failed to copy image', err);
                }
            }

            const imageBlock: ContentBlock = {
                id: `img-${Date.now()}`,
                type: 'image',
                content: imageUri,
            };

            setBlocks(prev => {
                const newBlocks = [...prev];

                // Case 1: Specific index provided (e.g. from inline plus button)
                if (typeof insertIndex === 'number') {
                    newBlocks.splice(insertIndex, 0, imageBlock);
                    return newBlocks;
                }

                // Case 2: Split current active text block
                if (activeBlockId) {
                    const index = prev.findIndex(b => b.id === activeBlockId);
                    if (index !== -1) {
                        const currentBlock = prev[index];
                        if (currentBlock.type === 'text') {
                            const beforeText = currentBlock.content.substring(0, selection.start);
                            const afterText = currentBlock.content.substring(selection.end);

                            newBlocks[index] = { ...currentBlock, content: beforeText };
                            const afterBlock: ContentBlock = { id: `text-after-${Date.now()}`, type: 'text', content: afterText };
                            newBlocks.splice(index + 1, 0, imageBlock, afterBlock);
                            return newBlocks;
                        }
                    }
                }

                // Case 3: Simple append at the end
                const nextTextBlock: ContentBlock = {
                    id: `text-${Date.now()}`,
                    type: 'text',
                    content: '',
                };
                return [...prev, imageBlock, nextTextBlock];
            });
        }
    };

    const handleAddTextBlock = (afterId?: string) => {
        const newBlock: ContentBlock = {
            id: `text-${Date.now()}`,
            type: 'text',
            content: '',
        };
        setBlocks(prev => {
            if (!afterId) return [...prev, newBlock];
            const index = prev.findIndex(b => b.id === afterId);
            const newBlocks = [...prev];
            newBlocks.splice(index + 1, 0, newBlock);
            return newBlocks;
        });
    };

    const handleUpdateBlock = (blockId: string, value: string) => {
        setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, content: value } : b));
    };

    const handleDeleteBlock = (blockId: string) => {
        // Don't delete if it's the only block? No, images can be deleted.
        // But if multiple text blocks exist and one is empty, we might want to merge.
        // Simplified: just filter.
        setBlocks(prev => {
            const result = prev.filter(b => b.id !== blockId);
            return result.length > 0 ? result : [{ id: Date.now().toString(), type: 'text', content: '' }];
        });
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
                {/* Dates */}
                <View style={styles.dateHeader}>
                    <View style={styles.dateItem}>
                        <Ionicons name="add-circle-outline" size={12} color={colors.textTertiary} />
                        <Text style={[styles.dateHeaderText, { color: colors.textTertiary }]}>
                            作成: {formatDate(memo.createdAt)}
                        </Text>
                    </View>
                    {memo.updatedAt !== memo.createdAt && (
                        <View style={styles.dateItem}>
                            <Ionicons name="pencil-outline" size={12} color={colors.textTertiary} />
                            <Text style={[styles.dateHeaderText, { color: colors.textTertiary }]}>
                                更新: {formatDate(memo.updatedAt)}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Title */}
                <TextInput
                    style={[styles.titleInput, { color: colorScheme === 'dark' ? '#F5F5F7' : '#1A1A2E' }]}
                    placeholder="タイトル"
                    placeholderTextColor={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
                    value={title}
                    onChangeText={setTitle}
                    multiline
                />

                {/* Blocks Editor */}
                {blocks.map((block, index) => (
                    <React.Fragment key={block.id}>
                        <View style={styles.blockContainer}>
                            {block.type === 'text' ? (
                                <TextInput
                                    style={[styles.contentInput, { color: colorScheme === 'dark' ? '#D1D5DB' : '#374151' }]}
                                    placeholder="メモを入力..."
                                    placeholderTextColor={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
                                    value={block.content}
                                    onChangeText={(text) => handleUpdateBlock(block.id, text)}
                                    onFocus={() => setActiveBlockId(block.id)}
                                    onSelectionChange={(e) => {
                                        if (activeBlockId === block.id) {
                                            setSelection(e.nativeEvent.selection);
                                        }
                                    }}
                                    multiline
                                    scrollEnabled={false}
                                />
                            ) : (
                                <View style={styles.imageBlockContainer}>
                                    <Image source={{ uri: block.content }} style={styles.imageBlock} resizeMode="cover" />
                                    <TouchableOpacity
                                        style={styles.deleteBlockBtn}
                                        onPress={() => handleDeleteBlock(block.id)}
                                    >
                                        <Ionicons name="close-circle" size={24} color={colors.error} />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>

                        {/* Inline Add Button between blocks */}
                        <View style={styles.inlineAddBtn}>
                            <View style={[styles.inlineAddLine, { backgroundColor: colors.border }]} />
                            <TouchableOpacity
                                style={[styles.inlineAddAction, { backgroundColor: colors.background, borderColor: colors.border }]}
                                onPress={() => handleAddTextBlock(block.id)}
                            >
                                <Ionicons name="text" size={12} color={colors.textTertiary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.inlineAddAction, { backgroundColor: colors.background, borderColor: colors.border }]}
                                onPress={() => handleAddImage(index + 1)}
                            >
                                <Ionicons name="image" size={12} color={colors.textTertiary} />
                            </TouchableOpacity>
                            <View style={[styles.inlineAddLine, { backgroundColor: colors.border }]} />
                        </View>
                    </React.Fragment>
                ))}

                <TouchableOpacity
                    style={[styles.addImageBtn, { borderColor: colors.primary + '30', backgroundColor: colors.primary + '05' }]}
                    onPress={() => handleAddImage()}
                >
                    <Ionicons name="image-outline" size={20} color={colors.primary} />
                    <Text style={[styles.addImageText, { color: colors.primary }]}>画像を末尾に追加</Text>
                </TouchableOpacity>

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

                {Platform.OS === 'web' && (
                    <View style={styles.webNotice}>
                        <Ionicons name="notifications-off-outline" size={12} color={colors.textTertiary} />
                        <Text style={[styles.webNoticeText, { color: colors.textTertiary }]}>
                            ※Web版では通知・アラーム機能は動作しません
                        </Text>
                    </View>
                )}

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
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                                            <Text style={[styles.triggerType, { color: colorScheme === 'dark' ? '#F5F5F7' : '#1A1A2E' }]}>
                                                {trigger.type === 'datetime' ? '日時' :
                                                    trigger.type === 'timer' ? 'タイマー' :
                                                        trigger.type === 'location_enter' ? 'エリア入場' : 'エリア退場'}
                                            </Text>
                                            {trigger.type === 'timer' && trigger.isActive && (
                                                <CountdownText
                                                    trigger={trigger}
                                                    style={[styles.countdownText, { color: colors.primary, marginTop: 0 }]}
                                                    hideIcon={true}
                                                />
                                            )}
                                        </View>
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
                                <Pressable
                                    onPress={(e: GestureResponderEvent) => {
                                        e.stopPropagation();
                                        handleDeleteTrigger(trigger.id);
                                    }}
                                    hitSlop={8}
                                >
                                    <Ionicons name="close-circle" size={22} color={colors.textTertiary} />
                                </Pressable>
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

            {/* Floating Editor Toolbar (Visible when text is focused) */}
            {activeBlockId && (
                <View style={[styles.editorToolbar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
                    <TouchableOpacity style={styles.toolbarItem} onPress={() => handleAddImage()}>
                        <Ionicons name="image" size={24} color={colors.primary} />
                        <Text style={[styles.toolbarText, { color: colors.primary }]}>現在地に挿入</Text>
                    </TouchableOpacity>
                    <View style={styles.toolbarSeparator} />
                    <TouchableOpacity style={styles.toolbarItem} onPress={() => setActiveBlockId(null)}>
                        <Ionicons name="checkmark" size={24} color={colors.textSecondary} />
                        <Text style={[styles.toolbarText, { color: colors.textSecondary }]}>完了</Text>
                    </TouchableOpacity>
                </View>
            )}
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
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
        minHeight: 40,
        textAlignVertical: 'top',
    },
    blockContainer: {
        marginBottom: Spacing.xs,
    },
    imageBlockContainer: {
        marginHorizontal: Spacing.lg,
        marginVertical: Spacing.sm,
        position: 'relative',
    },
    imageBlock: {
        width: '100%',
        aspectRatio: 4 / 3,
        borderRadius: BorderRadius.md,
    },
    deleteBlockBtn: {
        position: 'absolute',
        top: -10,
        right: -10,
        backgroundColor: 'white',
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
    },
    addImageBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: Spacing.lg,
        marginVertical: Spacing.md,
        paddingVertical: Spacing.sm,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: BorderRadius.md,
        gap: Spacing.sm,
    },
    addImageText: {
        fontSize: FontSize.sm,
        fontWeight: '600',
    },
    inlineAddBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: Spacing.xs,
        paddingHorizontal: Spacing.xl,
        height: 20,
        opacity: 0.3,
    },
    inlineAddLine: {
        flex: 1,
        height: 1,
    },
    inlineAddCircle: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: Spacing.sm,
    },
    inlineAddAction: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 4,
    },
    editorToolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
        borderTopWidth: 1,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    toolbarItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.xs,
        paddingHorizontal: Spacing.md,
    },
    toolbarText: {
        fontSize: FontSize.sm,
        fontWeight: '600',
    },
    toolbarSeparator: {
        width: 1,
        height: 20,
        backgroundColor: 'rgba(128, 128, 128, 0.2)',
        marginHorizontal: Spacing.sm,
    },
    dateHeader: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.md,
        marginBottom: Spacing.md,
        marginTop: Spacing.sm,
    },
    dateItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    dateHeaderText: {
        fontSize: 11,
        fontWeight: '500',
        opacity: 0.8,
    },
    webNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.sm,
        gap: Spacing.xs,
        opacity: 0.8,
    },
    webNoticeText: {
        fontSize: FontSize.xs,
        fontWeight: '500',
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
    countdownText: {
        fontSize: FontSize.sm,
        fontWeight: '700',
        marginTop: Spacing.xs,
    },
});
