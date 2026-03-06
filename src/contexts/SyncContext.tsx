import React, { createContext, useContext, useEffect, useCallback, useState, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { useMemos } from './MemoContext';
import { GoogleDriveService } from '../services/GoogleDriveService';
import { TombstoneService } from '../services/TombstoneService';
import { SyncClockService } from '../services/SyncClockService';
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

                // Keep track of the latest cloud time to handle drift
                await SyncClockService.updateMaxSeenCloudTime(cloudFileUpdatedAtStr);

                // 1. ALWAYS PULL AND MERGE if cloud has changed since our last sync
                if (!lastSyncedCloudUpdatedAtRef.current || cloudFileUpdatedAtStr !== lastSyncedCloudUpdatedAtRef.current) {
                    const localMemos = await MemoRepo.getAllMemos();
                    const localDeletedMemos = await MemoRepo.getDeletedMemos();
                    const allLocalMemos = [...localMemos, ...localDeletedMemos];

                    // MERGE TOMBSTONES
                    const cloudTombstones: Record<string, string> = cloudData.tombstones || {};
                    await TombstoneService.mergeTombstones(cloudTombstones);
                    const currentTombstones = await TombstoneService.getTombstones();

                    console.log(`SyncContext: Cloud changed (Cloud: ${cloudFileUpdatedAtStr}, Last Local Sync: ${lastSyncedCloudUpdatedAtRef.current}). Merging...`);

                    let hasLocalChanges = false;

                    // A. Process Cloud Memos
                    for (const cloudMemo of cloudData.memos) {
                        const localMemo = allLocalMemos.find(m => m.id === cloudMemo.id);
                        const cloudUpdated = new Date(cloudMemo.updatedAt).getTime();
                        const localUpdated = localMemo ? new Date(localMemo.updatedAt).getTime() : 0;
                        const tombstoneAt = currentTombstones[cloudMemo.id];

                        // 1. TOMBSTONE GUARD: Skip if this memo is marked as deleted AND tombstone is newer or equal to cloud version
                        if (tombstoneAt && new Date(tombstoneAt).getTime() >= cloudUpdated) {
                            console.log(`SyncContext: [SKIP] Cloud memo ${cloudMemo.id} - tombstone exists and is newer (${tombstoneAt} >= ${cloudMemo.updatedAt})`);
                            continue;
                        }

                        // 2. NEW OR UPDATED?
                        if (!localMemo) {
                            // It's not in local AND not in tombstone (checked above) -> It's a truly new memo from another device
                            console.log(`SyncContext: [CREATE] New memo ${cloudMemo.id} from cloud (Title: ${cloudMemo.title || 'Untitled'}).`);
                            await MemoRepo.upsertMemo(cloudMemo);
                            if (cloudMemo.triggers) {
                                for (const t of cloudMemo.triggers) await TriggerRepo.upsertTrigger(t);
                            }
                            hasLocalChanges = true;
                        } else if (cloudUpdated > localUpdated) {
                            // It exists locally, but cloud is newer
                            console.log(`SyncContext: [UPDATE] Existing local memo ${cloudMemo.id} from cloud (Cloud: ${cloudMemo.updatedAt}, Local: ${localMemo.updatedAt}).`);
                            await MemoRepo.upsertMemo(cloudMemo);
                            if (cloudMemo.triggers) {
                                for (const t of cloudMemo.triggers) await TriggerRepo.upsertTrigger(t);
                            }
                            hasLocalChanges = true;
                        } else {
                            console.log(`SyncContext: [NO-OP] Cloud memo ${cloudMemo.id} is not newer (Cloud: ${cloudMemo.updatedAt}, Local: ${localMemo.updatedAt}).`);
                        }
                    }

                    // B. Process Tombstones against Local
                    for (const [id, deletedAt] of Object.entries(currentTombstones)) {
                        const local = allLocalMemos.find(m => m.id === id);
                        if (local && new Date(deletedAt).getTime() > new Date(local.updatedAt).getTime()) {
                            console.log(`SyncContext: [DELETE] Local ${id} - found in tombstones (${deletedAt} > ${local.updatedAt})`);
                            await MemoRepo.permanentlyDeleteMemo(id);
                            hasLocalChanges = true;
                        }
                    }

                    // C. Cleanup logic (Optional: detect items removed from cloud WITHOUT tombstones - e.g. manual file edit)
                    // If mode is 'pull', we could theoretically clean up things not in cloud AND not in tombstones,
                    // but we must be careful. For now, let's rely strictly on tombstones for explicit deletions.
                    // Legacy cleaning is removed to prevent accidental data loss.

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

                    let finalMemos = await MemoRepo.getAllMemos();
                    let finalDeleted = await MemoRepo.getDeletedMemos();
                    let allFinal = [...finalMemos, ...finalDeleted];
                    let hasTimestampAdjustments = false;

                    // AUTO-BUMP: If local is logically different from cloud BUT timestamp is trailing, fix it
                    for (const m of allFinal) {
                        const cloudM = cloudData.memos.find((cm: any) => cm.id === m.id);
                        if (cloudM) {
                            const cloudUT = new Date(cloudM.updatedAt).getTime();
                            const localUT = new Date(m.updatedAt).getTime();

                            // Check for logical difference (simplified check: title, content, blocks count, deletedAt)
                            const isDifferent = m.title !== cloudM.title ||
                                m.content !== cloudM.content ||
                                m.deletedAt !== cloudM.deletedAt ||
                                (m.blocks?.length !== cloudM.blocks?.length);

                            if (isDifferent && localUT <= cloudUT) {
                                console.log(`SyncContext: [BUMP] Local memo ${m.id} trails cloud (${m.updatedAt} <= ${cloudM.updatedAt}). Up-dating to safe time.`);
                                const safeNow = await SyncClockService.getSafeNow();
                                m.updatedAt = safeNow;
                                if (m.deletedAt) m.deletedAt = safeNow; // If it was a trash move, bump that too
                                await MemoRepo.upsertMemo(m);
                                hasTimestampAdjustments = true;
                            }
                        }
                    }

                    if (hasTimestampAdjustments) {
                        await refreshMemos();
                    }

                    // Clock Drift Compensation for the file itself: 
                    const safeNowForFile = await SyncClockService.getSafeNow();

                    const dataToUpload = {
                        version: 2,
                        memos: [...finalMemos, ...finalDeleted],
                        tombstones: currentTombstones,
                        updatedAt: safeNowForFile
                    };

                    console.log(`SyncContext: Pushing data to cloud... (Memos: ${dataToUpload.memos.length}, Tombstones: ${Object.keys(dataToUpload.tombstones).length})`);
                    await GoogleDriveService.uploadFile(tokenToUse, DB_FILE_NAME, dataToUpload, fileId);
                    setLastSyncedCloudUpdatedAt(safeNowForFile);
                    lastSyncedCloudUpdatedAtRef.current = safeNowForFile;
                    await AsyncStorage.setItem(LAST_CLOUD_UPDATED_AT_KEY, safeNowForFile);
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
