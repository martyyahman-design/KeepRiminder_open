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

    await db.runAsync(
        `INSERT INTO memos (id, title, content, color, isPinned, todoType, todoDate, isCompleted, completedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, title, content, color, isPinned ? 1 : 0, todoType, todoDate, isCompleted ? 1 : 0, completedAt, now, now]
    );

    return { id, title, content, color, isPinned, todoType, todoDate, isCompleted, completedAt, createdAt: now, updatedAt: now };
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
        'SELECT * FROM memos ORDER BY isPinned DESC, updatedAt DESC'
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
    await db.runAsync('DELETE FROM memos WHERE id = ?', [id]);
}

export async function searchMemos(query: string): Promise<Memo[]> {
    const db = await getDatabase();
    const searchQuery = `%${query}%`;
    const rows = await db.getAllAsync<any>(
        `SELECT * FROM memos 
     WHERE title LIKE ? OR content LIKE ?
     ORDER BY isPinned DESC, updatedAt DESC`,
        [searchQuery, searchQuery]
    );
    return rows.map(rowToMemo);
}

function rowToMemo(row: any): Memo {
    return {
        id: row.id,
        title: row.title,
        content: row.content,
        color: row.color as MemoColor,
        isPinned: row.isPinned === 1,
        todoType: row.todoType as any,
        todoDate: row.todoDate,
        isCompleted: row.isCompleted === 1,
        completedAt: row.completedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
