/**
 * Builddy SaaS Scaffold — Database Module
 * SQLite with users, subscriptions, usage_tracking tables, WAL mode, and CRUD helpers.
 *
 * Modification Points:
 *   // {{SCHEMA_INSERTION_POINT}}  — Add CREATE TABLE statements here
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "app.db");
let _db = null;

export function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    console.log(`[db] SQLite database opened at ${DB_PATH} (WAL mode)`);
  }
  return _db;
}

export function initSchema() {
  const db = getDb();

  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
    name TEXT DEFAULT '', role TEXT DEFAULT 'user', api_key TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);`);

  db.exec(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, plan TEXT DEFAULT 'free',
    status TEXT DEFAULT 'active', stripe_id TEXT, current_period_start DATETIME,
    current_period_end DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);`);

  db.exec(`CREATE TABLE IF NOT EXISTS usage_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, metric TEXT NOT NULL,
    value INTEGER DEFAULT 1, date TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_tracking(user_id, date);`);

  db.exec(`CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);`);

  db.exec(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL,
    content TEXT DEFAULT '', mode TEXT DEFAULT 'creative', tone REAL DEFAULT 0.5,
    style REAL DEFAULT 0.5, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id)
  );`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);`);

  db.exec(`CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
  );`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_document ON conversations(document_id);`);

  db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL, content TEXT NOT NULL, token_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);`);

  db.exec(`CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE,
    primary_use_case TEXT DEFAULT 'creative', daily_word_goal INTEGER DEFAULT 500,
    default_tone TEXT DEFAULT 'balanced', onboarding_complete INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS writing_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, date TEXT NOT NULL,
    words_written INTEGER DEFAULT 0, streak_count INTEGER DEFAULT 0,
    total_words INTEGER DEFAULT 0, UNIQUE(user_id, date),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_stats_user_date ON writing_stats(user_id, date);`);

  db.exec(`CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, mode TEXT NOT NULL,
    description TEXT, content TEXT NOT NULL, is_default INTEGER DEFAULT 1
  );`);

  // {{SCHEMA_INSERTION_POINT}}
  // Add your CREATE TABLE statements above this line.

  // Seed default templates
  const tmplCount = db.prepare("SELECT COUNT(*) as c FROM templates").get().c;
  if (tmplCount === 0) {
    const insertTmpl = db.prepare("INSERT INTO templates (name, mode, description, content, is_default) VALUES (?,?,?,?,?)");
    const defaults = [
      ["Creative Fiction Opening", "creative", "A captivating opening paragraph for a story", "The morning light crept through the curtains like a reluctant confession, painting shadows on the wall that seemed to tell their own story. She paused at the window, coffee growing cold in her hands, watching the world below with the kind of intensity that suggests either profound wisdom or beautiful madness.", 1],
      ["Academic Paper Structure", "academic", "A structured introduction for a research paper", "## Introduction\n\nIn recent years, the field of [subject] has undergone significant transformation. This paper examines [topic] through the lens of [framework], addressing three key questions:\n\n1. What are the primary factors influencing [phenomenon]?\n2. How do these factors interact with [variable]?\n3. What implications does this hold for [stakeholders]?\n\nBy synthesizing existing literature with novel analysis, we aim to contribute to the ongoing discourse surrounding [topic].", 1],
      ["Professional Email Format", "email", "A polished professional email template", "Subject: [Clear, Actionable Subject Line]\n\nDear [Recipient],\n\nI hope this message finds you well. I'm writing to [state purpose clearly and concisely].\n\n[Main content — 2-3 short paragraphs addressing the key points]\n\nWould you be available [specific ask with timeframe]? I'm happy to work around your schedule.\n\nThank you for your time and consideration.\n\nBest regards,\n[Your Name]", 1],
      ["Blog Post Outline", "blog", "A structured blog post with engaging sections", "# [Compelling Title That Promises Value]\n\n*An opening hook that connects with the reader's pain point or curiosity.*\n\n## The Problem\n[Why this matters right now]\n\n## The Solution\n[Your unique take — 3-5 actionable insights]\n\n### Key Insight #1\n[Explanation with example]\n\n### Key Insight #2\n[Explanation with example]\n\n## The Takeaway\n[Summary + clear next step for the reader]", 1],
      ["Social Media Hooks", "social", "Attention-grabbing hooks for social posts", "🔥 [Bold claim or surprising statistic]\n\nHere's what nobody tells you about [topic]:\n\n→ [First insight]\n→ [Second insight]\n→ [Third insight]\n\nThe third one changed everything for me.\n\nWhat's your experience? Drop a 👇 if you agree.\n\n#[relevant] #[hashtags]"
    ];
    for (const t of defaults) insertTmpl.run(...t);
  }

  console.log("[db] Schema initialised.");
}

export function getAll(table, orderCol = "id") { return getDb().prepare(`SELECT * FROM ${table} ORDER BY ${orderCol}`).all(); }
export function getById(table, id) { return getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id); }
export function getWhere(table, filters, orderCol = "id") {
  const cols = Object.keys(filters); const vals = Object.values(filters);
  return getDb().prepare(`SELECT * FROM ${table} WHERE ${cols.map(c => `${c} = ?`).join(" AND ")} ORDER BY ${orderCol}`).all(...vals);
}
export function getOneWhere(table, filters) {
  const cols = Object.keys(filters); const vals = Object.values(filters);
  return getDb().prepare(`SELECT * FROM ${table} WHERE ${cols.map(c => `${c} = ?`).join(" AND ")} LIMIT 1`).get(...vals);
}
export function create(table, data) {
  const cols = Object.keys(data); const vals = Object.values(data);
  const info = getDb().prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...vals);
  return getById(table, info.lastInsertRowid);
}
export function update(table, id, data) {
  const cols = Object.keys(data); const vals = Object.values(data);
  getDb().prepare(`UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...vals, id);
  return getById(table, id);
}
export function deleteRow(table, id) { return getDb().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes > 0; }

// --- Inkwell helper functions ---

export function getDocumentsByUser(userId) {
  return getDb().prepare(
    "SELECT id, title, mode, tone, style, content, created_at, updated_at FROM documents WHERE user_id = ? ORDER BY updated_at DESC"
  ).all(userId);
}

export function getDocumentWithConversation(docId) {
  const doc = getDb().prepare("SELECT * FROM documents WHERE id = ?").get(docId);
  if (!doc) return null;
  const conv = getDb().prepare("SELECT * FROM conversations WHERE document_id = ? ORDER BY created_at DESC LIMIT 1").get(docId);
  let messages = [];
  if (conv) {
    messages = getDb().prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC").all(conv.id);
  }
  return { ...doc, conversation: conv || null, messages };
}

export function getWritingStats(userId, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return getDb().prepare(
    "SELECT date, words_written, streak_count, total_words FROM writing_stats WHERE user_id = ? AND date >= ? ORDER BY date ASC"
  ).all(userId, since);
}

export function upsertDailyStats(userId, date, wordsAdded) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM writing_stats WHERE user_id = ? AND date = ?").get(userId, date);
  if (existing) {
    db.prepare("UPDATE writing_stats SET words_written = words_written + ?, total_words = total_words + ? WHERE id = ?")
      .run(wordsAdded, wordsAdded, existing.id);
  } else {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const prev = db.prepare("SELECT streak_count FROM writing_stats WHERE user_id = ? AND date = ?").get(userId, yesterday);
    const streak = prev ? prev.streak_count + 1 : 1;
    const totalRow = db.prepare("SELECT MAX(total_words) as t FROM writing_stats WHERE user_id = ?").get(userId);
    const total = (totalRow?.t || 0) + wordsAdded;
    db.prepare("INSERT INTO writing_stats (user_id, date, words_written, streak_count, total_words) VALUES (?,?,?,?,?)")
      .run(userId, date, wordsAdded, streak, total);
  }
}

export function getActiveConversation(docId) {
  const db = getDb();
  let conv = db.prepare("SELECT * FROM conversations WHERE document_id = ? ORDER BY created_at DESC LIMIT 1").get(docId);
  if (!conv) {
    const info = db.prepare("INSERT INTO conversations (document_id) VALUES (?)").run(docId);
    conv = db.prepare("SELECT * FROM conversations WHERE id = ?").get(info.lastInsertRowid);
  }
  return conv;
}

export function trackUsage(userId, metric, value = 1) {
  const db = getDb(); const today = new Date().toISOString().slice(0, 10);
  const existing = db.prepare(`SELECT * FROM usage_tracking WHERE user_id = ? AND metric = ? AND date = ?`).get(userId, metric, today);
  if (existing) db.prepare(`UPDATE usage_tracking SET value = value + ? WHERE id = ?`).run(value, existing.id);
  else db.prepare(`INSERT INTO usage_tracking (user_id, metric, value, date) VALUES (?, ?, ?, ?)`).run(userId, metric, value, today);
}

export function getUsage(userId, metric, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return getDb().prepare(`SELECT date, SUM(value) as total FROM usage_tracking WHERE user_id = ? AND metric = ? AND date >= ? GROUP BY date ORDER BY date`).all(userId, metric, since);
}

export function closeDb() { if (_db) { _db.close(); _db = null; console.log("[db] Database connection closed."); } }
process.on("SIGINT", () => { closeDb(); process.exit(0); });
process.on("SIGTERM", () => { closeDb(); process.exit(0); });