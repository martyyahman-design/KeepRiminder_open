import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { Platform } from 'react-native';
import { Memo, MemoWithTriggers, Trigger } from '../types/models';
import * as MemoRepo from '../database/repositories/memoRepository';
import * as TriggerRepo from '../database/repositories/triggerRepository';
import { getDatabase } from '../database/db';
import { useAuth } from './AuthContext';

interface MemoContextType {
    memos: MemoWithTriggers[];
    deletedMemos: MemoWithTriggers[];
    loading: boolean;
    refreshMemos: () => Promise<void>;
    createMemo: (title?: string, content?: string) => Promise<Memo>;
    updateMemo: (id: string, updates: Partial<Memo>) => Promise<void>;
    deleteMemo: (id: string) => Promise<void>;
    restoreMemo: (id: string) => Promise<void>;
    permanentlyDeleteMemo: (id: string) => Promise<void>;
    emptyTrash: () => Promise<void>;
    searchMemos: (query: string) => Promise<MemoWithTriggers[]>;
    createTrigger: (params: TriggerRepo.CreateTriggerParams) => Promise<Trigger>;
    updateTrigger: (id: string, updates: Partial<Pick<Trigger, 'isActive' | 'scheduledAt' | 'durationSeconds' | 'latitude' | 'longitude' | 'radius' | 'locationName' | 'actionType'>>) => Promise<void>;
    deleteTrigger: (id: string) => Promise<void>;
}

const MemoContext = createContext<MemoContextType | undefined>(undefined);

