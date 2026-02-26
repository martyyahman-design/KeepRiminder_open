import React, { createContext, useContext, useEffect, useCallback, useState } from 'react';
import { useAuth } from './AuthContext';
import { useMemos } from './MemoContext';
import { GoogleDriveService } from '../services/GoogleDriveService';
import * as MemoRepo from '../database/repositories/memoRepository';
import * as TriggerRepo from '../database/repositories/triggerRepository';

interface SyncContextType {
    isSyncing: boolean;
    lastSyncedAt: Date | null;
    syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

const DB_FILE_NAME = 'keepreminder_db.json';

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const { accessToken, user } = useAuth();
    const { memos, refreshMemos } = useMemos();
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

    const pullFromCloud = useCallback(async (token: string) => {
        setIsSyncing(true);
        try {
            const fileId = await GoogleDriveService.findFile(token, DB_FILE_NAME);
            if (fileId) {
                const cloudData = await GoogleDriveService.downloadFile(token, fileId);
                console.log('Cloud data downloaded. Merging...');

                // 1. Get local data
                const localMemos = await MemoRepo.getAllMemos();

                // 2. Merge Memos
                if (cloudData.memos) {
                    for (const cloudMemo of cloudData.memos) {
                        const localMemo = localMemos.find(m => m.id === cloudMemo.id);

                        // Cloud memo is newer or doesn't exist locally
                        if (!localMemo || new Date(cloudMemo.updatedAt) > new Date(localMemo.updatedAt)) {
                            await MemoRepo.upsertMemo(cloudMemo);
                            if (cloudMemo.triggers) {
                                for (const trigger of cloudMemo.triggers) {
                                    await TriggerRepo.upsertTrigger(trigger);
                                }
                            }
                        }
                    }
                }

                setLastSyncedAt(new Date());
                await refreshMemos();
            }
        } catch (error) {
            console.error('Failed to pull from cloud:', error);
        } finally {
            setIsSyncing(false);
        }
    }, [refreshMemos]);

    const pushToCloud = useCallback(async (token: string) => {
        setIsSyncing(true);
        try {
            const fileId = await GoogleDriveService.findFile(token, DB_FILE_NAME);
            const dataToUpload = {
                memos: memos, // MemoWithTriggers include triggers
                version: 1,
                updatedAt: new Date().toISOString()
            };
            await GoogleDriveService.uploadFile(token, DB_FILE_NAME, dataToUpload, fileId || undefined);
            setLastSyncedAt(new Date());
        } catch (error) {
            console.error('Failed to push to cloud:', error);
        } finally {
            setIsSyncing(false);
        }
    }, [memos]);

    useEffect(() => {
        if (accessToken) {
            pullFromCloud(accessToken);
        }
    }, [accessToken, pullFromCloud]);

    // Auto-save: push to cloud when memos change (with debounce)
    useEffect(() => {
        if (!accessToken || isSyncing) return;

        const timer = setTimeout(() => {
            pushToCloud(accessToken);
        }, 5000); // 5 seconds debounce

        return () => clearTimeout(timer);
    }, [memos, accessToken]);

    return (
        <SyncContext.Provider value={{
            isSyncing, lastSyncedAt, syncNow: async () => {
                if (accessToken) await pushToCloud(accessToken);
            }
        }}>
            {children}
        </SyncContext.Provider>
    );
}

export function useSync() {
    const context = useContext(SyncContext);
    if (!context) {
        throw new Error('useSync must be used within a SyncProvider');
    }
    return context;
}
