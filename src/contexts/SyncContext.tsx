import React, { createContext, useContext, useEffect, useCallback, useState, useRef, ReactNode } from 'react';
import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { useMemos } from './MemoContext';
import { GoogleDriveService } from '../services/GoogleDriveService';
import { TombstoneService, TombstoneInfo } from '../services/TombstoneService';
import { SyncClockService } from '../services/SyncClockService';
import { useNetwork } from './NetworkContext';
import * as MemoRepo from '../database/repositories/memoRepository';
import * as TriggerRepo from '../database/repositories/triggerRepository';
import { Alert } from 'react-native';

const LAST_SYNCED_AT_KEY = '@KeepReminder:last_synced_at';
const LAST_CLOUD_UPDATED_AT_KEY = '@KeepReminder:last_cloud_updated_at';
const LAST_ETAG_KEY = '@KeepReminder:last_etag';

interface SyncContextType {
    isSyncing: boolean;
    lastSyncedAt: Date | null;
    isInitialSyncDone: boolean;
    syncError: string | null;
    performSync: (mode?: 'pull' | 'push') => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

const DB_FILE_NAME = 'keepreminder_backup_v2.json';

export function SyncProvider({ children }: { children: ReactNode }) {
    const { user, accessToken, getFreshToken, clearAccessToken } = useAuth();
    const { memos, deletedMemos, refreshMemos } = useMemos();
    const [isSyncing, setIsSyncing] = useState(false);
    const [isInitialSyncDone, setIsInitialSyncDone] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
    const [lastSyncedCloudUpdatedAt, setLastSyncedCloudUpdatedAt] = useState<string | null>(null);
    const [lastEtag, setLastEtag] = useState<string | null>(null);
    const [isStateLoaded, setIsStateLoaded] = useState(false);
    const prevMemosCount = useRef(memos.length);
    const prevDeletedCount = useRef(deletedMemos.length);

    const lastSyncedAtRef = useRef<Date | null>(null);
    const lastSyncedCloudUpdatedAtRef = useRef<string | null>(null);
    const lastEtagRef = useRef<string | null>(null);
    const isSyncingRef = useRef(false);
    const isInitialSyncDoneRef = useRef(false);
    const pendingPushRef = useRef(false);
    const { isOnline } = useNetwork();

    // Persistence: Load sync state on mount
    useEffect(() => {
        const loadSyncState = async () => {
            try {
                const [storedAt, storedCloud, storedEtag] = await Promise.all([
                    AsyncStorage.getItem(LAST_SYNCED_AT_KEY),
                    AsyncStorage.getItem(LAST_CLOUD_UPDATED_AT_KEY),
                    AsyncStorage.getItem(LAST_ETAG_KEY),
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
                if (storedEtag) {
                    setLastEtag(storedEtag);
                    lastEtagRef.current = storedEtag;
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
            console.log(`SyncContext: performSync(${mode}) deferred - already syncing.`);
            if (mode === 'push') pendingPushRef.current = true;
            return;
        }

        if (!isOnline) {
            console.log(`SyncContext: performSync(${mode}) skipped, network offline.`);
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

        console.log(`SyncContext: performSync(${mode}) started.`);
        setSyncError(null);
        try {
            const fileInfo = await GoogleDriveService.findFile(tokenToUse, DB_FILE_NAME);

            if (fileInfo) {
                const fileId = fileInfo.id;
                let cloudEtag = fileInfo.etag;

                // 1. PUSH 競合チェック (Optimistic Locking)
                if (mode === 'push') {
                    if (lastEtagRef.current && cloudEtag !== lastEtagRef.current) {
                        console.warn(`SyncContext: 競合を検知しました (Cloud Etag: ${cloudEtag}, Local Etag: ${lastEtagRef.current})。PULLを強制します。`);
                        mode = 'pull'; // 強制PULLに切り替え
                    }
                }

                // クラウドの更新がある場合 (ETag が異なる) 常に PULL ＆ MERGE
                if (!lastEtagRef.current || cloudEtag !== lastEtagRef.current || mode === 'pull') {
                    const cloudData = await GoogleDriveService.downloadFile(tokenToUse, fileId);

                    if (!cloudData || !Array.isArray(cloudData.memos)) {
                        console.error('SyncContext: Downloaded cloud data is invalid/missing memos array. Skipping merge.');
                        throw new Error('Invalid cloud data format');
                    }

                    const cloudFileUpdatedAtStr = cloudData.updatedAt || new Date(0).toISOString();
                    await SyncClockService.updateMaxSeenCloudTime(cloudFileUpdatedAtStr);

                    // ローカルデータを取得
                    const localMemos = await MemoRepo.getAllMemos();
                    const localDeletedMemos = await MemoRepo.getDeletedMemos();
                    const allLocalMemos = [...localMemos, ...localDeletedMemos];
                    const dirtyMemosMap = new Map((await MemoRepo.getDirtyMemos()).map(m => [m.id, true]));

                    // 墓石マージ
                    const cloudTombstones: Record<string, TombstoneInfo> = cloudData.tombstones || {};
                    await TombstoneService.mergeTombstones(cloudTombstones);
                    const currentTombstones = await TombstoneService.getTombstones();

                    console.log(`SyncContext: Merging Data. Cloud ETag: ${cloudEtag}`);
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    let hasLocalChanges = false;
                    let conflictNotified = false;

                    // A. Cloud メモ処理 (有効なメモとごみ箱の両方をソースにする)
                    const cloudMemosToProcess = [...cloudData.memos, ...(cloudData.deletedMemos || [])];
                    console.log(`SyncContext: Processing ${cloudMemosToProcess.length} cloud memos (including trash)`);

                    for (const cloudMemo of cloudMemosToProcess) {
                        const localMemo = allLocalMemos.find(m => m.id === cloudMemo.id);
                        const tombstone = currentTombstones[cloudMemo.id];

                        // 墓石チェック (クラウドよりローカルの墓石が新しければ無視)
                        if (tombstone && tombstone.version >= cloudMemo.version) {
                            continue;
                        }

                        if (!localMemo) {
                            // 新規作成
                            console.log(`SyncContext: PULL - Creating new memo ${cloudMemo.id} (isDeleted: ${cloudMemo.isDeleted})`);
                            await MemoRepo.upsertMemo({ ...cloudMemo, lastSyncedVersion: cloudMemo.version });
                            hasLocalChanges = true;
                        } else {
                            const cloudVersion = Number(cloudMemo.version) || 0;
                            const localVersion = Number(localMemo.version) || 0;
                            const localLastSynced = Number(localMemo.lastSyncedVersion) || 0;

                            const isCloudChanged = cloudVersion > localLastSynced;
                            const isLocalChanged = localVersion > localLastSynced;

                            if (isCloudChanged && isLocalChanged) {
                                // 競合検知: 自分も相手も変更している
                                console.log(`SyncContext: PULL - Conflict detected on memo ${localMemo.id}. Duplicating local changes.`);
                                await MemoRepo.duplicateMemo(localMemo);

                                if (!conflictNotified) {
                                    const msg = '他のデバイスと同時に編集された競合を検知したため、あなたの変更を別のメモとして保護しました。';
                                    if (Platform.OS !== 'web') Alert.alert('同期保護', msg);
                                    else window.alert(msg);
                                    conflictNotified = true;
                                }
                                // クラウドの内容で上書き
                                console.log(`SyncContext: PULL - Overwriting ${localMemo.id} with cloud version ${cloudVersion}`);
                                await MemoRepo.upsertMemo({ ...cloudMemo, lastSyncedVersion: cloudVersion });
                                hasLocalChanges = true;
                            } else if (isCloudChanged) {
                                // 自分は変えていないが、相手が変わった（単純更新）
                                console.log(`SyncContext: PULL - Updating memo ${cloudMemo.id} to version ${cloudVersion} (isDeleted: ${cloudMemo.isDeleted})`);
                                await MemoRepo.upsertMemo({ ...cloudMemo, lastSyncedVersion: cloudVersion });
                                hasLocalChanges = true;
                            }
                        }
                    }

                    // C. トリガー同期 (全件差し替え方式で削除も反映)
                    if (cloudData.triggers && Array.isArray(cloudData.triggers)) {
                        const allLocalTriggers = await TriggerRepo.getAllTriggers();

                        // 内容の差分があるか比較 (IDと更新日時で簡易チェック)
                        const isSame =
                            allLocalTriggers.length === cloudData.triggers.length &&
                            cloudData.triggers.every((ct: any) => {
                                const lt = allLocalTriggers.find(t => t.id === ct.id);
                                return lt && lt.updatedAt === ct.updatedAt;
                            });

                        if (!isSame) {
                            console.log(`SyncContext: Trigger mismatch found. Resetting local triggers with ${cloudData.triggers.length} cloud triggers`);
                            await TriggerRepo.resetTriggers(cloudData.triggers);
                            hasLocalChanges = true;
                        } else {
                            console.log('SyncContext: Triggers are already up to date.');
                        }
                    }

                    // D. 墓石処理 (クラウドから消されたものをローカルからも消す)
                    for (const [id, tombstoneInfo] of Object.entries(currentTombstones)) {
                        const local = allLocalMemos.find(m => m.id === id);
                        if (local && tombstoneInfo.version >= local.version) {
                            await MemoRepo.permanentlyDeleteMemo(id);
                            hasLocalChanges = true;
                        }
                    }

                    await refreshMemos();

                    // 成功した ETag 等の保存
                    setLastEtag(cloudEtag);
                    lastEtagRef.current = cloudEtag;
                    setLastSyncedCloudUpdatedAt(cloudFileUpdatedAtStr);
                    lastSyncedCloudUpdatedAtRef.current = cloudFileUpdatedAtStr;

                    await AsyncStorage.setItem(LAST_ETAG_KEY, cloudEtag);
                    await AsyncStorage.setItem(LAST_CLOUD_UPDATED_AT_KEY, cloudFileUpdatedAtStr);
                }

                // PUSH 要求があれば最新データをアップロード
                if (mode === 'push') {
                    await TombstoneService.cleanupTombstones();
                    const currentTombstones = await TombstoneService.getTombstones();

                    let finalMemos = await MemoRepo.getAllMemos();
                    let finalDeleted = await MemoRepo.getDeletedMemos();
                    let allTriggers = await TriggerRepo.getAllTriggers();

                    const dataToUpload = {
                        version: 2,
                        memos: [...finalMemos, ...finalDeleted],
                        triggers: allTriggers,
                        tombstones: currentTombstones,
                        updatedAt: new Date().toISOString()
                    };

                    console.log(`SyncContext: Pushing data to cloud... (Active: ${finalMemos.length}, Deleted: ${finalDeleted.length}, Tombstones: ${Object.keys(dataToUpload.tombstones).length}) ETag:${lastEtagRef.current}`);
                    if (finalDeleted.length > 0) {
                        console.log('SyncContext: Deleted items in PUSH:', finalDeleted.map(m => `${m.id} (isDeleted: ${m.isDeleted})`));
                    }

                    // IF-Match を使ってアップロード
                    const result = await GoogleDriveService.uploadFile(tokenToUse, DB_FILE_NAME, dataToUpload, fileId, lastEtagRef.current || undefined);

                    if (result.etag) {
                        setLastEtag(result.etag);
                        lastEtagRef.current = result.etag;
                        await AsyncStorage.setItem(LAST_ETAG_KEY, result.etag);
                        console.log(`SyncContext: PUSH successful. New ETag: ${result.etag}`);
                    }

                    setLastSyncedCloudUpdatedAt(dataToUpload.updatedAt);
                    lastSyncedCloudUpdatedAtRef.current = dataToUpload.updatedAt;
                    await AsyncStorage.setItem(LAST_CLOUD_UPDATED_AT_KEY, dataToUpload.updatedAt);

                    // PUSH成功後、全データの lastSyncedVersion を version に更新
                    for (const memo of finalMemos) {
                        if (memo.version > memo.lastSyncedVersion) {
                            await MemoRepo.markAsSynced(memo.id, memo.version);
                        }
                    }
                    for (const memo of finalDeleted) {
                        if (memo.version > memo.lastSyncedVersion) {
                            await MemoRepo.markAsSynced(memo.id, memo.version);
                        }
                    }
                }

            } else if (mode === 'push') {
                // 初回アップロード
                const localMemos = await MemoRepo.getAllMemos();
                const localDeleted = await MemoRepo.getDeletedMemos();
                const localTriggers = await TriggerRepo.getAllTriggers();
                const now = new Date().toISOString();
                const currentTombstones = await TombstoneService.getTombstones();
                const dataToUpload = {
                    version: 2,
                    memos: [...localMemos, ...localDeleted],
                    triggers: localTriggers,
                    tombstones: currentTombstones,
                    updatedAt: now
                };
                const result = await GoogleDriveService.uploadFile(tokenToUse, DB_FILE_NAME, dataToUpload);

                // 初回アップロード後の同期状態更新
                if (result.etag) {
                    setLastEtag(result.etag);
                    lastEtagRef.current = result.etag;
                    await AsyncStorage.setItem(LAST_ETAG_KEY, result.etag);
                    console.log(`SyncContext: Initial PUSH successful. New ETag: ${result.etag}`);
                }
                setLastSyncedCloudUpdatedAt(now);
                lastSyncedCloudUpdatedAtRef.current = now;
                await AsyncStorage.setItem(LAST_CLOUD_UPDATED_AT_KEY, now);

                for (const memo of localMemos) {
                    if (memo.version > memo.lastSyncedVersion) {
                        await MemoRepo.markAsSynced(memo.id, memo.version);
                    }
                }
                for (const memo of localDeleted) {
                    if (memo.version > memo.lastSyncedVersion) {
                        await MemoRepo.markAsSynced(memo.id, memo.version);
                    }
                }
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
            setSyncError(error.message || String(error));
            // Handle 401 Unauthorized (likely token expired)
            if (error.message?.includes('401') && Platform.OS === 'web') {
                console.log('SyncContext: 401 Error detected on Web. Clearing tokens.');
                clearAccessToken();
            }
        } finally {
            isSyncingRef.current = false;
            setIsSyncing(false);
            console.log(`SyncContext: performSync(${mode}) finished.`);

            // If there's a pending push, execute it now
            if (pendingPushRef.current) {
                console.log('SyncContext: Executing deferred pending push.');
                pendingPushRef.current = false;
                performSync('push');
            }
        }
    }, [user, accessToken, getFreshToken, clearAccessToken, refreshMemos, isStateLoaded]);

    useEffect(() => {
        if (!isStateLoaded || !isOnline) return;
        if (accessToken && !isInitialSyncDoneRef.current) {
            console.log('SyncContext: Initial sync (first pull) triggered.');
            performSync('pull');
        }
    }, [accessToken, performSync, isStateLoaded, isOnline]);

    useEffect(() => {
        // Only trigger auto-save if accessToken is available, online and initial sync is done
        if (!accessToken || !isInitialSyncDoneRef.current || !isStateLoaded || !isOnline) return;

        const isDeletion = memos.length < prevMemosCount.current || deletedMemos.length < prevDeletedCount.current;
        prevMemosCount.current = memos.length;
        prevDeletedCount.current = deletedMemos.length;

        if (isDeletion) {
            console.log('SyncContext: Deletion detected! Triggering IMMEDIATE push.');
            performSync('push');
            return;
        }

        console.log(`SyncContext: State changed, scheduling auto-save push in 2s...`);
        const timer = setTimeout(() => {
            console.log('SyncContext: Debounced auto-save push executing.');
            performSync('push');
        }, 2000); // 2 seconds debounce

        return () => clearTimeout(timer);
    }, [memos, deletedMemos, accessToken, performSync, isStateLoaded, isOnline]);

    // AppState listener for quick pull when returning to app
    useEffect(() => {
        if (Platform.OS === 'web') return;
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active' && user) {
                console.log('SyncContext: App came to foreground, triggering PULL');
                performSync('pull');
            }
        });
        return () => subscription.remove();
    }, [user, performSync]);

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
            syncError,
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
