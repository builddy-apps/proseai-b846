/**
 * Inkwell API Routes — Documents, preferences, templates, writing stats
 */

import { Router } from "express";
import {
  getDb, getById, create, update, deleteRow, getWhere, getOneWhere,
  getWritingStats, upsertDailyStats, getAll, getActiveConversation
} from "../db.js";
import { requireAuth } from "../middleware.js";

const router = Router();

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

// ═══════════════════════════════════════════════════════════════════════════
// Documents
// ═══════════════════════════════════════════════════════════════════════════

router.get("/documents", requireAuth, (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const db = getDb();
    let total, docs;
    if (req.query.search) {
      const q = `%${req.query.search}%`;
      total = db.prepare("SELECT COUNT(*) as c FROM documents WHERE user_id = ? AND title LIKE ?").get(req.user.userId, q);
      docs = db.prepare("SELECT * FROM documents WHERE user_id = ? AND title LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?").all(req.user.userId, q, limit, offset);
    } else {
      total = db.prepare("SELECT COUNT(*) as c FROM documents WHERE user_id = ?").get(req.user.userId);
      docs = db.prepare("SELECT * FROM documents WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?").all(req.user.userId, limit, offset);
    }
    res.json({ success: true, data: docs, pagination: { page, limit, total: total.c, pages: Math.ceil(total.c / limit) } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post("/documents", requireAuth, (req, res) => {
  try {
    const { title, mode, content } = req.body;
    const doc = create("documents", {
      user_id: req.user.userId, title: title || "Untitled",
      mode: mode || "creative", content: content || ""
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.get("/documents/:id/export", requireAuth, (req, res) => {
  try {
    const doc = getById("documents", req.params.id);
    if (!doc || doc.user_id !== req.user.userId) return res.status(404).json({ success: false, error: "Not found" });
    const fmt = req.query.format || "md";
    let content = doc.content || "";
    if (fmt === "txt") {
      content = content
        .replace(/```[\s\S]*?```/g, m => m.replace(/```\w*\n?/g, ""))
        .replace(/[#*_~`>\[\]()!|-]/g, "")
        .replace(/\n{3,}/g, "\n\n").trim();
    }
    res.json({ success: true, data: { title: doc.title, content, format: fmt } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get("/documents/:id", requireAuth, (req, res) => {
  try {
    const doc = getById("documents", req.params.id);
    if (!doc || doc.user_id !== req.user.userId) return res.status(404).json({ success: false, error: "Not found" });
    const conv = getActiveConversation(req.params.id);
    const db = getDb();
    const messages = conv
      ? db.prepare("SELECT * FROM (SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 50) sub ORDER BY created_at ASC").all(conv.id)
      : [];
    res.json({ success: true, data: { ...doc, messages } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put("/documents/:id", requireAuth, (req, res) => {
  try {
    const doc = getById("documents", req.params.id);
    if (!doc || doc.user_id !== req.user.userId) return res.status(404).json({ success: false, error: "Not found" });
    const up = {};
    for (const k of ["title", "content", "mode", "tone", "style"]) {
      if (req.body[k] !== undefined) up[k] = req.body[k];
    }
    const updated = update("documents", req.params.id, up);
    res.json({ success: true, data: updated });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.delete("/documents/:id", requireAuth, (req, res) => {
  try {
    const doc = getById("documents", req.params.id);
    if (!doc || doc.user_id !== req.user.userId) return res.status(404).json({ success: false, error: "Not found" });
    const db = getDb();
    db.prepare("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE document_id = ?)").run(req.params.id);
    db.prepare("DELETE FROM conversations WHERE document_id = ?").run(req.params.id);
    deleteRow("documents", req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// Preferences
// ═══════════════════════════════════════════════════════════════════════════

router.get("/preferences", requireAuth, (req, res) => {
  try {
    let prefs = getOneWhere("user_preferences", { user_id: req.user.userId });
    if (!prefs) {
      prefs = create("user_preferences", {
        user_id: req.user.userId, daily_goal: 500,
        default_tone: "balanced", default_mode: "creative", onboarding_complete: 0
      });
    }
    res.json({ success: true, data: prefs });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put("/preferences", requireAuth, (req, res) => {
  try {
    let prefs = getOneWhere("user_preferences", { user_id: req.user.userId });
    if (!prefs) prefs = create("user_preferences", { user_id: req.user.userId });
    const up = {};
    for (const k of ["daily_goal", "default_tone", "default_mode", "theme", "onboarding_complete"]) {
      if (req.body[k] !== undefined) up[k] = req.body[k];
    }
    const updated = update("user_preferences", prefs.id, up);
    res.json({ success: true, data: updated });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.post("/preferences/onboarding", requireAuth, (req, res) => {
  try {
    const { primary_use, daily_goal, default_tone } = req.body;
    let prefs = getOneWhere("user_preferences", { user_id: req.user.userId });
    if (!prefs) prefs = create("user_preferences", { user_id: req.user.userId });
    const updated = update("user_preferences", prefs.id, {
      primary_use,
      daily_goal: daily_goal || 500,
      default_tone: default_tone || "balanced",
      onboarding_complete: 1
    });
    res.json({ success: true, data: updated });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// Templates
// ═══════════════════════════════════════════════════════════════════════════

router.get("/templates", requireAuth, (req, res) => {
  try {
    const templates = req.query.mode
      ? getWhere("templates", { mode: req.query.mode })
      : getAll("templates");
    res.json({ success: true, data: templates });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// Writing Stats
// ═══════════════════════════════════════════════════════════════════════════

router.get("/stats", requireAuth, (req, res) => {
  try {
    const db = getDb();
    const uid = req.user.userId;
    const daily = getWritingStats(uid, 30) || [];
    const { total } = db.prepare("SELECT COALESCE(SUM(word_count),0) as total FROM writing_stats WHERE user_id = ?").get(uid);
    // Compute streaks from all writing dates
    const allDates = db.prepare("SELECT date FROM writing_stats WHERE user_id = ? AND word_count > 0 ORDER BY date").all(uid).map(r => r.date);
    const dateSet = new Set(allDates);
    // Current streak from today backwards
    let currentStreak = 0;
    const d = new Date(); d.setHours(0, 0, 0, 0);
    while (dateSet.has(d.toISOString().slice(0, 10))) {
      currentStreak++;
      d.setDate(d.getDate() - 1);
    }
    // Best streak from all history
    let bestStreak = 0, streak = 0, prev = null;
    for (const dt of allDates) {
      streak = (prev && (new Date(dt) - new Date(prev)) / 864e5 === 1) ? streak + 1 : 1;
      bestStreak = Math.max(bestStreak, streak);
      prev = dt;
    }
    res.json({ success: true, data: { daily, currentStreak, totalWords: total, bestStreak } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post("/stats/track", requireAuth, (req, res) => {
  try {
    const { words_added, date } = req.body;
    upsertDailyStats(req.user.userId, date || new Date().toISOString().slice(0, 10), words_added || 0);
    res.json({ success: true, message: "Tracked" });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

export default router;