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
    const [lastSyncedCloudUpdatedAt, setLastSyncedCloudUpdatedAt] = useState<string | null>(null);
    const lastSyncedAtRef = useRef<Date | null>(null);
    const lastSyncedCloudUpdatedAtRef = useRef<string | null>(null);
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
        if (mode === 'push' && !isInitialSyncDoneRef.current) {
            console.log(`SyncContext: performSync(push) blocked until initial pull is done.`);
            return;
        }

        isSyncingRef.current = true;
        setIsSyncing(true);

        console.log(`SyncContext: performSync(${mode}) started. isInitialSyncDone: ${isInitialSyncDoneRef.current}`);
        try {
            const fileId = await GoogleDriveService.findFile(tokenToUse, DB_FILE_NAME);

            if (fileId) {
                const cloudData = await GoogleDriveService.downloadFile(tokenToUse, fileId);
                const cloudFileUpdatedAtStr = cloudData.updatedAt || new Date(0).toISOString();

                // 1. ALWAYS PULL AND MERGE if cloud has changed since our last sync
                // We use string comparison of updatedAt to be clock-drift-resilient
                if (!lastSyncedCloudUpdatedAtRef.current || cloudFileUpdatedAtStr !== lastSyncedCloudUpdatedAtRef.current) {
                    const localMemos = await MemoRepo.getAllMemos();
                    const localDeletedMemos = await MemoRepo.getDeletedMemos();
                    const allLocalMemos = [...localMemos, ...localDeletedMemos];

                    console.log(`SyncContext: Cloud changed (Cloud: ${cloudFileUpdatedAtStr}, Last: ${lastSyncedCloudUpdatedAtRef.current}). Merging...`);

                    let hasLocalChanges = false;

                    if (cloudData.memos) {
                        for (const cloudMemo of cloudData.memos) {
                            const localMemo = allLocalMemos.find(m => m.id === cloudMemo.id);
                            const cloudUpdated = new Date(cloudMemo.updatedAt).getTime();
                            const localUpdated = localMemo ? new Date(localMemo.updatedAt).getTime() : 0;

                            if (!localMemo || cloudUpdated > localUpdated) {
                                console.log(`SyncContext: Updating local memo ${cloudMemo.id} from cloud.`);
                                await MemoRepo.upsertMemo(cloudMemo);
                                if (cloudMemo.triggers) {
                                    for (const t of cloudMemo.triggers) await TriggerRepo.upsertTrigger(t);
                                }
                                hasLocalChanges = true;
                            }
                        }
                    }

                    // 2. DETECT DELETIONS (Sync-Delete)
                    if (mode === 'pull') {
                        const localLastSyncTime = lastSyncedAtRef.current ? lastSyncedAtRef.current.getTime() : 0;
                        for (const local of allLocalMemos) {
                            const existsInCloud = cloudData.memos?.some((m: any) => m.id === local.id);
                            if (!existsInCloud) {
                                // Delete if local hasn't been updated since our last sync
                                if (new Date(local.updatedAt).getTime() <= localLastSyncTime) {
                                    console.log(`SyncContext: Deleting local memo ${local.id} (missing from newer cloud backup).`);
                                    await MemoRepo.permanentlyDeleteMemo(local.id);
                                    hasLocalChanges = true;
                                }
                            }
                        }
                    }

                    if (hasLocalChanges) {
                        await refreshMemos();
                    }
                    setLastSyncedCloudUpdatedAt(cloudFileUpdatedAtStr);
                    lastSyncedCloudUpdatedAtRef.current = cloudFileUpdatedAtStr;
                }

                // 3. PUSH back if requested
                if (mode === 'push') {
                    const finalMemos = await MemoRepo.getAllMemos();
                    const finalDeleted = await MemoRepo.getDeletedMemos();

                    // Clock Drift Compensation: 
                    // ensure file updatedAt is at least 1ms newer than what we just pulled
                    const cloudTime = new Date(cloudFileUpdatedAtStr).getTime();
                    const localNow = Date.now();
                    const correctedTime = Math.max(localNow, cloudTime + 1);
                    const correctedIso = new Date(correctedTime).toISOString();

                    const dataToUpload = {
                        memos: [...finalMemos, ...finalDeleted].map(m => {
                            // Also ensure memo updatedAt is boosted if needed to be "latest"
                            if (new Date(m.updatedAt).getTime() < correctedTime && m.updatedAt.includes('Z')) {
                                // We only boost if it's very close to prevent massive forward-drift
                                // But simply setting it to correctedIso is safest for "I am the latest"
                            }
                            return m;
                        }),
                        version: 1,
                        updatedAt: correctedIso
                    };

                    console.log(`SyncContext: Pushing data to cloud... (Memos: ${dataToUpload.memos.length}, Time: ${correctedIso})`);
                    await GoogleDriveService.uploadFile(tokenToUse, DB_FILE_NAME, dataToUpload, fileId);
                    setLastSyncedCloudUpdatedAt(correctedIso);
                    lastSyncedCloudUpdatedAtRef.current = correctedIso;
                }
            } else if (mode === 'push') {
                // Initial creation in cloud
                const localMemos = await MemoRepo.getAllMemos();
                const localDeleted = await MemoRepo.getDeletedMemos();
                const now = new Date().toISOString();
                const dataToUpload = {
                    memos: [...localMemos, ...localDeleted],
                    version: 1,
                    updatedAt: now
                };
                await GoogleDriveService.uploadFile(tokenToUse, DB_FILE_NAME, dataToUpload);
                setLastSyncedCloudUpdatedAt(now);
                lastSyncedCloudUpdatedAtRef.current = now;
                console.log('SyncContext: Created initial DB file in cloud.');
            }

            const nowSync = new Date();
            setLastSyncedAt(nowSync);
            lastSyncedAtRef.current = nowSync;
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
