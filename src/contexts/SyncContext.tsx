import React, { createContext, useContext, useEffect, useCallback, useState } from 'react';
import { useAuth } from './AuthContext';
import { useMemos } from './MemoContext';
import { GoogleDriveService } from '../services/GoogleDriveService';
import * as MemoRepo from '../database/repositories/memoRepository';
import * as TriggerRepo from '../database/repositories/triggerRepository';

interface SyncContextType {
    isSyncing: boolean;
    isInitialSyncDone: boolean;
    lastSyncedAt: Date | null;
    syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

const DB_FILE_NAME = 'keepreminder_db.json';

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const { accessToken, user } = useAuth();
    const { memos, refreshMemos } = useMemos();
    const [isSyncing, setIsSyncing] = useState(false);
    const [isInitialSyncDone, setIsInitialSyncDone] = useState(false);
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
                const localDeletedMemos = await MemoRepo.getDeletedMemos();
                const allLocalMemos = [...localMemos, ...localDeletedMemos];

                // 2. Merge Memos (Last Write Wins)
                if (cloudData.memos) {
                    let hasChanges = false;
                    for (const cloudMemo of cloudData.memos) {
                        const localMemo = allLocalMemos.find(m => m.id === cloudMemo.id);

                        // Cloud memo is newer or doesn't exist locally
                        if (!localMemo || new Date(cloudMemo.updatedAt).getTime() > new Date(localMemo.updatedAt).getTime()) {
                            await MemoRepo.upsertMemo(cloudMemo);
                            if (cloudMemo.triggers) {
                                for (const trigger of cloudMemo.triggers) {
                                    await TriggerRepo.upsertTrigger(trigger);
                                }
                            }
                            hasChanges = true;
                        }
                    }
                    if (hasChanges) {
                        await refreshMemos();
                    }
                }

                setLastSyncedAt(new Date());
            }
        } catch (error) {
            console.error('Failed to pull from cloud:', error);
        } finally {
            setIsSyncing(false);
            setIsInitialSyncDone(true);
        }
    }, [refreshMemos]);

    const pushToCloud = useCallback(async (token: string) => {
        setIsSyncing(true);
        try {
            // Get the very latest data from DB before pushing
            const localMemos = await MemoRepo.getAllMemos();
            const localDeletedMemos = await MemoRepo.getDeletedMemos();
            const allLocalMemos = [...localMemos, ...localDeletedMemos];

            const fileId = await GoogleDriveService.findFile(token, DB_FILE_NAME);
            const dataToUpload = {
                memos: allLocalMemos,
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
    }, []);

    useEffect(() => {
        if (accessToken) {
            pullFromCloud(accessToken);
        } else {
            setIsInitialSyncDone(true); // No token, so initial "sync" (or wait for one) is technically done
        }
    }, [accessToken, pullFromCloud]);

    // Auto-save: push to cloud when memos change (with debounce)
    useEffect(() => {
        if (!accessToken || isSyncing || !isInitialSyncDone) return;

        const timer = setTimeout(() => {
            pushToCloud(accessToken);
        }, 5000); // 5 seconds debounce

        return () => clearTimeout(timer);
    }, [memos, accessToken, isInitialSyncDone, pushToCloud]);

    return (
        <SyncContext.Provider value={{
            isSyncing,
            isInitialSyncDone,
            lastSyncedAt,
            syncNow: async () => {
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
