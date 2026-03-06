import React, { createContext, useContext, useEffect, useCallback, useState, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { useMemos } from './MemoContext';
import { GoogleDriveService } from '../services/GoogleDriveService';
import * as MemoRepo from '../database/repositories/memoRepository';
import * as TriggerRepo from '../database/repositories/triggerRepository';

interface SyncContextType {
    isSyncing: boolean;
    lastSyncedAt: Date | null;
    isInitialSyncDone: boolean;
    performSync: (mode?: 'pull' | 'push') => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

const DB_FILE_NAME = 'keepreminder_backup.json';

export function SyncProvider({ children }: { children: ReactNode }) {
    const { accessToken, getFreshToken } = useAuth();
    const { memos, deletedMemos, refreshMemos } = useMemos();
    const [isSyncing, setIsSyncing] = useState(false);
    const [isInitialSyncDone, setIsInitialSyncDone] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
    const isSyncingRef = useRef(false);
    const isInitialSyncDoneRef = useRef(false);

    const performSync = useCallback(async (mode: 'pull' | 'push' = 'pull') => {
        if (isSyncingRef.current) {
            console.log(`SyncContext: performSync(${mode}) skipped, already syncing.`);
            return;
        }

        // Get fresh token if on native
        let tokenToUse = accessToken;
        if (Platform.OS !== 'web') {
            tokenToUse = await getFreshToken();
        }

        if (!tokenToUse) {
            console.log(`SyncContext: performSync(${mode}) aborted, no access token.`);
            return;
        }

        // IMPORTANT: Prevent PUSH if the first PULL (initial sync) hasn't completed yet.
        // This avoids overwriting cloud data with empty local data on fresh login.
        if (mode === 'push' && !isInitialSyncDoneRef.current) {
            console.log(`SyncContext: performSync(push) blocked until initial pull is done.`);
            return;
        }

        isSyncingRef.current = true;
        setIsSyncing(true);

        console.log(`SyncContext: performSync(${mode}) started. isInitialSyncDone: ${isInitialSyncDoneRef.current}`);
        try {
            const fileId = await GoogleDriveService.findFile(tokenToUse, DB_FILE_NAME);

            // 1. ALWAYS PULL AND MERGE if file exists
            if (fileId) {
                const cloudData = await GoogleDriveService.downloadFile(tokenToUse, fileId);
                const localMemos = await MemoRepo.getAllMemos();
                const localDeletedMemos = await MemoRepo.getDeletedMemos();
                const allLocalMemos = [...localMemos, ...localDeletedMemos];

                console.log(`SyncContext: Cloud memos: ${cloudData.memos?.length || 0}, Local memos: ${allLocalMemos.length}`);

                let hasLocalChanges = false;

                // Merge Logic: Conflict resolution (Last Write Wins)
                if (cloudData.memos) {
                    // DANGEROUS LOGIC REMOVED: 
                    // No longer delete local memos if missing from cloud. 
                    // New local memos will just be uploaded later.

                    for (const cloudMemo of cloudData.memos) {
                        const localMemo = allLocalMemos.find(m => m.id === cloudMemo.id);

                        // Decide whether to update local based onUpdatedAt
                        const cloudUpdated = new Date(cloudMemo.updatedAt).getTime();
                        const localUpdated = localMemo ? new Date(localMemo.updatedAt).getTime() : 0;

                        if (!localMemo || cloudUpdated > localUpdated) {
                            console.log(`SyncContext: Updating local memo ${cloudMemo.id} from cloud (Cloud: ${cloudMemo.updatedAt}, Local: ${localMemo?.updatedAt || 'NEW'}).`);
                            await MemoRepo.upsertMemo(cloudMemo);
                            if (cloudMemo.triggers) {
                                for (const t of cloudMemo.triggers) await TriggerRepo.upsertTrigger(t);
                            }
                            hasLocalChanges = true;
                        }
                    }
                }

                if (hasLocalChanges) {
                    console.log('SyncContext: Local changes applied after pull. Refreshing memos.');
                    await refreshMemos();
                }

                // 2. If we intended to push, or if we have something new to share, push back
                if (mode === 'push') {
                    // Re-fetch everything after possible merge
                    const finalMemos = await MemoRepo.getAllMemos();
                    const finalDeleted = await MemoRepo.getDeletedMemos();
                    const dataToUpload = {
                        memos: [...finalMemos, ...finalDeleted],
                        version: 1,
                        updatedAt: new Date().toISOString()
                    };
                    console.log(`SyncContext: Pushing data to cloud... (Memos: ${dataToUpload.memos.length})`);
                    await GoogleDriveService.uploadFile(tokenToUse, DB_FILE_NAME, dataToUpload, fileId);
                    console.log('SyncContext: Pushed merged data back to cloud.');
                } else if (mode === 'pull') {
                    // 3. DETECT DELETIONS (Sync-Delete)
                    // If cloud is newer than our last sync, any local memo NOT in cloud was likely deleted elsewhere
                    const cloudFileUpdatedAt = new Date(cloudData.updatedAt || 0).getTime();
                    const localLastSyncTime = lastSyncedAt ? lastSyncedAt.getTime() : 0;

                    if (cloudFileUpdatedAt > localLastSyncTime) {
                        const localMemos = await MemoRepo.getAllMemos();
                        const localDeleted = await MemoRepo.getDeletedMemos();
                        const allLocal = [...localMemos, ...localDeleted];

                        for (const local of allLocal) {
                            const existsInCloud = cloudData.memos?.some((m: any) => m.id === local.id);
                            if (!existsInCloud) {
                                // Double check: only delete if local hasn't been updated since last sync
                                if (new Date(local.updatedAt).getTime() <= localLastSyncTime) {
                                    console.log(`SyncContext: Deleting local memo ${local.id} because it's missing from newer cloud backup.`);
                                    await MemoRepo.permanentlyDeleteMemo(local.id);
                                    hasLocalChanges = true;
                                }
                            }
                        }
                    }
                    
                    if (hasLocalChanges) {
                        console.log('SyncContext: Local changes (including deletions) applied after pull. Refreshing.');
                        await refreshMemos();
                    }
                }
            } else if (mode === 'push') {
                // Initial creation in cloud
                const localMemos = await MemoRepo.getAllMemos();
                const localDeleted = await MemoRepo.getDeletedMemos();
                const dataToUpload = {
                    memos: [...localMemos, ...localDeleted],
                    version: 1,
                    updatedAt: new Date().toISOString()
                };
                await GoogleDriveService.uploadFile(tokenToUse, DB_FILE_NAME, dataToUpload);
                console.log('SyncContext: Created initial DB file in cloud.');
            } else {
                console.log('SyncContext: No DB file found in cloud. Marking initial sync as done with empty cloud.');
            }

            setLastSyncedAt(new Date());
            if (!isInitialSyncDoneRef.current) {
                isInitialSyncDoneRef.current = true;
                setIsInitialSyncDone(true);
            }
        } catch (error) {
            console.error('SyncContext: Sync error:', error);
        } finally {
            isSyncingRef.current = false;
            setIsSyncing(false);
            console.log(`SyncContext: performSync(${mode}) finished.`);
        }
    }, [accessToken, getFreshToken, refreshMemos]);

    // Initial Sync
    useEffect(() => {
        if (accessToken && !isInitialSyncDoneRef.current) {
            console.log('SyncContext: Initial sync (first pull) triggered.');
            performSync('pull');
        } else if (!accessToken && !isInitialSyncDoneRef.current) {
            // Not logged in yet, don't block work but don't mark as "sync done" in a way that allows push later
            // Actually, if we're not logged in, we don't push anyway (accessToken guard in useEffect below)
        }
    }, [accessToken, performSync]);

    // Auto-save (Push) when memos change
    useEffect(() => {
        // Only trigger auto-save if accessToken is available and initial sync is done
        if (!accessToken || !isInitialSyncDoneRef.current) return;

        console.log(`SyncContext: Memos changed (${memos.length}), scheduling auto-save push in 5s...`);
        const timer = setTimeout(() => {
            console.log('SyncContext: Debounced auto-save push executing.');
            performSync('push');
        }, 5000); // 5 seconds debounce

        return () => clearTimeout(timer);
    }, [memos, deletedMemos, accessToken, performSync]);

    // Background Polling
    useEffect(() => {
        if (!accessToken) return;

        console.log('SyncContext: Starting background polling interval.');
        const interval = setInterval(() => {
            performSync('pull');
        }, 60000); // 60 seconds

        return () => clearInterval(interval);
    }, [accessToken, performSync]);

    return (
        <SyncContext.Provider value={{
            isSyncing,
            lastSyncedAt,
            isInitialSyncDone,
            performSync
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
