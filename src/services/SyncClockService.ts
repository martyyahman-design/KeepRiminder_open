import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_SEE_CLOUD_TIME_KEY = '@KeepReminder:max_seen_cloud_time';

/**
 * Service to handle clock drift between devices.
 * It ensures that any local update gets a timestamp that is at least
 * 1ms newer than any timestamp ever received from the cloud.
 */
export class SyncClockService {
    private static maxSeenCloudTime: number = 0;
    private static isLoaded: boolean = false;

    private static async load() {
        if (this.isLoaded) return;
        const stored = await AsyncStorage.getItem(MAX_SEE_CLOUD_TIME_KEY);
        if (stored) {
            this.maxSeenCloudTime = parseInt(stored, 10);
        }
        this.isLoaded = true;
    }

    /**
     * Update the maximum seen cloud time. 
     * Call this whenever a file or memo is downloaded from the cloud.
     */
    static async updateMaxSeenCloudTime(isoString: string): Promise<void> {
        await this.load();
        const time = new Date(isoString).getTime();
        if (time > this.maxSeenCloudTime) {
            this.maxSeenCloudTime = time;
            await AsyncStorage.setItem(MAX_SEE_CLOUD_TIME_KEY, this.maxSeenCloudTime.toString());
            console.log(`SyncClockService: Max cloud time updated to ${isoString}`);
        }
    }

    /**
     * Get a "Safe" ISO string for updatedAt/deletedAt.
     * It will be at least 1ms newer than the latest known cloud time.
     */
    static async getSafeNow(): Promise<string> {
        await this.load();
        const now = Date.now();
        const safeTime = Math.max(now, this.maxSeenCloudTime + 1);
        return new Date(safeTime).toISOString();
    }
}
