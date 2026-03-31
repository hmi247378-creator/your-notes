/**
 * Database utility for Cloudflare D1
 */

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  AI: any;
}

export type DbUser = {
  id: string;
  createdAt: string;
  nickname: string | null;
  email: string | null;
  passwordHash: string | null;
  wechatOpenId: string | null;
};

export type DbNote = {
  id: string;
  userId: string;
  contentMd: string;
  contentPlain: string;
  source: string;
  archived: number; // SQLite uses 0/1 for boolean
  recordedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  batchId: string | null;
};

export type DbTag = {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  parentId: string | null;
  path: string;
  depth: number;
  keywords: string | null; // JSON
  createdAt: string;
  updatedAt: string;
};

export type DbNoteTag = {
  noteId: string;
  tagId: string;
};

// Simple wrapper for D1 to handle common tasks
export const db = {
  async findUserByEmail(d1: D1Database, email: string): Promise<DbUser | null> {
    return d1.prepare('SELECT * FROM User WHERE email = ?').bind(email).first<DbUser>();
  },

  async findUserById(d1: D1Database, id: string): Promise<DbUser | null> {
    return d1.prepare('SELECT * FROM User WHERE id = ?').bind(id).first<DbUser>();
  },

  async createUser(d1: D1Database, data: Partial<DbUser>): Promise<void> {
    const { id, email, passwordHash, nickname } = data;
    await d1
      .prepare('INSERT INTO User (id, email, passwordHash, nickname) VALUES (?, ?, ?, ?)')
      .bind(id, email, passwordHash, nickname)
      .run();
  },

  async findNoteById(d1: D1Database, userId: string, noteId: string): Promise<DbNote | null> {
    return d1
      .prepare('SELECT * FROM Note WHERE id = ? AND userId = ? AND deletedAt IS NULL')
      .bind(noteId, userId)
      .first<DbNote>();
  },

  async findTagsByNoteId(d1: D1Database, noteId: string): Promise<string[]> {
    const { results } = await d1.prepare('SELECT tagId FROM NoteTag WHERE noteId = ?').bind(noteId).all<DbNoteTag>();
    return results.map((r) => r.tagId);
  },
};
