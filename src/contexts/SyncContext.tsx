import React, { createContext, useContext, useEffect, useCallback, useState, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { useMemos } from './MemoContext';
import { GoogleDriveService } from '../services/GoogleDriveService';
import { TombstoneService } from '../services/TombstoneService';
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
    const [isStateLoaded, setIsStateLoaded] = useState(false);

    const lastSyncedAtRef = useRef<Date | null>(null);
    const lastSyncedCloudUpdatedAtRef = useRef<string | null>(null);
    const isSyncingRef = useRef(false);
    const isInitialSyncDoneRef = useRef(false);

    // Persistence: Load sync state on mount
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
            } finally {
                setIsStateLoaded(true);
            }
        };
        loadSyncState();
    }, []);

    const performSync = useCallback(async (mode: 'pull' | 'push' = 'pull') => {
        if (!isStateLoaded) {
            console.log(`SyncContext: performSync(${mode}) deferred - state not loaded yet.`);
            return;
        }

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

                    // MERGE TOMBSTONES
                    const cloudTombstones: Record<string, string> = cloudData.tombstones || {};
                    await TombstoneService.mergeTombstones(cloudTombstones);
                    const currentTombstones = await TombstoneService.getTombstones();

                    console.log(`SyncContext: Cloud changed (Cloud: ${cloudFileUpdatedAtStr}, Last: ${lastSyncedCloudUpdatedAtRef.current}). Merging...`);

                    let hasLocalChanges = false;

                    // A. Process Cloud Memos
                    for (const cloudMemo of cloudData.memos) {
                        const localMemo = allLocalMemos.find(m => m.id === cloudMemo.id);
                        const cloudUpdated = new Date(cloudMemo.updatedAt).getTime();
                        const localUpdated = localMemo ? new Date(localMemo.updatedAt).getTime() : 0;
                        const tombstoneAt = currentTombstones[cloudMemo.id];

                        // TOMBSTONE GUARD: Skip if this memo is marked as deleted newer than cloud version
                        if (tombstoneAt && new Date(tombstoneAt).getTime() >= cloudUpdated) {
                            console.log(`SyncContext: Skipping cloud memo ${cloudMemo.id} - tombstone exists (${tombstoneAt})`);
                            continue;
                        }

                        if (!localMemo) {
                            // Only download if it's truly new or newer than our last sync (resurrection prevention)
                            if (cloudUpdated > lastSyncTime) {
                                console.log(`SyncContext: New memo ${cloudMemo.id} from cloud.`);
                                await MemoRepo.upsertMemo(cloudMemo);
                                if (cloudMemo.triggers) {
                                    for (const t of cloudMemo.triggers) await TriggerRepo.upsertTrigger(t);
                                }
                                hasLocalChanges = true;
                            } else {
                                console.log(`SyncContext: Skipping cloud memo ${cloudMemo.id} (cloud updatedAt ${cloudMemo.updatedAt} is older than last sync). Likely deleted locally.`);
                            }
                        } else if (cloudUpdated > localUpdated) {
                            console.log(`SyncContext: Updating existing local memo ${cloudMemo.id} from cloud.`);
                            await MemoRepo.upsertMemo(cloudMemo);
                            if (cloudMemo.triggers) {
                                for (const t of cloudMemo.triggers) await TriggerRepo.upsertTrigger(t);
                            }
                            hasLocalChanges = true;
                        }
                    }

                    // B. Process Tombstones against Local
                    for (const [id, deletedAt] of Object.entries(currentTombstones)) {
                        const local = allLocalMemos.find(m => m.id === id);
                        if (local && new Date(deletedAt).getTime() > new Date(local.updatedAt).getTime()) {
                            console.log(`SyncContext: Deleting local ${id} - match found in tombstones (${deletedAt})`);
                            await MemoRepo.permanentlyDeleteMemo(id);
                            hasLocalChanges = true;
                        }
                    }

                    // C. Legacy Sync-Delete (Clean up items missing from cloud AND tombstone list)
                    if (mode === 'pull') {
                        for (const local of allLocalMemos) {
                            const existsInCloud = cloudData.memos.some((m: any) => m.id === local.id);
                            const inTombstones = !!currentTombstones[local.id];
                            if (!existsInCloud && !inTombstones) {
                                // If it's old and missing from both cloud memos and cloud tombstones, 
                                // it means the tombstone expired or it was never there.
                                if (new Date(local.updatedAt).getTime() <= lastSyncTime) {
                                    console.log(`SyncContext: Legacy cleaning local memo ${local.id}.`);
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
                    // Cleanup old tombstones
                    await TombstoneService.cleanupTombstones();
                    const currentTombstones = await TombstoneService.getTombstones();

                    const finalMemos = await MemoRepo.getAllMemos();
                    const finalDeleted = await MemoRepo.getDeletedMemos();

                    // Clock Drift Compensation: 
                    const cloudTime = new Date(cloudFileUpdatedAtStr).getTime();
                    const localNow = Date.now();
                    const correctedTime = Math.max(localNow, cloudTime + 1);
                    const correctedIso = new Date(correctedTime).toISOString();

                    const dataToUpload = {
                        version: 2,
                        memos: [...finalMemos, ...finalDeleted],
                        tombstones: currentTombstones,
                        updatedAt: correctedIso
                    };

                    console.log(`SyncContext: Pushing data to cloud... (Memos: ${dataToUpload.memos.length}, Tombstones: ${Object.keys(dataToUpload.tombstones).length})`);
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
                const currentTombstones = await TombstoneService.getTombstones();
                const dataToUpload = {
                    version: 2,
                    memos: [...localMemos, ...localDeleted],
                    tombstones: currentTombstones,
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
    }, [accessToken, getFreshToken, clearAccessToken, refreshMemos, isStateLoaded]);

    // Initial Sync
    useEffect(() => {
        if (!isStateLoaded) return;
        if (accessToken && !isInitialSyncDoneRef.current) {
            console.log('SyncContext: Initial sync (first pull) triggered.');
            performSync('pull');
        }
    }, [accessToken, performSync, isStateLoaded]);

    useEffect(() => {
        // Only trigger auto-save if accessToken is available and initial sync is done
        if (!accessToken || !isInitialSyncDoneRef.current || !isStateLoaded) return;

        console.log(`SyncContext: State changed, scheduling auto-save push in 2s...`);
        const timer = setTimeout(() => {
            console.log('SyncContext: Debounced auto-save push executing.');
            performSync('push');
        }, 2000); // 2 seconds debounce

        return () => clearTimeout(timer);
    }, [memos, deletedMemos, accessToken, performSync, isStateLoaded]);

    // Background Polling
    useEffect(() => {
        if (!accessToken || !isStateLoaded) return;

        console.log('SyncContext: Starting background polling interval.');
        const interval = setInterval(() => {
            performSync('pull');
        }, 60000); // 60 seconds

        return () => clearInterval(interval);
    }, [accessToken, performSync, isStateLoaded]);

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
