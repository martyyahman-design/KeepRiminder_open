import React, { createContext, useContext, useEffect, useCallback, useState, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { useMemos } from './MemoContext';
import { GoogleDriveService } from '../services/GoogleDriveService';
import * as MemoRepo from '../database/repositories/memoRepository';
import * as TriggerRepo from '../database/repositories/triggerRepository';

const LAST_SYNCED_AT_KEY = '@KeepReminder:last_synced_at';
const LAST_CLOUD_UPDATED_AT_KEY = '@KeepReminder:last_cloud_updated_at';

interface SyncContextType {
    isSyncing: boolean;
    lastSyncedAt: Date | null;
    isInitialSyncDone: boolean;
    performSync: (mode?: 'pull' | 'push') => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

const DB_FILE_NAME = 'keepreminder_backup.json';

export function SyncProvider({ children }: { children: ReactNode }) {
    const { accessToken, getFreshToken, clearAccessToken } = useAuth();
    const { memos, deletedMemos, refreshMemos } = useMemos();
    const [isSyncing, setIsSyncing] = useState(false);
    const [isInitialSyncDone, setIsInitialSyncDone] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
    const [lastSyncedCloudUpdatedAt, setLastSyncedCloudUpdatedAt] = useState<string | null>(null);
    const lastSyncedAtRef = useRef<Date | null>(null);
    const lastSyncedCloudUpdatedAtRef = useRef<string | null>(null);
    const isSyncingRef = useRef(false);
    const isInitialSyncDoneRef = useRef(false);

    // Persistence: Load sync state on mount
    useEffect(() => {
        const loadSyncState = async () => {
            try {
                const [storedAt, storedCloud] = await Promise.all([
                    AsyncStorage.getItem(LAST_SYNCED_AT_KEY),
                    AsyncStorage.getItem(LAST_CLOUD_UPDATED_AT_KEY),
                ]);
                if (storedAt) {
                    const date = new Date(storedAt);
                    setLastSyncedAt(date);
                    lastSyncedAtRef.current = date;
                }
                if (storedCloud) {
                    setLastSyncedCloudUpdatedAt(storedCloud);
                    lastSyncedCloudUpdatedAtRef.current = storedCloud;
                }
                console.log('SyncContext: Persistent sync state loaded', { storedAt, storedCloud });
            } catch (e) {
                console.error('SyncContext: Failed to load sync state', e);
            }
        };
        loadSyncState();
    }, []);

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

                // IMPORTANT: If cloudData is empty or malformed, skip merging to prevent data loss
                if (!cloudData || !Array.isArray(cloudData.memos)) {
                    console.error('SyncContext: Downloaded cloud data is invalid/missing memos array. Skipping merge.');
                    throw new Error('Invalid cloud data format');
                }

                const cloudFileUpdatedAtStr = cloudData.updatedAt || new Date(0).toISOString();

                // 1. ALWAYS PULL AND MERGE if cloud has changed since our last sync
                if (!lastSyncedCloudUpdatedAtRef.current || cloudFileUpdatedAtStr !== lastSyncedCloudUpdatedAtRef.current) {
                    const localMemos = await MemoRepo.getAllMemos();
                    const localDeletedMemos = await MemoRepo.getDeletedMemos();
                    const allLocalMemos = [...localMemos, ...localDeletedMemos];
                    const lastSyncTime = lastSyncedAtRef.current ? lastSyncedAtRef.current.getTime() : 0;

                    console.log(`SyncContext: Cloud changed (Cloud: ${cloudFileUpdatedAtStr}, Last: ${lastSyncedCloudUpdatedAtRef.current}). Merging...`);

                    let hasLocalChanges = false;

                    for (const cloudMemo of cloudData.memos) {
                        const localMemo = allLocalMemos.find(m => m.id === cloudMemo.id);
                        const cloudUpdated = new Date(cloudMemo.updatedAt).getTime();
                        const localUpdated = localMemo ? new Date(localMemo.updatedAt).getTime() : 0;

                        // RESURRECTION PREVENTION: 
                        // If memo is missing locally, only re-download it if its cloud updatedAt is newer than our LAST sync.
                        // If it's OLDER than our last sync, it means we probably deleted it locally since then, 
                        // so we should NOT re-download it.
                        if (!localMemo) {
                            if (cloudUpdated > lastSyncTime) {
                                console.log(`SyncContext: New memo ${cloudMemo.id} from cloud.`);
                                await MemoRepo.upsertMemo(cloudMemo);
                                if (cloudMemo.triggers) {
                                    for (const t of cloudMemo.triggers) await TriggerRepo.upsertTrigger(t);
                                }
                                hasLocalChanges = true;
                            } else {
                                console.log(`SyncContext: Skipping cloud memo ${cloudMemo.id} (cloud updatedAt ${cloudMemo.updatedAt} is older than last sync ${lastSyncedAtRef.current?.toISOString()}). Likely already deleted locally.`);
                            }
                        } else if (cloudUpdated > localUpdated) {
                            // Update existing if cloud is newer
                            console.log(`SyncContext: Updating existing local memo ${cloudMemo.id} from cloud.`);
                            await MemoRepo.upsertMemo(cloudMemo);
                            if (cloudMemo.triggers) {
                                for (const t of cloudMemo.triggers) await TriggerRepo.upsertTrigger(t);
                            }
                            hasLocalChanges = true;
                        }
                    }

                    // 2. DETECT DELETIONS (Sync-Delete)
                    // Only run this if we are intentionally pulling OR doing a push-merge
                    // Safety check: only delete if the cloud data we just got is valid
                    if (mode === 'pull' && Array.isArray(cloudData.memos)) {
                        for (const local of allLocalMemos) {
                            const existsInCloud = cloudData.memos.some((m: any) => m.id === local.id);
                            if (!existsInCloud) {
                                // Delete if local hasn't been updated since our last sync
                                if (new Date(local.updatedAt).getTime() <= lastSyncTime) {
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
                    await AsyncStorage.setItem(LAST_CLOUD_UPDATED_AT_KEY, cloudFileUpdatedAtStr);
                }

                // 3. PUSH back if requested
                if (mode === 'push') {
                    const finalMemos = await MemoRepo.getAllMemos();
                    const finalDeleted = await MemoRepo.getDeletedMemos();

                    // Clock Drift Compensation: 
                    const cloudTime = new Date(cloudFileUpdatedAtStr).getTime();
                    const localNow = Date.now();
                    const correctedTime = Math.max(localNow, cloudTime + 1);
                    const correctedIso = new Date(correctedTime).toISOString();

                    const dataToUpload = {
                        memos: [...finalMemos, ...finalDeleted],
                        version: 1,
                        updatedAt: correctedIso
                    };

                    console.log(`SyncContext: Pushing data to cloud... (Memos: ${dataToUpload.memos.length}, Time: ${correctedIso})`);
                    await GoogleDriveService.uploadFile(tokenToUse, DB_FILE_NAME, dataToUpload, fileId);
                    setLastSyncedCloudUpdatedAt(correctedIso);
                    lastSyncedCloudUpdatedAtRef.current = correctedIso;
                    await AsyncStorage.setItem(LAST_CLOUD_UPDATED_AT_KEY, correctedIso);
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
                await AsyncStorage.setItem(LAST_CLOUD_UPDATED_AT_KEY, now);
                console.log('SyncContext: Created initial DB file in cloud.');
            }

            const nowSync = new Date();
            setLastSyncedAt(nowSync);
            lastSyncedAtRef.current = nowSync;
            await AsyncStorage.setItem(LAST_SYNCED_AT_KEY, nowSync.toISOString());
            if (!isInitialSyncDoneRef.current) {
                isInitialSyncDoneRef.current = true;
                setIsInitialSyncDone(true);
            }
        } catch (error: any) {
            console.error('SyncContext: Sync error:', error);

            // Handle 401 Unauthorized (likely token expired)
            if (error.message?.includes('401') && Platform.OS === 'web') {
                console.log('SyncContext: 401 Error detected on Web. Clearing tokens.');
                clearAccessToken();
            }
        } finally {
            isSyncingRef.current = false;
            setIsSyncing(false);
            console.log(`SyncContext: performSync(${mode}) finished.`);
        }
    }, [accessToken, getFreshToken, clearAccessToken, refreshMemos]);

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

    useEffect(() => {
        // Only trigger auto-save if accessToken is available and initial sync is done
        if (!accessToken || !isInitialSyncDoneRef.current) return;

        console.log(`SyncContext: Memos changed (${memos.length}), scheduling auto-save push in 2s...`);
        const timer = setTimeout(() => {
            console.log('SyncContext: Debounced auto-save push executing.');
            performSync('push');
        }, 2000); // 2 seconds debounce

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
