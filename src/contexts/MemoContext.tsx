import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Memo, MemoWithTriggers, Trigger } from '../types/models';
import * as MemoRepo from '../database/repositories/memoRepository';
import * as TriggerRepo from '../database/repositories/triggerRepository';
import { getDatabase } from '../database/db';

interface MemoContextType {
    memos: MemoWithTriggers[];
    loading: boolean;
    refreshMemos: () => Promise<void>;
    createMemo: (title?: string, content?: string) => Promise<Memo>;
    updateMemo: (id: string, updates: Partial<Memo>) => Promise<void>;
    deleteMemo: (id: string) => Promise<void>;
    searchMemos: (query: string) => Promise<MemoWithTriggers[]>;
    createTrigger: (params: TriggerRepo.CreateTriggerParams) => Promise<Trigger>;
    updateTrigger: (id: string, updates: Partial<Pick<Trigger, 'isActive' | 'scheduledAt' | 'durationSeconds' | 'latitude' | 'longitude' | 'radius' | 'locationName' | 'actionType'>>) => Promise<void>;
    deleteTrigger: (id: string) => Promise<void>;
}

const MemoContext = createContext<MemoContextType | undefined>(undefined);

export function MemoProvider({ children }: { children: ReactNode }) {
    const [memos, setMemos] = useState<MemoWithTriggers[]>([]);
    const [loading, setLoading] = useState(true);

    const loadMemosWithTriggers = useCallback(async (): Promise<MemoWithTriggers[]> => {
        const allMemos = await MemoRepo.getAllMemos();
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
            const result = await loadMemosWithTriggers();
            setMemos(result);
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

    const createMemoHandler = useCallback(async (title?: string, content?: string) => {
        const memo = await MemoRepo.createMemo(title || '', content || '');
        await refreshMemos();
        return memo;
    }, [refreshMemos]);

    const updateMemoHandler = useCallback(async (id: string, updates: Partial<Memo>) => {
        await MemoRepo.updateMemo(id, updates);
        await refreshMemos();
    }, [refreshMemos]);

    const deleteMemoHandler = useCallback(async (id: string) => {
        await MemoRepo.deleteMemo(id);
        await refreshMemos();
    }, [refreshMemos]);

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
        await refreshMemos();
    }, [refreshMemos]);

    const deleteTriggerHandler = useCallback(async (id: string) => {
        await TriggerRepo.deleteTrigger(id);
        await refreshMemos();
    }, [refreshMemos]);

    return (
        <MemoContext.Provider
            value={{
                memos,
                loading,
                refreshMemos,
                createMemo: createMemoHandler,
                updateMemo: updateMemoHandler,
                deleteMemo: deleteMemoHandler,
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
