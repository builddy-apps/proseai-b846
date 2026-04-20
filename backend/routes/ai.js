/**
 * Builddy AI-Tool Scaffold — AI Proxy Route
 * OpenAI-compatible API proxy with streaming SSE, prompt templates,
 * token counting, and per-user rate limiting.
 *
 * Modified for Inkwell: writing modes, tone/style, conversation memory, message persistence.
 */

import { Router } from "express";
import { getOneWhere, trackUsage, getUsage, getActiveConversation, create, getDb } from "../db.js";
import { requireAuth } from "../middleware.js";

const router = Router();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1";
const API_KEY = process.env.OPENAI_API_KEY || "";
const DEFAULT_MODEL = "gpt-3.5-turbo";
const MAX_TOKENS_PER_USER_DAILY = 100_000;
const AI_RATE_LIMIT_PER_MIN = 20;

const aiRateLimits = new Map();

// ---------------------------------------------------------------------------
// Writing Mode System Prompts
// ---------------------------------------------------------------------------

const WRITING_MODES = {
  creative: "You are a creative writing partner. Help with narrative, dialogue, world-building, character development, and storytelling craft. Be imaginative and encouraging.",
  academic: "You are an academic writing assistant. Help with thesis development, citations, formal structure, research methodology, and scholarly tone. Prioritize evidence-based reasoning.",
  professional: "You are a professional writing assistant. Help with emails, proposals, reports, memos, and business documents. Be clear, concise, and action-oriented.",
  blog: "You are a blog writing partner. Help with headlines, structure, engagement, SEO optimization, and reader retention. Suggest compelling hooks and clear formatting.",
  social: "You are a social media writing assistant. Keep content concise, suggest hooks and hashtags, optimize for platform-specific constraints, and drive engagement.",
};

function buildToneGuidance(tone) {
  const t = parseFloat(tone);
  if (isNaN(t)) return "";
  if (t <= 0.25) return "Keep the tone very casual and conversational, like chatting with a friend.";
  if (t <= 0.5) return "Use a relaxed, friendly tone that's approachable but not overly formal.";
  if (t <= 0.75) return "Maintain a balanced, semi-formal tone — professional but not stiff.";
  return "Use a formal, polished tone appropriate for professional or academic audiences.";
}

function buildStyleGuidance(style) {
  const s = parseFloat(style);
  if (isNaN(s)) return "";
  if (s <= 0.25) return "Be very concise — get straight to the point with minimal elaboration.";
  if (s <= 0.5) return "Keep responses moderately concise with brief supporting details.";
  if (s <= 0.75) return "Provide descriptive responses with good detail and examples where helpful.";
  return "Be very descriptive — elaborate fully with rich detail, examples, and thorough explanations.";
}

function buildSystemPrompt(writingMode, tone, style) {
  const mode = writingMode && WRITING_MODES[writingMode] ? writingMode : "creative";
  let system = WRITING_MODES[mode];
  const toneGuidance = buildToneGuidance(tone);
  const styleGuidance = buildStyleGuidance(style);
  if (toneGuidance) system += " " + toneGuidance;
  if (styleGuidance) system += " " + styleGuidance;
  return system;
}

// ---------------------------------------------------------------------------
// Token Counting (rough estimate: ~4 chars per token)
// ---------------------------------------------------------------------------

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function countMessagesTokens(messages) {
  return messages.reduce((total, msg) => total + estimateTokens(msg.content) + 4, 0);
}

// ---------------------------------------------------------------------------
// Per-User AI Rate Limiting
// ---------------------------------------------------------------------------

function checkAiRateLimit(userId) {
  const now = Date.now();
  if (!aiRateLimits.has(userId)) aiRateLimits.set(userId, { timestamps: [] });
  const entry = aiRateLimits.get(userId);
  entry.timestamps = entry.timestamps.filter((t) => now - t < 60_000);
  if (entry.timestamps.length >= AI_RATE_LIMIT_PER_MIN) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: AI_RATE_LIMIT_PER_MIN - entry.timestamps.length - 1 };
}

// ---------------------------------------------------------------------------
// Get API Key (per-user from DB or global)
// ---------------------------------------------------------------------------

function getApiKey(userId) {
  if (!userId) return API_KEY;
  try {
    const user = getOneWhere("users", { id: userId });
    if (user?.ai_api_key) return user.ai_api_key;
  } catch {}
  return API_KEY;
}

// ---------------------------------------------------------------------------
// Save message to DB and update word count
// ---------------------------------------------------------------------------

function saveMessage(conversationId, role, content, tokenCount) {
  try {
    create("messages", {
      conversation_id: conversationId,
      role,
      content,
      tokens: tokenCount || estimateTokens(content),
    });
  } catch (err) {
    console.error("[ai] Failed to save message:", err.message);
  }
}

