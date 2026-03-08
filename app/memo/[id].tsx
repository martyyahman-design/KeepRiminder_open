import React, { useState, useEffect, useCallback, useRef } from 'react';
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
    Switch,
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
import { useNetwork } from '../../src/contexts/NetworkContext';
import { CalendarDatePicker } from '../../src/components/CalendarDatePicker';
import { CountdownText } from '../../src/components/CountdownText';
import { ContentBlock } from '../../src/types/models';
import ToolTip from '../../src/components/ToolTip';
import { startTimerTrigger, cancelTimerTrigger, scheduleDatetimeTrigger, cancelDatetimeTrigger } from '../../src/services/schedulerService';
import { registerGeofence, unregisterGeofence } from '../../src/services/geofencingService';

export default function MemoEditScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { memos, updateMemo, deleteMemo, deleteTrigger, updateTrigger } = useMemos();
    const { isOnline } = useNetwork();
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
    const [pinTooltip, setPinTooltip] = useState({ visible: false, message: '' });
    const [tagTooltip, setTagTooltip] = useState({ visible: false, message: '' });
    const inputRefs = useRef<{ [key: string]: any }>({});

    // Sync heights on Web to prevent 100px default height gap
    useEffect(() => {
        if (Platform.OS === 'web') {
            blocks.forEach(block => {
                if (block.type === 'text' && inputRefs.current[block.id]) {
                    const el = inputRefs.current[block.id];
                    el.style.height = 'auto';
                    el.style.height = (el.scrollHeight) + 'px';
                }
            });
        }
    }, [blocks]);

    useEffect(() => {
        if (memo) {
            setTitle(memo.title);
            // The original memo.content was a plain string.
            // The new structure expects memo.blocks to be the source of truth for blocks.
            // If memo.content is now expected to be JSON for blocks, this line needs adjustment.
            // Based on the user's instruction, the `setBlocks` part is changed.
            // Keeping `setContent` for backward compatibility if `memo.content` is still used elsewhere as a plain string.
            setContent(memo.content); // Keep this if memo.content is still a plain string summary
            const initialBlocks: ContentBlock[] = memo.blocks && memo.blocks.length > 0 ? memo.blocks : [{ id: `text-${Date.now()}`, type: 'text', content: '' }];
            setBlocks(initialBlocks);
            setColor(memo.color);
        }
    }, [memo?.id]);

    const isFirstMount = useRef(true);

    // Auto-save on change
    useEffect(() => {
        if (!id || isDeleting.current) return;

        // Skip the very first auto-save trigger on mount to prevent unnecessary DB updates and sync loops
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }

        const timer = setTimeout(() => {
            if (isDeleting.current) return;
            // Update redundant content field for search compatibility
            const plainContent = blocks.filter(b => b.type === 'text').map(b => b.content).join('\n');
            updateMemo(id, { title, content: plainContent, color, blocks });
        }, 500);
        return () => clearTimeout(timer);
    }, [title, blocks, color, id]);

    const handleTogglePin = async () => {
        if (!id || !memo) return;
        if (!isOnline) {
            Alert.alert('オフライン', 'オフライン時はピン留めの状態を変更できません。');
            return;
        }
        const newPinnedState = !memo.isPinned;
        await updateMemo(id, { isPinned: newPinnedState });

        // Show tooltip
        setPinTooltip({ visible: true, message: newPinnedState ? '一覧にピン留めしました' : 'ピン留めを解除しました' });
        setTimeout(() => setPinTooltip(prev => ({ ...prev, visible: false })), 2000);
    };

    const handleToggleTag = async () => {
        if (!id || !memo) return;
        if (!isOnline) {
            Alert.alert('オフライン', 'オフライン時はタグを変更できません。');
            return;
        }
        const newTag = memo.tag === 'work' ? 'private' : 'work';
        await updateMemo(id, { tag: newTag });

        // Show tooltip
        setTagTooltip({ visible: true, message: newTag === 'work' ? '仕事タグを設定しました' : 'プライベートタグを設定しました' });
        setTimeout(() => setTagTooltip(prev => ({ ...prev, visible: false })), 2000);
    };

    const isDeleting = useRef(false);

    const handleDelete = async () => {
        if (!isOnline) {
            Alert.alert('オフライン', 'オフライン時は削除できません。');
            return;
        }

        const performDelete = async () => {
            if (id) {
                isDeleting.current = true;
                await deleteMemo(id);
                router.back();
            }
        };

        if (Platform.OS === 'web') {
            if (window.confirm('このメモを削除してもよろしいですか？')) {
                await performDelete();
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
        if (!isOnline) {
            Alert.alert('オフライン', 'オフライン時はトリガーを削除できません。');
            return;
        }
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

    const handleToggleTrigger = async (trigger: Trigger) => {
        if (!isOnline) {
            Alert.alert('オフライン', 'オフライン時はトリガーの状態を変更できません。');
            return;
        }
        const newIsActive = !trigger.isActive;
        let updates: any = { isActive: newIsActive };

        if (newIsActive) {
            // Turning ON
            if (trigger.type === 'timer') {
                // Clear any previous snooze state
                updates.scheduledAt = null;
                updates.startedAt = new Date().toISOString();
                const updatedTrigger = { ...trigger, ...updates };
                await updateTrigger(trigger.id, updates);
                await startTimerTrigger(updatedTrigger);
            } else if (trigger.type === 'datetime') {
                if (trigger.scheduledAt && new Date(trigger.scheduledAt) <= new Date()) {
                    Alert.alert('エラー', '過去の日時は設定できません。トリガーを再作成してください。');
                    return;
                }
                const updatedTrigger = { ...trigger, ...updates };
                await updateTrigger(trigger.id, updates);
                await scheduleDatetimeTrigger(updatedTrigger);
            } else if (trigger.type.startsWith('location')) {
                const updatedTrigger = { ...trigger, ...updates };
                await updateTrigger(trigger.id, updates);
                await registerGeofence(updatedTrigger);
            }
        } else {
            // Turning OFF
            await updateTrigger(trigger.id, updates);
            if (trigger.type === 'timer') {
                await cancelTimerTrigger(trigger);
            } else if (trigger.type === 'datetime') {
                await cancelDatetimeTrigger(trigger);
            } else if (trigger.type.startsWith('location')) {
                await unregisterGeofence(trigger.id);
            }
        }
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
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === blockId);
            if (index === -1) return prev;

            // Handle backspace at the beginning of a block to merge with previous text block
            if (index > 0 && value.length < prev[index].content.length && selection.start === 0 && selection.end === 0) {
                const prevBlock = prev[index - 1];
                if (prevBlock.type === 'text') {
                    const newBlocks = [...prev];
                    const mergedContent = prevBlock.content + value;
                    newBlocks[index - 1] = { ...prevBlock, content: mergedContent };
                    newBlocks.splice(index, 1);
                    return newBlocks;
                }
            }

            return prev.map(b => b.id === blockId ? { ...b, content: value } : b);
        });

        // Sync height on Web
        if (Platform.OS === 'web' && inputRefs.current[blockId]) {
            const el = inputRefs.current[blockId];
            el.style.height = 'auto';
            el.style.height = (el.scrollHeight) + 'px';
        }
    };

    const handleDeleteBlock = (blockId: string) => {
        setBlocks(prev => {
            const result = prev.filter(b => b.id !== blockId);
            // After deleting a block, if we have adjacent text blocks, merge them
            const merged: ContentBlock[] = [];
            for (const block of result) {
                const last = merged[merged.length - 1];
                if (last && last.type === 'text' && block.type === 'text') {
                    last.content += (last.content ? '\n' : '') + block.content;
                } else {
                    merged.push({ ...block });
                }
            }
            return merged.length > 0 ? merged : [{ id: Date.now().toString(), type: 'text', content: '' }];
        });
    };

    const getTriggerDescription = (trigger: Trigger): string => {
        switch (trigger.type) {
            case 'datetime':
                return trigger.scheduledAt
                    ? new Date(trigger.scheduledAt).toLocaleString('ja-JP', { hour12: false })
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
                <View style={{ position: 'relative' }}>
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
                    <ToolTip visible={pinTooltip.visible} message={pinTooltip.message} />
                </View>

                <View style={{ position: 'relative' }}>
                    <TouchableOpacity
                        onPress={handleToggleTag}
                        style={[styles.actionBtn, { backgroundColor: memo.tag === 'private' ? `${colors.accent}15` : `${colors.primary}10` }]}
                    >
                        <Ionicons
                            name={memo.tag === 'private' ? 'home-outline' : 'briefcase-outline'}
                            size={20}
                            color={memo.tag === 'private' ? colors.accent : colors.primary}
                        />
                    </TouchableOpacity>
                    <ToolTip visible={tagTooltip.visible} message={tagTooltip.message} />
                </View>

                <TouchableOpacity
                    onPress={() => isOnline ? setShowColorPicker(!showColorPicker) : Alert.alert('オフライン', 'オフライン時は色を変更できません。')}
                    style={[styles.actionBtn, { backgroundColor: `${colors.text}10`, opacity: isOnline ? 1 : 0.4 }]}
                    disabled={!isOnline}
                >
                    <Ionicons name="color-palette-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={handleDelete}
                    style={[styles.actionBtn, { backgroundColor: `${colors.error}10`, opacity: isOnline ? 1 : 0.4 }]}
                    disabled={!isOnline}
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

            <ScrollView
                style={styles.scrollContent}
                contentContainerStyle={styles.scrollContentContainer}
                keyboardDismissMode="on-drag"
            >
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
                    editable={isOnline}
                    multiline
                />

                {/* Blocks Editor */}
                <View style={styles.editorContainer}>
                    {blocks.map((block, index) => (
                        <View key={block.id} style={styles.blockWrapper}>
                            {block.type === 'text' ? (
                                <View style={styles.textBlockWrapper}>
                                    <TextInput
                                        ref={(ref) => {
                                            if (ref) {
                                                // @ts-ignore: Access native element for height sync
                                                inputRefs.current[block.id] = Platform.OS === 'web' ? (ref as any).setNativeProps ? ref : ref : ref;
                                                // Handle the case where ref is actually the DOM element or has it
                                            }
                                        }}
                                        style={[
                                            styles.contentInput,
                                            {
                                                color: colorScheme === 'dark' ? '#D1D5DB' : '#374151',
                                                ...(Platform.OS === 'web' ? ({
                                                    outlineWidth: 0,
                                                    outlineStyle: 'none',
                                                    boxShadow: 'none',
                                                    borderWidth: 0,
                                                } as any) : {}),
                                            }
                                        ]}
                                        placeholder={index === 0 ? "メモを入力..." : ""}
                                        placeholderTextColor={colorScheme === 'dark' ? '#6B7280' : '#9CA3AF'}
                                        value={block.content}
                                        onChangeText={(text) => handleUpdateBlock(block.id, text)}
                                        onFocus={() => setActiveBlockId(block.id)}
                                        onSelectionChange={(e) => {
                                            if (activeBlockId === block.id) {
                                                setSelection(e.nativeEvent.selection);
                                            }
                                        }}
                                        onContentSizeChange={(e) => {
                                            if (Platform.OS === 'web' && inputRefs.current[block.id]) {
                                                const el = inputRefs.current[block.id];
                                                el.style.height = 'auto';
                                                el.style.height = (el.scrollHeight) + 'px';
                                            }
                                        }}
                                        multiline={true}
                                        numberOfLines={1}
                                        {...(Platform.OS === 'web' ? { rows: 1 } : {})}
                                        scrollEnabled={false}
                                        textAlignVertical="top"
                                        blurOnSubmit={false}
                                        selectionColor={colors.primary}
                                        editable={isOnline}
                                    />
                                </View>
                            ) : (
                                <View style={styles.imageBlockContainer}>
                                    <Image source={{ uri: block.content }} style={styles.imageBlock} resizeMode="contain" />
                                    {isOnline && (
                                        <TouchableOpacity
                                            style={styles.deleteBlockBtn}
                                            onPress={() => handleDeleteBlock(block.id)}
                                        >
                                            <Ionicons name="close-circle" size={24} color={colors.error} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </View>
                    ))}
                </View>

                {isOnline && (
                    <TouchableOpacity
                        style={[styles.addImageBtn, { borderColor: colors.primary + '20' }]}
                        onPress={() => handleAddImage()}
                    >
                        <Ionicons name="image-outline" size={20} color={colors.primary} />
                        <Text style={[styles.addImageText, { color: colors.primary }]}>画像を挿入</Text>
                    </TouchableOpacity>
                )}

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
                                    memo.todoType === type && { backgroundColor: `${colors.primary}20`, borderColor: colors.primary },
                                    !isOnline && { opacity: 0.5 }
                                ]}
                                disabled={!isOnline}
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
                            style={[styles.todoDateContainer, !isOnline && { opacity: 0.5 }]}
                            onPress={() => isOnline && setShowDatePicker(true)}
                            disabled={!isOnline}
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
                        {isOnline && (
                            <TouchableOpacity
                                style={[styles.addTriggerBtn, { backgroundColor: `${colors.primary}15` }]}
                                onPress={() => router.push({ pathname: '/trigger/edit', params: { memoId: id } })}
                            >
                                <Ionicons name="add" size={18} color={colors.primary} />
                                <Text style={[styles.addTriggerText, { color: colors.primary }]}>追加</Text>
                            </TouchableOpacity>
                        )}
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
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                                    <Switch
                                        value={trigger.isActive}
                                        onValueChange={() => handleToggleTrigger(trigger)}
                                        trackColor={{ false: `${colors.text}20`, true: colors.primary }}
                                        thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : trigger.isActive ? '#FFFFFF' : '#f4f3f4'}
                                        disabled={!isOnline}
                                    />
                                    {isOnline && (
                                        <Pressable
                                            onPress={(e: GestureResponderEvent) => {
                                                e.stopPropagation();
                                                handleDeleteTrigger(trigger.id);
                                            }}
                                            hitSlop={8}
                                        >
                                            <Ionicons name="close-circle" size={22} color={colors.textTertiary} />
                                        </Pressable>
                                    )}
                                </View>
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
        paddingHorizontal: Spacing.lg,
    },
    scrollContentContainer: {
        paddingBottom: 80, // Adjusted padding
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
        paddingHorizontal: 0,
        paddingTop: 2,
        paddingBottom: 2,
        minHeight: 24,
        textAlignVertical: 'top',
        borderWidth: 0,
        backgroundColor: 'transparent',
    },
    textBlockWrapper: {
        paddingVertical: 0,
        borderWidth: 0,
    },
    editorContainer: {
        marginBottom: 0, // Eliminated margin
    },
    blockWrapper: {
        marginBottom: 0,
    },
    imageBlockContainer: {
        marginVertical: 0, // Eliminated margin
        position: 'relative',
        alignItems: 'center',
    },
    imageBlock: {
        width: '100%',
        aspectRatio: 16 / 9,
        borderRadius: BorderRadius.md,
    },
    deleteBlockBtn: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        borderRadius: 12,
    },
    addImageBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.sm, // Reduced from md
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderStyle: 'dashed',
        gap: Spacing.sm,
        justifyContent: 'center',
        marginBottom: Spacing.md, // Reduced from xl
    },
    addImageText: {
        fontSize: FontSize.sm,
        fontWeight: '600',
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
