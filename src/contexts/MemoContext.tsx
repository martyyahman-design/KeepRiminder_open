import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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
        try {
            const [active, deleted] = await Promise.all([
                loadMemosWithTriggers(false),
                loadMemosWithTriggers(true)
            ]);
            setMemos(active);
            setDeletedMemos(deleted);
        } catch (err) {
            console.error('Error loading memos:', err);
        } finally {
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
        await MemoRepo.deleteMemo(id);
        const memoToDelete = memos.find(m => m.id === id);
        if (memoToDelete) {
            const deletedAt = new Date().toISOString();
            setMemos(prev => prev.filter(m => m.id !== id));
            setDeletedMemos(prev => [{ ...memoToDelete, deletedAt }, ...prev]);
        } else {
            await refreshMemos();
        }
    }, [memos, refreshMemos]);

    const restoreMemoHandler = useCallback(async (id: string) => {
        await MemoRepo.restoreMemo(id);
        const memoToRestore = deletedMemos.find(m => m.id === id);
        if (memoToRestore) {
            setDeletedMemos(prev => prev.filter(m => m.id !== id));
            setMemos(prev => [{ ...memoToRestore, deletedAt: null }, ...prev].sort((a, b) => {
                if (a.isPinned !== b.isPinned) return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            }));
        } else {
            await refreshMemos();
        }
    }, [deletedMemos, refreshMemos]);

    const permanentlyDeleteMemoHandler = useCallback(async (id: string) => {
        await MemoRepo.permanentlyDeleteMemo(id);
        setDeletedMemos(prev => prev.filter(m => m.id !== id));
    }, []);

    const emptyTrashHandler = useCallback(async () => {
        await MemoRepo.emptyTrash();
        setDeletedMemos([]);
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