function updateDocumentWordCount(conversationId, addedContent) {
  try {
    const db = getDb();
    const conv = db.prepare("SELECT document_id FROM conversations WHERE id = ?").get(conversationId);
    if (!conv?.document_id) return;
    const wordCount = (addedContent || "").split(/\s+/).filter(Boolean).length;
    if (wordCount > 0) {
      db.prepare("UPDATE documents SET word_count = word_count + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(wordCount, conv.document_id);
    }
  } catch (err) {
    console.error("[ai] Failed to update word count:", err.message);
  }
}

// ---------------------------------------------------------------------------
// POST /chat — AI Chat Endpoint (supports streaming via SSE)
// ---------------------------------------------------------------------------

router.post("/chat", requireAuth, async (req, res) => {
  try {
    const { messages, model, temperature, stream, writing_mode, tone, style, conversation_id } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: "Messages array is required" });
    }

    // Check rate limit
    const rateCheck = checkAiRateLimit(req.user.userId);
    if (!rateCheck.allowed) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ success: false, error: "AI rate limit exceeded. Max 20 requests/minute." });
    }

    // Check daily token budget
    const usageRows = getUsage(req.user.userId, "ai_tokens", 1);
    const todayUsage = usageRows.length > 0 ? usageRows[0].total : 0;
    const estimatedTokens = countMessagesTokens(messages);
    if (todayUsage + estimatedTokens > MAX_TOKENS_PER_USER_DAILY) {
      return res.status(429).json({
        success: false,
        error: `Daily token limit exceeded (${MAX_TOKENS_PER_USER_DAILY}). Used: ${todayUsage}`,
      });
    }

    // Build dynamic system prompt from writing mode, tone, style
    const systemPrompt = buildSystemPrompt(writing_mode, tone, style);
    let finalMessages = [{ role: "system", content: systemPrompt }];

    // Fetch conversation context (last 20 messages)
    if (conversation_id) {
      try {
        const convData = getActiveConversation(conversation_id);
        if (convData?.messages?.length) {
          const contextMsgs = convData.messages.slice(-20);
          finalMessages.push(...contextMsgs.map((m) => ({ role: m.role, content: m.content })));
        }
      } catch (err) {
        console.error("[ai] Failed to load conversation context:", err.message);
      }
    }

    // Append current user messages
    finalMessages.push(...messages);

    const apiKey = getApiKey(req.user.userId);
    if (!apiKey) {
      return res.status(500).json({ success: false, error: "AI API key not configured" });
    }

    const useModel = model || DEFAULT_MODEL;
    const useTemp = Math.max(0, Math.min(2, parseFloat(temperature) || 0.7));
    const shouldStream = stream !== false;

    // Track rate limit
    aiRateLimits.get(req.user.userId).timestamps.push(Date.now());

    // Save user message
    const userContent = messages.map((m) => m.content).join("\n");
    if (conversation_id) {
      saveMessage(conversation_id, "user", userContent, estimateTokens(userContent));
    }

    const requestBody = {
      model: useModel,
      messages: finalMessages,
      temperature: useTemp,
      max_tokens: 2048,
      stream: shouldStream,
    };

    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[ai] API error ${response.status}: ${errorData}`);
      return res.status(response.status).json({ success: false, error: `AI API error: ${response.status}` });
    }

    // Track token usage
    trackUsage(req.user.userId, "ai_tokens", estimatedTokens);
    trackUsage(req.user.userId, "ai_requests", 1);

    if (shouldStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let totalContent = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") { res.write("data: [DONE]\n\n"); break; }
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || "";
                if (content) totalContent += content;
              } catch {}
              res.write(`${line}\n\n`);
            }
          }
        }
        trackUsage(req.user.userId, "ai_tokens", estimateTokens(totalContent));
        // Save assistant message and update word count
        if (conversation_id) {
          saveMessage(conversation_id, "assistant", totalContent, estimateTokens(totalContent));
          updateDocumentWordCount(conversation_id, totalContent);
        }
      } catch (err) {
        console.error("[ai] Stream error:", err);
      } finally {
        res.end();
      }
    } else {
      const data = await response.json();
      const assistantContent = data.choices?.[0]?.message?.content || "";
      const completionTokens = data.usage?.completion_tokens || estimateTokens(assistantContent);
      trackUsage(req.user.userId, "ai_tokens", completionTokens);
      // Save assistant message and update word count
      if (conversation_id) {
        saveMessage(conversation_id, "assistant", assistantContent, completionTokens);
        updateDocumentWordCount(conversation_id, assistantContent);
      }
      res.json({
        success: true,
        data: { message: data.choices?.[0]?.message, model: data.model, usage: data.usage },
      });
    }
  } catch (err) {
    console.error("[ai] Error:", err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /models — List available models
// ---------------------------------------------------------------------------

router.get("/models", requireAuth, async (_req, res) => {
  try {
    const apiKey = getApiKey(_req.user.userId);
    if (!apiKey) return res.status(500).json({ success: false, error: "AI API key not configured" });
    const response = await fetch(`${API_BASE_URL}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) return res.status(response.status).json({ success: false, error: `API error: ${response.status}` });
    const data = await response.json();
    res.json({ success: true, data: data.data || [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ---------------------------------------------------------------------------
// GET /usage — Get AI usage stats
// ---------------------------------------------------------------------------

router.get("/usage", requireAuth, (req, res) => {
  try {
    const tokens = getUsage(req.user.userId, "ai_tokens", 30);
    const requests = getUsage(req.user.userId, "ai_requests", 30);
    res.json({ success: true, data: { tokens, requests, dailyLimit: MAX_TOKENS_PER_USER_DAILY } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

export default router;