export function MemoProvider({ children }: { children: ReactNode }) {
    const [memos, setMemos] = useState<MemoWithTriggers[]>([]);
    const [deletedMemos, setDeletedMemos] = useState<MemoWithTriggers[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const isRefreshingRef = useRef(false);

    const loadMemosWithTriggers = useCallback(async (isDeleted: boolean = false): Promise<MemoWithTriggers[]> => {
        const fetchMemos = isDeleted ? MemoRepo.getDeletedMemos : MemoRepo.getAllMemos;
        const allMemos = await fetchMemos();
        const withTriggers: MemoWithTriggers[] = await Promise.all(
            allMemos.map(async (memo) => {
                const triggers = await TriggerRepo.getTriggersByMemoId(memo.id);
                return { ...memo, triggers };
            })
        );
        return withTriggers;
    }, []);

    const refreshMemos = useCallback(async () => {
        if (isRefreshingRef.current) return;
        isRefreshingRef.current = true;
        try {
            console.log('MemoContext: refreshMemos starting');
            const active = await loadMemosWithTriggers(false);
            const deleted = await loadMemosWithTriggers(true);
            setMemos(active);
            setDeletedMemos(deleted);
            console.log('MemoContext: refreshMemos finished');
        } catch (err) {
            console.error('Error loading memos:', err);
        } finally {
            isRefreshingRef.current = false;
            setLoading(false);
        }
    }, [loadMemosWithTriggers]);

    useEffect(() => {
        // Initialize DB and load memos
        (async () => {
            try {
                await getDatabase();
                await refreshMemos();
            } catch (err) {
                console.error('Error initializing database:', err);
                setLoading(false);
            }
        })();
    }, [refreshMemos]);

    // Reset state when user logs out
    useEffect(() => {
        if (!user && !loading) {
            setMemos([]);
            setDeletedMemos([]);
        }
    }, [user]);

    const createMemoHandler = useCallback(async (title?: string, content?: string) => {
        const memo = await MemoRepo.createMemo(title || '', content || '');
        await refreshMemos();
        return memo;
    }, [refreshMemos]);

    const updateMemoHandler = useCallback(async (id: string, updates: Partial<Memo>) => {
        await MemoRepo.updateMemo(id, updates);
        setMemos(prev => prev.map(m => m.id === id ? { ...m, ...updates, updatedAt: new Date().toISOString() } : m));
    }, []);

    const deleteMemoHandler = useCallback(async (id: string) => {
        if (Platform.OS === 'web') console.log('MemoContext: deleteMemo starting', id);
        try {
            await MemoRepo.deleteMemo(id);
            const now = new Date().toISOString();

            setMemos(prev => {
                const memoToDelete = prev.find(m => m.id === id);
                if (memoToDelete) {
                    const updatedMemo = { ...memoToDelete, deletedAt: now, updatedAt: now };
                    setDeletedMemos(prevDeleted => [updatedMemo, ...prevDeleted]);
                    return prev.filter(m => m.id !== id);
                }
                return prev;
            });
            if (Platform.OS === 'web') alert('削除しました');
        } catch (err) {
            console.error('Error deleting memo:', err);
            if (Platform.OS === 'web') alert('削除中にエラー: ' + err);
            await refreshMemos();
        }
    }, [refreshMemos]);

    const restoreMemoHandler = useCallback(async (id: string) => {
        if (Platform.OS === 'web') console.log('MemoContext: restoreMemo starting', id);
        try {
            await MemoRepo.restoreMemo(id);
            const now = new Date().toISOString();
            const memoToRestore = deletedMemos.find(m => m.id === id);
            if (memoToRestore) {
                setDeletedMemos(prev => prev.filter(m => m.id !== id));
                setMemos(prev => [{ ...memoToRestore, deletedAt: null, updatedAt: now }, ...prev].sort((a, b) => {
                    if (a.isPinned !== b.isPinned) return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
                    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                }));
            } else {
                await refreshMemos();
            }
            if (Platform.OS === 'web') alert('復元しました');
        } catch (err) {
            console.error('Error restoring memo:', err);
            if (Platform.OS === 'web') alert('復元中にエラー: ' + err);
            await refreshMemos();
        }
    }, [deletedMemos, refreshMemos]);

    const permanentlyDeleteMemoHandler = useCallback(async (id: string) => {
        if (Platform.OS === 'web') console.log('MemoContext: permanentlyDeleteMemo starting', id);
        try {
            await MemoRepo.permanentlyDeleteMemo(id);
            setDeletedMemos(prev => prev.filter(m => m.id !== id));
            if (Platform.OS === 'web') alert('完全に削除しました');
        } catch (err) {
            console.error('Error permanently deleting memo:', err);
            if (Platform.OS === 'web') alert('完全削除中にエラー: ' + err);
        }
    }, []);

    const emptyTrashHandler = useCallback(async () => {
        if (Platform.OS === 'web') console.log('MemoContext: emptyTrash starting');
        try {
            await MemoRepo.emptyTrash();
            setDeletedMemos([]);
            if (Platform.OS === 'web') alert('ごみ箱を空にしました');
        } catch (err) {
            console.error('Error emptying trash:', err);
            if (Platform.OS === 'web') alert('ごみ箱を空にする際にエラー: ' + err);
        }
    }, []);

    const searchMemosHandler = useCallback(async (query: string): Promise<MemoWithTriggers[]> => {
        if (!query.trim()) {
            return memos;
        }
        const results = await MemoRepo.searchMemos(query);
        const withTriggers: MemoWithTriggers[] = await Promise.all(
            results.map(async (memo) => {
                const triggers = await TriggerRepo.getTriggersByMemoId(memo.id);
                return { ...memo, triggers };
            })
        );
        return withTriggers;
    }, [memos]);

    const createTriggerHandler = useCallback(async (params: TriggerRepo.CreateTriggerParams) => {
        const trigger = await TriggerRepo.createTrigger(params);
        await refreshMemos();
        return trigger;
    }, [refreshMemos]);

    const updateTriggerHandler = useCallback(async (id: string, updates: any) => {
        await TriggerRepo.updateTrigger(id, updates);
        const now = new Date().toISOString();
        setMemos(prev => prev.map(memo => ({
            ...memo,
            triggers: memo.triggers.map(t => t.id === id ? { ...t, ...updates, updatedAt: now } : t)
        })));
        setDeletedMemos(prev => prev.map(memo => ({
            ...memo,
            triggers: memo.triggers.map(t => t.id === id ? { ...t, ...updates, updatedAt: now } : t)
        })));
    }, []);

    const deleteTriggerHandler = useCallback(async (id: string) => {
        await TriggerRepo.deleteTrigger(id);
        setMemos(prev => prev.map(memo => ({
            ...memo,
            triggers: memo.triggers.filter(t => t.id !== id)
        })));
        setDeletedMemos(prev => prev.map(memo => ({
            ...memo,
            triggers: memo.triggers.filter(t => t.id !== id)
        })));
    }, []);

    return (
        <MemoContext.Provider
            value={{
                memos,
                deletedMemos,
                loading,
                refreshMemos,
                createMemo: createMemoHandler,
                updateMemo: updateMemoHandler,
                deleteMemo: deleteMemoHandler,
                restoreMemo: restoreMemoHandler,
                permanentlyDeleteMemo: permanentlyDeleteMemoHandler,
                emptyTrash: emptyTrashHandler,
                searchMemos: searchMemosHandler,
                createTrigger: createTriggerHandler,
                updateTrigger: updateTriggerHandler,
                deleteTrigger: deleteTriggerHandler,
            }}
        >
            {children}
        </MemoContext.Provider>
    );
}

export function useMemos(): MemoContextType {
    const context = useContext(MemoContext);
    if (!context) {
        throw new Error('useMemos must be used within a MemoProvider');
    }
    return context;
}
