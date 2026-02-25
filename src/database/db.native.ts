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

// SQLite database (native only)
let db: any = null;

async function initSQLite(): Promise<any> {
  const SQLite = require('expo-sqlite');
  const database = await SQLite.openDatabaseAsync('keepreminder.db');
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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
      updatedAt TEXT NOT NULL
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

    CREATE INDEX IF NOT EXISTS idx_triggers_memoId ON triggers(memoId);
    CREATE INDEX IF NOT EXISTS idx_triggers_type ON triggers(type);
    CREATE INDEX IF NOT EXISTS idx_triggers_isActive ON triggers(isActive);
  `);
  return database;
}

export interface DatabaseAdapter {
  runAsync(sql: string, params?: any[]): Promise<any>;
  getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null>;
  getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]>;
}

// In-memory adapter for Web
class InMemoryAdapter implements DatabaseAdapter {
  private db: InMemoryDB;

  constructor() {
    this.db = getInMemoryDB();
  }

  async runAsync(sql: string, params?: any[]): Promise<any> {
    const sqlLower = sql.trim().toLowerCase();

    if (sqlLower.startsWith('insert into memos')) {
      const [id, title, content, color, isPinned, todoType, todoDate, isCompleted, completedAt, createdAt, updatedAt] = params || [];
      this.db.memos.set(id, { id, title, content, color, isPinned, todoType, todoDate, isCompleted, completedAt, createdAt, updatedAt });
    } else if (sqlLower.startsWith('insert into triggers')) {
      const [id, memoId, type, isActive, scheduledAt, durationSeconds, startedAt,
        latitude, longitude, radius, locationName, actionType, createdAt, updatedAt] = params || [];
      this.db.triggers.set(id, {
        id, memoId, type, isActive, scheduledAt, durationSeconds, startedAt,
        latitude, longitude, radius, locationName, actionType, createdAt, updatedAt,
      });
    } else if (sqlLower.startsWith('update memos')) {
      // Simple update - find and update by id (last param)
      const id = params?.[params.length - 1];
      const existing = this.db.memos.get(id);
      if (existing) {
        // Extract SET clause fields from params
        const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
        if (setMatch) {
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
        if (setMatch) {
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
      console.log('InMemoryDB: Deleting memo', id);
      this.db.memos.delete(id);
      // Delete associated triggers
      const triggersToDelete: string[] = [];
      for (const [tid, trigger] of this.db.triggers) {
        if (trigger.memoId === id) triggersToDelete.push(tid);
      }
      triggersToDelete.forEach(tid => this.db.triggers.delete(tid));
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

    return [];
  }
}

// SQLite adapter for native
class SQLiteAdapter implements DatabaseAdapter {
  private database: any;

  constructor(database: any) {
    this.database = database;
  }

  async runAsync(sql: string, params?: any[]): Promise<any> {
    return this.database.runAsync(sql, params || []);
  }

  async getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null> {
    return this.database.getFirstAsync(sql, params || []);
  }

  async getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]> {
    return this.database.getAllAsync(sql, params || []);
  }
}

let adapter: DatabaseAdapter | null = null;

export async function getDatabase(): Promise<DatabaseAdapter> {
  if (adapter) return adapter;

  if (Platform.OS === 'web') {
    adapter = new InMemoryAdapter();
  } else {
    const sqliteDb = await initSQLite();
    db = sqliteDb;
    adapter = new SQLiteAdapter(sqliteDb);
  }

  return adapter;
}

export async function closeDatabase(): Promise<void> {
  if (db && Platform.OS !== 'web') {
    await db.closeAsync();
    db = null;
  }
  adapter = null;
}
