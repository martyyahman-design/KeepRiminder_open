import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

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

// SQLite database (native only)
let db: any = null;

async function initSQLite(): Promise<any> {
  console.log('db.native.ts: Opening SQLite database...');
  // データリセットのため、データベースファイル名を変更
  const database = await SQLite.openDatabaseAsync('keepreminder_v2.db');

  // Disable WAL and foreign keys temporarily for debugging
  // await database.execAsync('PRAGMA journal_mode = WAL;');
  // await database.execAsync('PRAGMA foreign_keys = ON;');
  await database.execAsync('PRAGMA foreign_keys = OFF;');

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS memos (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'default',
      isPinned INTEGER NOT NULL DEFAULT 0,
      todoType TEXT NOT NULL DEFAULT 'none',
      todoDate TEXT,
      isCompleted INTEGER NOT NULL DEFAULT 0,
      completedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT,
      blocks TEXT,
      tag TEXT NOT NULL DEFAULT 'work',
      version INTEGER NOT NULL DEFAULT 1,
      lastSyncedVersion INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS triggers (
      id TEXT PRIMARY KEY NOT NULL,
      memoId TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('datetime', 'timer', 'location_enter', 'location_exit')),
      isActive INTEGER NOT NULL DEFAULT 1,
      scheduledAt TEXT,
      durationSeconds INTEGER,
      startedAt TEXT,
      latitude REAL,
      longitude REAL,
      radius REAL,
      locationName TEXT,
      actionType TEXT NOT NULL DEFAULT 'notification' CHECK(actionType IN ('notification', 'alarm')),
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (memoId) REFERENCES memos(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS location_presets (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius REAL NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tombstones (
      id TEXT PRIMARY KEY NOT NULL,
      version INTEGER NOT NULL,
      deletedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_triggers_memoId ON triggers(memoId);
    CREATE INDEX IF NOT EXISTS idx_triggers_type ON triggers(type);
    CREATE INDEX IF NOT EXISTS idx_triggers_isActive ON triggers(isActive);
  `);

  // Proper migration for native SQLite
  const tableInfo = await database.getAllAsync('PRAGMA table_info(memos)') as { name: string }[];

  const hasBlocks = tableInfo.some(col => col.name === 'blocks');
  if (!hasBlocks) {
    try {
      await database.execAsync('ALTER TABLE memos ADD COLUMN blocks TEXT');
      console.log('Migration: Added blocks column to memos table');
    } catch (err) {
      console.warn('Migration failed (blocks):', err);
    }
  }

  const hasTag = tableInfo.some(col => col.name === 'tag');
  if (!hasTag) {
    try {
      await database.execAsync("ALTER TABLE memos ADD COLUMN tag TEXT NOT NULL DEFAULT 'work'");
      console.log('Migration: Added tag column to memos table');
    } catch (err) {
      console.warn('Migration failed (tag):', err);
    }
  }

  const hasVersion = tableInfo.some(col => col.name === 'version');
  if (!hasVersion) {
    try {
      await database.execAsync('ALTER TABLE memos ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
      console.log('Migration: Added version column to memos table');
    } catch (err) {
      console.warn('Migration failed (version):', err);
    }
  }

  const hasLastSyncedVersion = tableInfo.some(col => col.name === 'lastSyncedVersion');
  if (!hasLastSyncedVersion) {
    try {
      await database.execAsync('ALTER TABLE memos ADD COLUMN lastSyncedVersion INTEGER NOT NULL DEFAULT 0');
      console.log('Migration: Added lastSyncedVersion column to memos table');
    } catch (err) {
      console.warn('Migration failed (lastSyncedVersion):', err);
    }
  }

  return database;
}

export interface DatabaseAdapter {
  runAsync(sql: string, params?: any[]): Promise<any>;
  getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null>;
  getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]>;
  clearDatabase(): Promise<void>;
}

// In-memory adapter for Web
class InMemoryAdapter implements DatabaseAdapter {
  private db: InMemoryDB;

  constructor() {
    this.db = getInMemoryDB();
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
          } else if (valueExpr.toLowerCase() === 'version + 1') {
            existing[field] = (Number(existing[field]) || 0) + 1;
          } else {
            // Basic literal support
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
      console.log('InMemoryDB: Deleting memo', { sql, params });
      if (sqlLower.includes('where isdeleted = 1')) {
        for (const [id, memo] of this.db.memos) {
          if (memo.isDeleted === true || memo.isDeleted === 1) {
            this.db.memos.delete(id);
            for (const [tid, trigger] of this.db.triggers) {
              if (trigger.memoId === id) this.db.triggers.delete(tid);
            }
          }
        }
      } else {
        const id = params?.[0];
        if (id) {
          this.db.memos.delete(id);
          const triggersToDelete: string[] = [];
          for (const [tid, trigger] of this.db.triggers) {
            if (trigger.memoId === id) triggersToDelete.push(tid);
          }
          triggersToDelete.forEach(tid => this.db.triggers.delete(tid));
        }
      }
    } else if (sqlLower.startsWith('delete from triggers')) {
      if (sqlLower.includes('memoid')) {
        const memoId = params?.[0];
        console.log('InMemoryDB: Deleting all triggers for memo', memoId);
        const triggersToDelete: string[] = [];
        for (const [tid, trigger] of this.db.triggers) {
          if (trigger.memoId === memoId) triggersToDelete.push(tid);
        }
        triggersToDelete.forEach(tid => this.db.triggers.delete(tid));
      } else {
        const id = params?.[0];
        console.log('InMemoryDB: Deleting trigger', id);
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
      // SQLにキーワードがない場合は、SQLiteの挙動に合わせて全件を返す

      // Handle WHERE clause
      if (sqlLower.includes('where id =')) {
        results = results.filter(m => m.id === params?.[0]);
      } else if (sqlLower.includes('where title like')) {
        const query = params?.[0]?.replace(/%/g, '') || '';
        results = results.filter(m =>
          m.title?.toLowerCase().includes(query.toLowerCase()) ||
          m.content?.toLowerCase().includes(query.toLowerCase())
        );
      }

      // Handle ORDER BY
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
  }
}

// SQLite adapter for native
class SQLiteAdapter implements DatabaseAdapter {
  private database: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.database = database;
  }

  async runAsync(sql: string, params?: any[]): Promise<any> {
    console.log(`SQLiteAdapter.runAsync: ${sql}`, params);
    const statement = await this.database.prepareAsync(sql);
    try {
      const result = await statement.executeAsync(params || []);
      console.log(`SQLiteAdapter.runAsync success: ${sql}`);
      return result;
    } catch (err) {
      console.error(`SQLiteAdapter.runAsync error [${sql}]:`, err);
      throw err;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null> {
    console.log(`SQLiteAdapter.getFirstAsync: ${sql}`, params);
    const statement = await this.database.prepareAsync(sql);
    try {
      const result = await statement.executeAsync<T>(params || []);
      const first = await result.getFirstAsync();
      return first;
    } catch (err) {
      console.error(`SQLiteAdapter.getFirstAsync error [${sql}]:`, err);
      throw err;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]> {
    console.log(`SQLiteAdapter.getAllAsync: ${sql}`, params);
    const statement = await this.database.prepareAsync(sql);
    try {
      const result = await statement.executeAsync<T>(params || []);
      const all = await result.getAllAsync();
      return all;
    } catch (err) {
      console.error(`SQLiteAdapter.getAllAsync error [${sql}]:`, err);
      throw err;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async clearDatabase(): Promise<void> {
    await this.database.execAsync(`
      DELETE FROM triggers;
      DELETE FROM memos;
      DELETE FROM location_presets;
    `);
  }
}

let adapter: DatabaseAdapter | null = null;
let initPromise: Promise<DatabaseAdapter> | null = null;

export async function getDatabase(): Promise<DatabaseAdapter> {
  console.log('db.native.ts: getDatabase called');
  if (adapter) return adapter;
  if (initPromise) {
    console.log('db.native.ts: Returning existing initPromise');
    return initPromise;
  }

  initPromise = (async () => {
    try {
      if (Platform.OS === 'web') {
        adapter = new InMemoryAdapter();
      } else {
        const sqliteDb = await initSQLite();
        db = sqliteDb;
        adapter = new SQLiteAdapter(sqliteDb);
      }
      return adapter;
    } finally {
      // Clear the promise once initialization is completed or failed
      initPromise = null;
    }
  })();

  return initPromise;
}

export async function closeDatabase(): Promise<void> {
  if (db && Platform.OS !== 'web') {
    await db.closeAsync();
    db = null;
  }
  adapter = null;
}
