import { Platform } from 'react-native';

// Web fallback: in-memory storage
interface InMemoryDB {
  memos: Map<string, any>;
  triggers: Map<string, any>;
  locationPresets: Map<string, any>;
}

let inMemoryDB: InMemoryDB | null = null;

function getInMemoryDB(): InMemoryDB {
  if (!inMemoryDB) {
    inMemoryDB = {
      memos: new Map(),
      triggers: new Map(),
      locationPresets: new Map(),
    };
  }
  return inMemoryDB;
}

export interface DatabaseAdapter {
  runAsync(sql: string, params?: any[]): Promise<any>;
  getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null>;
  getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]>;
  clearDatabase(): Promise<void>;
}

const STORAGE_KEY = '@KeepReminder:web_db';

// In-memory adapter for Web with LocalStorage persistence
class InMemoryAdapter implements DatabaseAdapter {
  private db: InMemoryDB;

  constructor() {
    this.db = getInMemoryDB();
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (Platform.OS !== 'web') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.db.memos = new Map(Object.entries(parsed.memos || {}));
        this.db.triggers = new Map(Object.entries(parsed.triggers || {}));
        this.db.locationPresets = new Map(Object.entries(parsed.locationPresets || {}));
        console.log('Web DB loaded from localStorage');
      }
    } catch (e) {
      console.error('Failed to load Web DB from localStorage', e);
    }
  }

  private saveToStorage() {
    if (Platform.OS !== 'web') return;
    try {
      const data = {
        memos: Object.fromEntries(this.db.memos),
        triggers: Object.fromEntries(this.db.triggers),
        locationPresets: Object.fromEntries(this.db.locationPresets),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save Web DB to localStorage', e);
    }
  }

  async runAsync(sql: string, params?: any[]): Promise<any> {
    const sqlLower = sql.trim().toLowerCase();

    if (sqlLower.startsWith('insert into memos')) {
      const [id, title, content, blocks, color, isPinned, todoType, todoDate, isCompleted, completedAt, createdAt, updatedAt, deletedAt, tag] = params || [];
      this.db.memos.set(id, { id, title, content, blocks, color, isPinned, todoType, todoDate, isCompleted, completedAt, createdAt, updatedAt, deletedAt: deletedAt || null, tag });
    } else if (sqlLower.startsWith('insert into triggers')) {
      const [id, memoId, type, isActive, scheduledAt, durationSeconds, startedAt,
        latitude, longitude, radius, locationName, actionType, createdAt, updatedAt] = params || [];
      this.db.triggers.set(id, {
        id, memoId, type, isActive, scheduledAt, durationSeconds, startedAt,
        latitude, longitude, radius, locationName, actionType, createdAt, updatedAt,
      });
    } else if (sqlLower.startsWith('update memos')) {
      const id = params?.[params.length - 1];
      const existing = this.db.memos.get(id);
      if (existing) {
        const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
        if (setMatch && setMatch[1]) {
          const fields = setMatch[1].split(',').map(f => f.trim().split('=')[0].trim());
          let paramIdx = 0;
          for (const field of fields) {
            if (params && paramIdx < params.length - 1) {
              existing[field] = params[paramIdx];
              paramIdx++;
            }
          }
          this.db.memos.set(id, existing);
        }
      }
    } else if (sqlLower.startsWith('update triggers')) {
      const id = params?.[params.length - 1];
      const existing = this.db.triggers.get(id);
      if (existing) {
        const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
        if (setMatch && setMatch[1]) {
          const fields = setMatch[1].split(',').map(f => f.trim().split('=')[0].trim());
          let paramIdx = 0;
          for (const field of fields) {
            if (params && paramIdx < params.length - 1) {
              existing[field] = params[paramIdx];
              paramIdx++;
            }
          }
          this.db.triggers.set(id, existing);
        }
      }
    } else if (sqlLower.startsWith('delete from memos')) {
      const id = params?.[0];
      this.db.memos.delete(id);
      const triggersToDelete: string[] = [];
      for (const [tid, trigger] of this.db.triggers) {
        if (trigger.memoId === id) triggersToDelete.push(tid);
      }
      triggersToDelete.forEach(tid => this.db.triggers.delete(tid));
    } else if (sqlLower.startsWith('delete from triggers')) {
      if (sqlLower.includes('memoid')) {
        const memoId = params?.[0];
        const triggersToDelete: string[] = [];
        for (const [tid, trigger] of this.db.triggers) {
          if (trigger.memoId === memoId) triggersToDelete.push(tid);
        }
        triggersToDelete.forEach(tid => this.db.triggers.delete(tid));
      } else {
        const id = params?.[0];
        this.db.triggers.delete(id);
      }
    } else if (sqlLower.startsWith('insert into location_presets')) {
      const [id, name, latitude, longitude, radius, createdAt, updatedAt] = params || [];
      this.db.locationPresets.set(id, { id, name, latitude, longitude, radius, createdAt, updatedAt });
    } else if (sqlLower.startsWith('delete from location_presets')) {
      const id = params?.[0];
      this.db.locationPresets.delete(id);
    }

    this.saveToStorage();
    return { changes: 1 };
  }

  async getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const results = await this.getAllAsync<T>(sql, params);
    return results[0] || null;
  }

  async getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const sqlLower = sql.trim().toLowerCase();

    if (sqlLower.includes('from memos')) {
      let results = Array.from(this.db.memos.values());

      // 論理削除の考慮（特に指定がない場合は削除されていないものだけを返す）
      if (!sqlLower.includes('deletedat is not null') && !sqlLower.includes('deletedat is null')) {
        // デフォルトは削除されていないもの
        results = results.filter(m => !m.deletedAt);
      } else if (sqlLower.includes('deletedat is not null')) {
        results = results.filter(m => !!m.deletedAt);
      } else if (sqlLower.includes('deletedat is null')) {
        results = results.filter(m => !m.deletedAt);
      }

      if (sqlLower.includes('where id =')) {
        results = results.filter(m => m.id === params?.[0]);
      } else if (sqlLower.includes('where title like')) {
        const query = params?.[0]?.replace(/%/g, '') || '';
        results = results.filter(m =>
          m.title?.toLowerCase().includes(query.toLowerCase()) ||
          m.content?.toLowerCase().includes(query.toLowerCase())
        );
      }
      if (sqlLower.includes('order by')) {
        results.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
      }
      return results as T[];
    }

    if (sqlLower.includes('from triggers')) {
      let results = Array.from(this.db.triggers.values());
      if (sqlLower.includes('where id =') && !sqlLower.includes('memoid')) {
        results = results.filter(t => t.id === params?.[0]);
      } else if (sqlLower.includes('where memoid =')) {
        results = results.filter(t => t.memoId === params?.[0]);
      } else if (sqlLower.includes('where type =') && sqlLower.includes('isactive')) {
        results = results.filter(t => t.type === params?.[0] && t.isActive === 1);
      } else if (sqlLower.includes('where isactive = 1')) {
        results = results.filter(t => t.isActive === 1);
      }
      return results as T[];
    }

    if (sqlLower.includes('from location_presets')) {
      let results = Array.from(this.db.locationPresets.values());
      if (sqlLower.includes('order by')) {
        results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      }
      return results as T[];
    }
    return [];
  }

  async clearDatabase(): Promise<void> {
    this.db.memos.clear();
    this.db.triggers.clear();
    this.db.locationPresets.clear();
    this.saveToStorage();
  }
}

let adapter: DatabaseAdapter | null = null;

export async function getDatabase(): Promise<DatabaseAdapter> {
  if (adapter) return adapter;
  adapter = new InMemoryAdapter();
  return adapter;
}

export async function closeDatabase(): Promise<void> {
  adapter = null;
}
