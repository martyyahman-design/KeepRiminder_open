import { getDatabase } from '../db';
import { LocationPreset } from '../../types/models';

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export async function createLocationPreset(params: {
    name: string;
    latitude: number;
    longitude: number;
    radius: number;
}): Promise<LocationPreset> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const id = generateId();

    const preset: LocationPreset = {
        id,
        ...params,
        createdAt: now,
        updatedAt: now,
    };

    await db.runAsync(
        `INSERT INTO location_presets (id, name, latitude, longitude, radius, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [preset.id, preset.name, preset.latitude, preset.longitude, preset.radius, preset.createdAt, preset.updatedAt]
    );

    return preset;
}

export async function getAllLocationPresets(): Promise<LocationPreset[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
        'SELECT * FROM location_presets ORDER BY updatedAt DESC'
    );
    return rows.map(rowToPreset);
}

export async function deleteLocationPreset(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM location_presets WHERE id = ?', [id]);
}

function rowToPreset(row: any): LocationPreset {
    return {
        id: row.id,
        name: row.name,
        latitude: row.latitude,
        longitude: row.longitude,
        radius: row.radius,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
