/**
 * MSAM — Multi-Scale Associative Memory
 *
 * Three memory scales layered on top of the existing better-sqlite3 DB:
 *   Scale 1: Immediate — recent messages (handled by ConversationStore / chat.js)
 *   Scale 2: Episodic  — one LLM-generated summary per conversation
 *   Scale 3: Semantic  — TF-IDF inverted keyword index across all conversations
 *
 * Also provides a lightweight "working memory" K/V store for persistent facts.
 *
 * No extra npm packages required — pure better-sqlite3 + fetch to local llama-server.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EpisodicEntry {
  conversation_id: string;
  summary: string;
  token_count: number;
  updated_at: string;
}

export interface SemanticHit {
  conversation_id: string;
  summary: string;
  score: number;
}

export interface MemoryContext {
  injected: boolean;
  block: string; // The assembled system-prompt block
  episodicHits: number;
  semanticHits: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Very simple English stop-word set. */
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','was','are','were','be','been','being','have','has','had','do','does',
  'did','will','would','could','should','may','might','shall','can','i','you',
  'he','she','it','we','they','me','him','her','us','them','my','your','his',
  'her','its','our','their','this','that','these','those','what','which','who',
  'how','when','where','why','not','no','so','if','then','than','as','by',
  'from','up','about','into','through','after','before','between','same',
]);

/** Tokenise text into lower-cased words, filtering stop-words and short tokens. */
function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

/** Compute TF for a list of tokens. Returns Map<term, tf>. */
function computeTF(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const len = tokens.length || 1;
  const tf = new Map<string, number>();
  for (const [term, count] of freq) tf.set(term, count / len);
  return tf;
}

// ── MsamStore ─────────────────────────────────────────────────────────────────

