import { Platform } from 'react-native';

// Web fallback: in-memory storage
interface InMemoryDB {
  memos: Map<string, any>;
  triggers: Map<string, any>;
  locationPresets: Map<string, any>;
  tombstones: Map<string, any>;
}

let inMemoryDB: InMemoryDB | null = null;

function getInMemoryDB(): InMemoryDB {
  if (!inMemoryDB) {
    inMemoryDB = {
      memos: new Map(),
      triggers: new Map(),
      locationPresets: new Map(),
      tombstones: new Map(),
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

const STORAGE_KEY = '@KeepReminder:web_db_v2';

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
        this.db.tombstones = new Map(Object.entries(parsed.tombstones || {}));
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
        tombstones: Object.fromEntries(this.db.tombstones),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save Web DB to localStorage', e);
    }
  }

  async runAsync(sql: string, params?: any[]): Promise<any> {
    const sqlLower = sql.trim().toLowerCase();

    if (sqlLower.startsWith('insert into memos') || sqlLower.startsWith('replace into memos')) {
      const [id, title, content, blocks, color, isPinned, todoType, todoDate, isCompleted, completedAt, createdAt, updatedAt, isDeleted, deletedAt, tag, version, lastSyncedVersion] = params || [];
      this.db.memos.set(id, {
        id,
        title: title || '',
        content: content || '',
        blocks: blocks || '[]',
        color: color || 'default',
        isPinned: !!isPinned,
        todoType: todoType || 'none',
        todoDate: todoDate || null,
        isCompleted: !!isCompleted,
        completedAt: completedAt || null,
        createdAt: createdAt || new Date().toISOString(),
        updatedAt: updatedAt || new Date().toISOString(),
        isDeleted: !!isDeleted,
        deletedAt: deletedAt || null,
        tag: tag || 'work',
        version: Number(version) || 1,
        lastSyncedVersion: Number(lastSyncedVersion) || 0
      });
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
      console.log('InMemoryAdapter: UPDATE memos', { id, sql, params });
      if (existing) {
        const setPart = sql.substring(sql.search(/SET/i) + 3, sql.search(/WHERE/i)).trim();
        const assignments = setPart.split(',').map(a => a.trim());
        let paramIdx = 0;
        for (const assignment of assignments) {
          const parts = assignment.split(/\s*=\s*/);
          const field = parts[0].trim();
          const valueExpr = parts[1].trim();

          if (valueExpr === '?') {
            if (params && paramIdx < params.length - 1) {
              let pVal = params[paramIdx];
              if (field === 'isDeleted' || field === 'isPinned' || field === 'isCompleted') {
                pVal = (pVal === 1 || pVal === true);
              }
              existing[field] = pVal;
              paramIdx++;
            }
          } else if (valueExpr.toUpperCase() === 'NULL') {
            existing[field] = null;
          } else if (valueExpr.toLowerCase() === 'version + 1') {
            existing[field] = (Number(existing[field]) || 0) + 1;
          } else {
            // Basic literal support (strings or numbers)
            let val = valueExpr.replace(/^'|'$/g, '');
            if (!isNaN(Number(val))) {
              const numVal = Number(val);
              if (field === 'isDeleted' || field === 'isPinned' || field === 'isCompleted') {
                existing[field] = numVal === 1;
              } else {
                existing[field] = numVal;
              }
            } else {
              existing[field] = val;
            }
          }
        }
        this.db.memos.set(id, { ...existing });
        console.log('InMemoryAdapter: Updated memo state', existing);
      }
    } else if (sqlLower.startsWith('update triggers')) {
      const id = params?.[params.length - 1];
      const existing = this.db.triggers.get(id);
      if (existing) {
        const setPart = sql.substring(sql.search(/SET/i) + 3, sql.search(/WHERE/i)).trim();
        const assignments = setPart.split(',').map(a => a.trim());
        let paramIdx = 0;
        for (const assignment of assignments) {
          const parts = assignment.split(/\s*=\s*/);
          const field = parts[0].trim();
          const valueExpr = parts[1].trim();
          if (valueExpr === '?') {
            if (params && paramIdx < params.length - 1) {
              existing[field] = params[paramIdx];
              paramIdx++;
            }
          } else if (valueExpr.toUpperCase() === 'NULL') {
            existing[field] = null;
          }
        }
        this.db.triggers.set(id, { ...existing });
      }
    } else if (sqlLower.startsWith('delete from memos')) {
      console.log('InMemoryAdapter: DELETE FROM memos', { sql, params });
      if (sqlLower.includes('where isdeleted = 1')) {
        // Empty trash
        let count = 0;
        for (const [id, memo] of this.db.memos) {
          if (memo.isDeleted === true || memo.isDeleted === 1) {
            this.db.memos.delete(id);
            count++;
            // Delete associated triggers
            for (const [tid, trigger] of this.db.triggers) {
              if (trigger.memoId === id) this.db.triggers.delete(tid);
            }
          }
        }
        console.log(`InMemoryAdapter: Emptied trash, removed ${count} memos`);
      } else {
        // Individual delete
        const id = params?.[0];
        if (id) {
          const result = this.db.memos.delete(id);
          console.log(`InMemoryAdapter: Permanently deleted memo ${id}, success: ${result}`);
          // Delete associated triggers
          for (const [tid, trigger] of this.db.triggers) {
            if (trigger.memoId === id) this.db.triggers.delete(tid);
          }
        } else {
          console.warn('InMemoryAdapter: DELETE FROM memos called without ID in params');
        }
      }
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
    } else if (sqlLower.startsWith('insert into tombstones') || sqlLower.startsWith('replace into tombstones')) {
      const [id, version, deletedAt] = params || [];
      this.db.tombstones.set(id, { id, version, deletedAt });
    } else if (sqlLower.startsWith('delete from tombstones')) {
      if (sqlLower.includes('where deletedat <')) {
        const timestamp = params?.[0];
        for (const [id, t] of this.db.tombstones) {
          if (new Date(t.deletedAt).getTime() < new Date(timestamp).getTime()) {
            this.db.tombstones.delete(id);
          }
        }
      } else {
        const id = params?.[0];
        if (id) this.db.tombstones.delete(id);
      }
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

      // 論理削除の考慮 (isDeleted フラグを使用)
      if (sqlLower.includes('isdeleted = 1')) {
        results = results.filter(m => m.isDeleted === true || m.isDeleted === 1);
      } else if (sqlLower.includes('isdeleted = 0')) {
        results = results.filter(m => m.isDeleted === false || m.isDeleted === 0 || m.isDeleted === undefined);
      } else if (sqlLower.includes('isdeleted = ?') && params) {
        // ? バインディングの処理 (簡易)
        const val = params.find(p => p !== undefined && typeof p === 'number');
        if (val === 1) results = results.filter(m => m.isDeleted === true || m.isDeleted === 1);
        else if (val === 0) results = results.filter(m => m.isDeleted === false || m.isDeleted === 0 || m.isDeleted === undefined);
      }
      // SQLにキーワードがない場合は、SQLiteの挙動に合わせて全件（削除済み含む）を返す

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

    if (sqlLower.includes('from tombstones')) {
      let results = Array.from(this.db.tombstones.values());
      if (sqlLower.includes('where id =')) {
        results = results.filter(t => t.id === params?.[0]);
      }
      return results as T[];
    }
    return [];
  }

  async clearDatabase(): Promise<void> {
    this.db.memos.clear();
    this.db.triggers.clear();
    this.db.locationPresets.clear();
    this.db.tombstones.clear();
    this.saveToStorage();
  }
}

let adapter: DatabaseAdapter | null = null;

export async function getDatabase(): Promise<DatabaseAdapter> {
  if (adapter) return adapter;
  if (Platform.OS === 'web') {
    adapter = new InMemoryAdapter();
  } else {
    const SQLite = require('expo-sqlite');
    const db = await SQLite.openDatabaseAsync('keepreminder.db');

    // Add version column if it doesn't exist
    await db.execAsync(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS memos (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT,
        content TEXT,
        blocks TEXT,
        color TEXT,
        isPinned INTEGER DEFAULT 0,
        todoType TEXT DEFAULT 'none',
        todoDate TEXT,
        isCompleted INTEGER DEFAULT 0,
        completedAt TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        deletedAt TEXT,
        version INTEGER DEFAULT 1,
        tag TEXT DEFAULT 'work',
        lastSyncedVersion INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS triggers (
        id TEXT PRIMARY KEY NOT NULL,
        memoId TEXT NOT NULL,
        type TEXT NOT NULL,
        isActive INTEGER DEFAULT 1,
        scheduledAt TEXT,
        durationSeconds INTEGER,
        startedAt TEXT,
        latitude REAL,
        longitude REAL,
        radius REAL,
        locationName TEXT,
        actionType TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        FOREIGN KEY (memoId) REFERENCES memos(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS location_presets (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        radius REAL NOT NULL,
        createdAt TEXT,
        updatedAt TEXT
      );
      CREATE TABLE IF NOT EXISTS tombstones (
        id TEXT PRIMARY KEY NOT NULL,
        version INTEGER NOT NULL,
        deletedAt TEXT NOT NULL
      );
    `);

    // Migration for existing tables: check if version and lastSyncedVersion column exists
    try {
      const dbAny = db as any;
      const tableCheck = await dbAny.getAllAsync("PRAGMA table_info(memos)");
      const columns = (tableCheck as any[]).map((col: any) => col.name);

      if (!columns.includes('version')) {
        console.log('Migrating: Adding version column to memos table');
        await db.execAsync('ALTER TABLE memos ADD COLUMN version INTEGER DEFAULT 1');
        await db.execAsync('UPDATE memos SET version = 1 WHERE version IS NULL');
      }

      if (!columns.includes('lastSyncedVersion')) {
        console.log('Migrating: Adding lastSyncedVersion column to memos table');
        await db.execAsync('ALTER TABLE memos ADD COLUMN lastSyncedVersion INTEGER DEFAULT 0');
        await db.execAsync('UPDATE memos SET lastSyncedVersion = 0 WHERE lastSyncedVersion IS NULL');
      }
      console.log('Migration check complete.');
    } catch (e) {
      console.error('Migration failed during column check/add:', e);
    }

    const sqliteDb = db as any;
    adapter = {
      runAsync: (sql: string, params?: any[]) => sqliteDb.runAsync(sql, params || []),
      getFirstAsync: (sql: string, params?: any[]) => sqliteDb.getFirstAsync(sql, params || []),
      getAllAsync: (sql: string, params?: any[]) => sqliteDb.getAllAsync(sql, params || []),
      clearDatabase: async () => {
        await sqliteDb.execAsync('DELETE FROM triggers; DELETE FROM memos; DELETE FROM location_presets; DELETE FROM tombstones;');
      }
    };
  }
  return adapter;
}

export async function closeDatabase(): Promise<void> {
  adapter = null;
}
