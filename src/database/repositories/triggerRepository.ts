import { getDatabase } from '../db';
import { Trigger, TriggerType, ActionType } from '../../types/models';

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export interface CreateTriggerParams {
    memoId: string;
    type: TriggerType;
    actionType: ActionType;
    scheduledAt?: string;
    durationSeconds?: number;
    latitude?: number;
    longitude?: number;
    radius?: number;
    locationName?: string;
}

export async function createTrigger(params: CreateTriggerParams): Promise<Trigger> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const id = generateId();

    const trigger: Trigger = {
        id,
        memoId: params.memoId,
        type: params.type,
        isActive: true,
        actionType: params.actionType,
        scheduledAt: params.scheduledAt,
        durationSeconds: params.durationSeconds,
        startedAt: params.type === 'timer' ? now : undefined,
        latitude: params.latitude,
        longitude: params.longitude,
        radius: params.radius || 200,
        locationName: params.locationName,
        createdAt: now,
        updatedAt: now,
    };

    await db.runAsync(
        `INSERT INTO triggers (id, memoId, type, isActive, scheduledAt, durationSeconds, startedAt,
     latitude, longitude, radius, locationName, actionType, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            trigger.id, trigger.memoId, trigger.type, trigger.isActive ? 1 : 0,
            trigger.scheduledAt || null, trigger.durationSeconds || null, trigger.startedAt || null,
            trigger.latitude || null, trigger.longitude || null, trigger.radius || null,
            trigger.locationName || null, trigger.actionType, trigger.createdAt, trigger.updatedAt,
        ]
    );

    return trigger;
}

export async function getTrigger(id: string): Promise<Trigger | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>(
        'SELECT * FROM triggers WHERE id = ?',
        [id]
    );
    if (!row) return null;
    return rowToTrigger(row);
}

export async function getTriggersByMemoId(memoId: string): Promise<Trigger[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
        'SELECT * FROM triggers WHERE memoId = ? ORDER BY createdAt ASC',
        [memoId]
    );
    return rows.map(rowToTrigger);
}

export async function getActiveTriggersByType(type: TriggerType): Promise<Trigger[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
        'SELECT * FROM triggers WHERE type = ? AND isActive = 1',
        [type]
    );
    return rows.map(rowToTrigger);
}

export async function getAllActiveTriggers(): Promise<Trigger[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
        'SELECT * FROM triggers WHERE isActive = 1'
    );
    return rows.map(rowToTrigger);
}

export async function updateTrigger(
    id: string,
    updates: Partial<Pick<Trigger, 'isActive' | 'scheduledAt' | 'durationSeconds' | 'startedAt' |
        'latitude' | 'longitude' | 'radius' | 'locationName' | 'actionType'>>
): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const setClauses: string[] = [];
    const values: any[] = [];

    const fields = Object.entries(updates);
    for (const [key, value] of fields) {
        if (key === 'isActive') {
            setClauses.push(`${key} = ?`);
            values.push(value ? 1 : 0);
        } else {
            setClauses.push(`${key} = ?`);
            values.push(value ?? null);
        }
    }

    if (setClauses.length === 0) return;

    setClauses.push('updatedAt = ?');
    values.push(now);
    values.push(id);

    await db.runAsync(
        `UPDATE triggers SET ${setClauses.join(', ')} WHERE id = ?`,
        values
    );
}

export async function deleteTrigger(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM triggers WHERE id = ?', [id]);
}

export async function deleteTriggersForMemo(memoId: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM triggers WHERE memoId = ?', [memoId]);
}

function rowToTrigger(row: any): Trigger {
    return {
        id: row.id,
        memoId: row.memoId,
        type: row.type as TriggerType,
        isActive: row.isActive === 1,
        scheduledAt: row.scheduledAt,
        durationSeconds: row.durationSeconds,
        startedAt: row.startedAt,
        latitude: row.latitude,
        longitude: row.longitude,
        radius: row.radius,
        locationName: row.locationName,
        actionType: row.actionType as ActionType,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export async function upsertTrigger(trigger: Trigger): Promise<void> {
    const db = await getDatabase();
    const existing = await db.getFirstAsync('SELECT id FROM triggers WHERE id = ?', [trigger.id]);
    if (existing) {
        await db.runAsync(
            `UPDATE triggers SET 
            memoId = ?, type = ?, isActive = ?, scheduledAt = ?, durationSeconds = ?, 
            startedAt = ?, latitude = ?, longitude = ?, radius = ?, locationName = ?, 
            actionType = ?, updatedAt = ? 
            WHERE id = ?`,
            [
                trigger.memoId, trigger.type, trigger.isActive ? 1 : 0, trigger.scheduledAt, trigger.durationSeconds,
                trigger.startedAt, trigger.latitude, trigger.longitude, trigger.radius, trigger.locationName,
                trigger.actionType, trigger.updatedAt, trigger.id
            ]
        );
    } else {
        await db.runAsync(
            `INSERT INTO triggers (
            id, memoId, type, isActive, scheduledAt, durationSeconds, startedAt,
            latitude, longitude, radius, locationName, actionType, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                trigger.id, trigger.memoId, trigger.type, trigger.isActive ? 1 : 0, trigger.scheduledAt,
                trigger.durationSeconds, trigger.startedAt, trigger.latitude, trigger.longitude,
                trigger.radius, trigger.locationName, trigger.actionType, trigger.createdAt, trigger.updatedAt
            ]
        );
    }
}
