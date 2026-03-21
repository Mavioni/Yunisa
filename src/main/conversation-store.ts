import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export interface Conversation {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export class ConversationStore {
  private db: Database.Database;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'conversations.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'New Chat',
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages(conversation_id, created_at);
    `);
  }

  list(): Conversation[] {
    return this.db.prepare(
      'SELECT * FROM conversations ORDER BY updated_at DESC'
    ).all() as Conversation[];
  }

  get(id: string): Conversation | undefined {
    return this.db.prepare(
      'SELECT * FROM conversations WHERE id = ?'
    ).get(id) as Conversation | undefined;
  }

  create(model: string): Conversation {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO conversations (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, 'New Chat', model, now, now);
    return { id, title: 'New Chat', model, created_at: now, updated_at: now };
  }

  addMessage(conversationId: string, role: string, content: string): Message {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, conversationId, role, content, now);

    this.db.prepare(
      'UPDATE conversations SET updated_at = ? WHERE id = ?'
    ).run(now, conversationId);

    const msgCount = (this.db.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?'
    ).get(conversationId) as { count: number }).count;

    if (msgCount === 1 && role === 'user') {
      const title = content.length > 50 ? content.substring(0, 47) + '...' : content;
      this.db.prepare(
        'UPDATE conversations SET title = ? WHERE id = ?'
      ).run(title, conversationId);
    }

    return { id, conversation_id: conversationId, role: role as Message['role'], content, created_at: now };
  }

  getMessages(conversationId: string): Message[] {
    return this.db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).all(conversationId) as Message[];
  }

  updateTitle(id: string, title: string): void {
    this.db.prepare(
      'UPDATE conversations SET title = ? WHERE id = ?'
    ).run(title, id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  deleteAll(): void {
    this.db.prepare('DELETE FROM conversations').run();
  }

  close(): void {
    this.db.close();
  }
}
