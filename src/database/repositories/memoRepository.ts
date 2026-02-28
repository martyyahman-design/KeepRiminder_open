import { getDatabase } from '../db';
import { Memo, MemoColor } from '../../types/models';

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export async function createMemo(
    title: string = '',
    content: string = '',
    color: MemoColor = 'default',
    isPinned: boolean = false
): Promise<Memo> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const id = generateId();

    const todoType = 'none';
    const todoDate = null;
    const isCompleted = false;
    const completedAt = null;
    const deletedAt = null;
    const blocks = [{ id: '1', type: 'text' as const, content }];

    await db.runAsync(
        `INSERT INTO memos (id, title, content, blocks, color, isPinned, todoType, todoDate, isCompleted, completedAt, createdAt, updatedAt, deletedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, title, content, JSON.stringify(blocks), color, isPinned ? 1 : 0, todoType, todoDate, isCompleted ? 1 : 0, completedAt, now, now, deletedAt]
    );

    return { id, title, content, blocks, color, isPinned, todoType, todoDate, isCompleted, completedAt, createdAt: now, updatedAt: now, deletedAt };
}

export async function getMemo(id: string): Promise<Memo | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>(
        'SELECT * FROM memos WHERE id = ?',
        [id]
    );
    if (!row) return null;
    return rowToMemo(row);
}

export async function getAllMemos(): Promise<Memo[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
        'SELECT * FROM memos WHERE deletedAt IS NULL ORDER BY isPinned DESC, updatedAt DESC'
    );
    return rows.map(rowToMemo);
}

export async function getDeletedMemos(): Promise<Memo[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
        'SELECT * FROM memos WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC'
    );
    return rows.map(rowToMemo);
}

export async function updateMemo(
    id: string,
    updates: Partial<Memo>
): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
        setClauses.push('title = ?');
        values.push(updates.title);
    }
    if (updates.content !== undefined) {
        setClauses.push('content = ?');
        values.push(updates.content);
    }
    if (updates.color !== undefined) {
        setClauses.push('color = ?');
        values.push(updates.color);
    }
    if (updates.isPinned !== undefined) {
        setClauses.push('isPinned = ?');
        values.push(updates.isPinned ? 1 : 0);
    }
    if (updates.todoType !== undefined) {
        setClauses.push('todoType = ?');
        values.push(updates.todoType);
    }
    if (updates.todoDate !== undefined) {
        setClauses.push('todoDate = ?');
        values.push(updates.todoDate);
    }
    if (updates.isCompleted !== undefined) {
        setClauses.push('isCompleted = ?');
        values.push(updates.isCompleted ? 1 : 0);
    }
    if (updates.completedAt !== undefined) {
        setClauses.push('completedAt = ?');
        values.push(updates.completedAt);
    }
    if (updates.blocks !== undefined) {
        setClauses.push('blocks = ?');
        values.push(JSON.stringify(updates.blocks));
    }

    if (setClauses.length === 0) return;

    setClauses.push('updatedAt = ?');
    values.push(now);
    values.push(id);

    await db.runAsync(
        `UPDATE memos SET ${setClauses.join(', ')} WHERE id = ?`,
        values
    );
}

export async function deleteMemo(id: string): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync('UPDATE memos SET deletedAt = ? WHERE id = ?', [now, id]);
}

export async function restoreMemo(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('UPDATE memos SET deletedAt = NULL WHERE id = ?', [id]);
}

export async function permanentlyDeleteMemo(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM memos WHERE id = ?', [id]);
}

export async function emptyTrash(): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM memos WHERE deletedAt IS NOT NULL');
}

export async function searchMemos(query: string): Promise<Memo[]> {
    const db = await getDatabase();
    const searchQuery = `%${query}%`;
    const rows = await db.getAllAsync<any>(
        `SELECT * FROM memos 
     WHERE deletedAt IS NULL AND (title LIKE ? OR content LIKE ?)
     ORDER BY isPinned DESC, updatedAt DESC`,
        [searchQuery, searchQuery]
    );
    return rows.map(rowToMemo);
}

function rowToMemo(row: any): Memo {
    let blocks = [];
    try {
        blocks = row.blocks ? JSON.parse(row.blocks) : [];
    } catch (e) {
        console.warn('Failed to parse blocks JSON', e);
    }

    // Fallback for older data or empty blocks
    if (blocks.length === 0 && row.content) {
        blocks = [{ id: 'fallback-' + Date.now(), type: 'text', content: row.content }];
    } else if (blocks.length === 0) {
        blocks = [{ id: 'initial-' + Date.now(), type: 'text', content: '' }];
    }

    return {
        id: row.id,
        title: row.title,
        content: row.content,
        blocks,
        color: row.color as MemoColor,
        isPinned: row.isPinned === 1,
        todoType: row.todoType as any,
        todoDate: row.todoDate,
        isCompleted: row.isCompleted === 1,
        completedAt: row.completedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt,
    };
}

export async function upsertMemo(memo: Memo): Promise<void> {
    const db = await getDatabase();
    const existing = await db.getFirstAsync('SELECT id FROM memos WHERE id = ?', [memo.id]);
    if (existing) {
        await db.runAsync(
            `UPDATE memos SET 
            title = ?, content = ?, blocks = ?, color = ?, isPinned = ?, todoType = ?, 
            todoDate = ?, isCompleted = ?, completedAt = ?, updatedAt = ?, deletedAt = ? 
            WHERE id = ?`,
            [
                memo.title, memo.content, JSON.stringify(memo.blocks), memo.color, memo.isPinned ? 1 : 0, memo.todoType,
                memo.todoDate, memo.isCompleted ? 1 : 0, memo.completedAt, memo.updatedAt, memo.deletedAt, memo.id
            ]
        );
    } else {
        await db.runAsync(
            `INSERT INTO memos (
            id, title, content, blocks, color, isPinned, todoType, todoDate, 
            isCompleted, completedAt, createdAt, updatedAt, deletedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                memo.id, memo.title, memo.content, JSON.stringify(memo.blocks), memo.color, memo.isPinned ? 1 : 0, memo.todoType,
                memo.todoDate, memo.isCompleted ? 1 : 0, memo.completedAt, memo.createdAt, memo.updatedAt, memo.deletedAt
            ]
        );
    }
}
