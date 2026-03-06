import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_TOMBSTONES_KEY = '@KeepReminder:last_tombstones';

export class TombstoneService {
    private static cache: Record<string, string> | null = null;

    static async getTombstones(): Promise<Record<string, string>> {
        if (this.cache) return this.cache;

        try {
            const stored = await AsyncStorage.getItem(LAST_TOMBSTONES_KEY);
            if (stored) {
                this.cache = JSON.parse(stored);
                return this.cache || {};
            }
        } catch (e) {
            console.error('TombstoneService: Failed to get tombstones', e);
        }
        this.cache = {};
        return {};
    }

    static async addTombstone(id: string): Promise<void> {
        const tombstones = await this.getTombstones();
        const now = new Date().toISOString();
        tombstones[id] = now;
        this.cache = tombstones;
        await AsyncStorage.setItem(LAST_TOMBSTONES_KEY, JSON.stringify(tombstones));
        console.log(`TombstoneService: Added tombstone for ${id}`);
    }

    static async mergeTombstones(incoming: Record<string, string>): Promise<boolean> {
        const local = await this.getTombstones();
        let changed = false;

        for (const [id, deletedAt] of Object.entries(incoming)) {
            const localDeletedAt = local[id];
            if (!localDeletedAt || new Date(deletedAt).getTime() > new Date(localDeletedAt).getTime()) {
                local[id] = deletedAt;
                changed = true;
            }
        }

        if (changed) {
            this.cache = local;
            await AsyncStorage.setItem(LAST_TOMBSTONES_KEY, JSON.stringify(local));
            console.log('TombstoneService: Merged tombstones', Object.keys(local).length);
        }
        return changed;
    }

    static async cleanupTombstones(): Promise<void> {
        const tombstones = await this.getTombstones();
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const fresh: Record<string, string> = {};
        let changed = false;

        for (const [id, date] of Object.entries(tombstones)) {
            if (new Date(date).getTime() > thirtyDaysAgo) {
                fresh[id] = date;
            } else {
                changed = true;
            }
        }

        if (changed) {
            this.cache = fresh;
            await AsyncStorage.setItem(LAST_TOMBSTONES_KEY, JSON.stringify(fresh));
            console.log('TombstoneService: Cleaned up old tombstones');
        }
    }
}
