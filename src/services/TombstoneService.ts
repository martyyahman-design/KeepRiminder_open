import { getDatabase } from '../database/db';
import { SyncClockService } from './SyncClockService';
import { Tombstone } from '../types/models';

export type TombstoneInfo = Pick<Tombstone, 'deletedAt' | 'version'>;

export class TombstoneService {
    static async getTombstones(): Promise<Record<string, TombstoneInfo>> {
        try {
            const db = await getDatabase();
            const rows = await db.getAllAsync<Tombstone>('SELECT * FROM tombstones');
            const result: Record<string, TombstoneInfo> = {};
            for (const row of rows) {
                result[row.id] = { deletedAt: row.deletedAt, version: row.version };
            }
            return result;
        } catch (e) {
            console.error('TombstoneService: Failed to get tombstones', e);
            return {};
        }
    }

    static async addTombstone(id: string, version: number): Promise<void> {
        try {
            const db = await getDatabase();
            const now = await SyncClockService.getSafeNow();
            const existing = await db.getFirstAsync<Tombstone>('SELECT * FROM tombstones WHERE id = ?', [id]);

            if (!existing || version >= existing.version) {
                await db.runAsync('REPLACE INTO tombstones (id, version, deletedAt) VALUES (?, ?, ?)', [id, version, now]);
                console.log(`TombstoneService: Recorded tombstone for ${id} (version ${version}) at ${now}`);
            }
        } catch (e) {
            console.error('TombstoneService: Failed to add tombstone', e);
        }
    }

    static async mergeTombstones(incoming: Record<string, TombstoneInfo>): Promise<boolean> {
        try {
            const db = await getDatabase();
            const local = await this.getTombstones();
            let changed = false;

            for (const [id, incomingInfo] of Object.entries(incoming)) {
                const localInfo = local[id];
                if (!localInfo || incomingInfo.version > localInfo.version) {
                    await db.runAsync('REPLACE INTO tombstones (id, version, deletedAt) VALUES (?, ?, ?)', [id, incomingInfo.version, incomingInfo.deletedAt]);
                    changed = true;
                } else if (incomingInfo.version === localInfo.version && new Date(incomingInfo.deletedAt).getTime() > new Date(localInfo.deletedAt).getTime()) {
                    await db.runAsync('REPLACE INTO tombstones (id, version, deletedAt) VALUES (?, ?, ?)', [id, incomingInfo.version, incomingInfo.deletedAt]);
                    changed = true;
                }
            }

            if (changed) {
                console.log('TombstoneService: Merged tombstones');
            }
            return changed;
        } catch (e) {
            console.error('TombstoneService: Failed to merge tombstones', e);
            return false;
        }
    }

    static async cleanupTombstones(): Promise<void> {
        try {
            const db = await getDatabase();
            const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();

            await db.runAsync('DELETE FROM tombstones WHERE deletedAt < ?', [thirtyDaysAgo]);
            console.log('TombstoneService: Cleaned up old tombstones');
        } catch (e) {
            console.error('TombstoneService: Failed to cleanup tombstones', e);
        }
    }
}