export class MsamStore {
  private db: Database.Database;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'conversations.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  // ── Schema ───────────────────────────────────────────────────────────────────

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodic_memory (
        conversation_id TEXT PRIMARY KEY
                        REFERENCES conversations(id) ON DELETE CASCADE,
        summary         TEXT    NOT NULL DEFAULT '',
        token_count     INTEGER NOT NULL DEFAULT 0,
        updated_at      TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS semantic_index (
        term            TEXT NOT NULL,
        conversation_id TEXT NOT NULL
                        REFERENCES conversations(id) ON DELETE CASCADE,
        tf_idf          REAL NOT NULL,
        PRIMARY KEY (term, conversation_id)
      );

      CREATE INDEX IF NOT EXISTS idx_semantic_term
        ON semantic_index(term);

      CREATE TABLE IF NOT EXISTS working_memory (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  // ── Scale 2: Episodic ────────────────────────────────────────────────────────

  upsertEpisodic(conversationId: string, summary: string): void {
    const now = new Date().toISOString();
    const approxTokens = Math.ceil(summary.length / 4);
    this.db.prepare(`
      INSERT INTO episodic_memory (conversation_id, summary, token_count, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        summary     = excluded.summary,
        token_count = excluded.token_count,
        updated_at  = excluded.updated_at
    `).run(conversationId, summary, approxTokens, now);
  }

  getEpisodic(conversationId: string): EpisodicEntry | undefined {
    return this.db.prepare(
      `SELECT * FROM episodic_memory WHERE conversation_id = ?`
    ).get(conversationId) as EpisodicEntry | undefined;
  }

  /** Return summaries for all conversations EXCEPT the current one. */
  getAllEpisodicExcept(conversationId: string): EpisodicEntry[] {
    return this.db.prepare(
      `SELECT e.* FROM episodic_memory e
       JOIN conversations c ON c.id = e.conversation_id
       WHERE e.conversation_id != ?
       AND e.summary != ''
       ORDER BY c.updated_at DESC
       LIMIT 20`
    ).all(conversationId) as EpisodicEntry[];
  }

  // ── Scale 3: Semantic Index ──────────────────────────────────────────────────

  /**
   * Build / refresh the TF-IDF index for a conversation.
   * Call this after each assistant reply (fire-and-forget).
   */
  indexConversation(conversationId: string, fullText: string): void {
    const tokens = tokenise(fullText);
    if (tokens.length === 0) return;

    const tf = computeTF(tokens);

    // We use a simplistic IDF: log(1 + totalDocs / (1 + docsWithTerm))
    // For a local app with small doc counts, this is good enough.
    const totalDocs = (this.db.prepare(
      `SELECT COUNT(*) as n FROM episodic_memory`
    ).get() as { n: number }).n + 1;

    const insertStmt = this.db.prepare(`
      INSERT INTO semantic_index (term, conversation_id, tf_idf)
      VALUES (?, ?, ?)
      ON CONFLICT(term, conversation_id) DO UPDATE SET tf_idf = excluded.tf_idf
    `);

    const deleteOld = this.db.prepare(
      `DELETE FROM semantic_index WHERE conversation_id = ?`
    );

    const upsertBatch = this.db.transaction(() => {
      deleteOld.run(conversationId);
      for (const [term, tfVal] of tf) {
        const docsWithTerm = (this.db.prepare(
          `SELECT COUNT(DISTINCT conversation_id) as n FROM semantic_index WHERE term = ?`
        ).get(term) as { n: number }).n;
        const idf = Math.log(1 + totalDocs / (1 + docsWithTerm));
        insertStmt.run(term, conversationId, tfVal * idf);
      }
    });

    upsertBatch();
  }

  /**
   * Return the top-K conversations most semantically similar to a query string.
   * Returns hits sorted by descending relevance score, excluding currentConvId.
   */
  semanticSearch(query: string, currentConversationId: string, topK = 5): SemanticHit[] {
    const tokens = tokenise(query);
    if (tokens.length === 0) return [];

    // Score = sum of tf_idf weights for terms that appear in each conversation
    const placeholders = tokens.map(() => '?').join(', ');
    const rows = this.db.prepare(`
      SELECT si.conversation_id,
             SUM(si.tf_idf) AS score,
             COALESCE(em.summary, '')  AS summary
      FROM   semantic_index si
      LEFT JOIN episodic_memory em ON em.conversation_id = si.conversation_id
      WHERE  si.term IN (${placeholders})
        AND  si.conversation_id != ?
      GROUP BY si.conversation_id
      ORDER BY score DESC
      LIMIT ?
    `).all(...tokens, currentConversationId, topK) as Array<{
      conversation_id: string; score: number; summary: string;
    }>;

    return rows.map(r => ({
      conversation_id: r.conversation_id,
      summary: r.summary,
      score: r.score,
    }));
  }

  // ── Working Memory ────────────────────────────────────────────────────────────

  setWorking(key: string, value: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO working_memory (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, now);
  }

  getWorking(key: string): string | null {
    const row = this.db.prepare(
      `SELECT value FROM working_memory WHERE key = ?`
    ).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  getAllWorking(): Record<string, string> {
    const rows = this.db.prepare(
      `SELECT key, value FROM working_memory ORDER BY updated_at DESC`
    ).all() as Array<{ key: string; value: string }>;
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  // ── LLM Summarisation ─────────────────────────────────────────────────────────

  /**
   * Fire-and-forget: call the local llama-server to summarise the conversation
   * and store the result in episodic_memory + rebuild semantic index.
   *
   * Should be called after each assistant reply.
   */
  async summariseConversation(
    conversationId: string,
    messages: Array<{ role: string; content: string }>,
    serverPort: number
  ): Promise<void> {
    if (messages.length < 2) return; // Nothing to summarise yet

    const transcript = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n')
      .slice(0, 8000); // Hard cap to avoid huge prompts

    const prompt = [
      {
        role: 'system',
        content:
          'You are a memory summariser. Given a conversation transcript, write a SHORT (3-5 sentence) factual summary capturing the key topics, decisions, and any user facts (name, preferences, goals). Be dense and concrete. Output ONLY the summary, no preamble.',
      },
      { role: 'user', content: `Transcript:\n\n${transcript}` },
    ];

    try {
      const res = await fetch(`http://127.0.0.1:${serverPort}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: prompt,
          stream: false,
          temperature: 0.3,
          max_tokens: 200,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) return;
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const summary = data.choices?.[0]?.message?.content?.trim() ?? '';
      if (!summary) return;

      this.upsertEpisodic(conversationId, summary);

      // Rebuild semantic index: use the summary (dense) + a window of recent messages
      const indexText = summary + '\n' + transcript.slice(0, 4000);
      this.indexConversation(conversationId, indexText);

      console.log(`[MSAM] Episodic summary stored for ${conversationId.slice(0, 8)}…`);
    } catch (err) {
      // Non-fatal — if server is restarting or busy, skip silently
      console.warn('[MSAM] Summarisation skipped:', (err as Error).message);
    }
  }

  // ── Main Entry: Assemble MSAM Context Block ────────────────────────────────

  /**
   * Build the full MSAM context injection block for prepending to a prompt.
   *
   * @param userQuery       The user's latest message (used for semantic search)
   * @param conversationId  Current conversation ID (excluded from cross-conv search)
   */
  getMemoryContext(userQuery: string, conversationId: string): MemoryContext {
    const parts: string[] = [];

    // ── Working memory ────────────────────────────────────────
    const working = this.getAllWorking();
    const workingEntries = Object.entries(working);
    if (workingEntries.length > 0) {
      const wm = workingEntries.map(([k, v]) => `• ${k}: ${v}`).join('\n');
      parts.push(`[Working Memory]\n${wm}`);
    }

    // ── Episodic: summary of CURRENT conversation ─────────────
    const currentEpisodic = this.getEpisodic(conversationId);
    if (currentEpisodic?.summary) {
      parts.push(`[Current Conversation Summary]\n${currentEpisodic.summary}`);
    }

    // ── Semantic: relevant past conversations ──────────────────
    const semanticHits = this.semanticSearch(userQuery, conversationId, 3);
    const validHits = semanticHits.filter(h => h.summary);
    if (validHits.length > 0) {
      const hitLines = validHits
        .map((h, i) => `${i + 1}. ${h.summary}`)
        .join('\n');
      parts.push(`[Related Past Conversations]\n${hitLines}`);
    }

    if (parts.length === 0) {
      return { injected: false, block: '', episodicHits: 0, semanticHits: 0 };
    }

    const block =
      '=== LONG-TERM MEMORY (MSAM) ===\n' +
      parts.join('\n\n') +
      '\n=== END MEMORY ===';

    return {
      injected: true,
      block,
      episodicHits: currentEpisodic?.summary ? 1 : 0,
      semanticHits: validHits.length,
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
