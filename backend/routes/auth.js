/**
 * Builddy SaaS Scaffold — Auth Routes
 * JWT auth with access+refresh tokens, registration, login, token refresh.
 */

import crypto from "crypto";
import { Router } from "express";
import { getDb, create, getOneWhere, getById, trackUsage } from "../db.js";
import { requireAuth } from "../middleware.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "builddy-saas-secret-change-in-production";
const ACCESS_TOKEN_EXPIRY = 900;
const REFRESH_TOKEN_EXPIRY = 604800;
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_LEN = 32;

function hashPassword(password) {
  const salt = crypto.randomBytes(SCRYPT_SALT_LEN).toString("hex");
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt}:${derived.toString("hex")}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), crypto.scryptSync(password, salt, SCRYPT_KEYLEN));
  } catch { return false; }
}

function base64url(input) {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function createToken(payload, expiresIn = ACCESS_TOKEN_EXPIRY) {
  const now = Math.floor(Date.now() / 1000);
  const headerB64 = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadB64 = base64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresIn }));
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${headerB64}.${payloadB64}`).digest();
  return `${headerB64}.${payloadB64}.${base64url(sig)}`;
}

export function verifyToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h64, p64, s64] = parts;
    const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${h64}.${p64}`).digest();
    const actual = Buffer.from(s64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (!crypto.timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(p64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

function sanitizeUser(user) { if (!user) return null; const { password, api_key, ...safe } = user; return safe; }

router.post("/register", (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: "Email and password required" });
    if (password.length < 8) return res.status(400).json({ success: false, error: "Password must be 8+ characters" });
    if (getOneWhere("users", { email })) return res.status(409).json({ success: false, error: "Email already registered" });
    const user = create("users", { email, password: hashPassword(password), name: name || "", api_key: crypto.randomBytes(24).toString("hex") });
    create("subscriptions", { user_id: user.id, plan: "free", status: "active" });
    const accessToken = createToken({ userId: user.id, email: user.email });
    const refreshToken = crypto.randomBytes(48).toString("hex");
    create("refresh_tokens", { user_id: user.id, token: refreshToken, expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000).toISOString() });
    trackUsage(user.id, "auth.register");
    res.status(201).json({ success: true, data: { user: sanitizeUser(user), accessToken, refreshToken } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post("/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: "Email and password required" });
    const user = getOneWhere("users", { email });
    if (!user || !verifyPassword(password, user.password)) return res.status(401).json({ success: false, error: "Invalid credentials" });
    const accessToken = createToken({ userId: user.id, email: user.email });
    const refreshToken = crypto.randomBytes(48).toString("hex");
    create("refresh_tokens", { user_id: user.id, token: refreshToken, expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000).toISOString() });
    trackUsage(user.id, "auth.login");
    res.json({ success: true, data: { user: sanitizeUser(user), accessToken, refreshToken } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post("/refresh", (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ success: false, error: "Refresh token required" });
    const stored = getDb().prepare(`SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > datetime('now')`).get(refreshToken);
    if (!stored) return res.status(401).json({ success: false, error: "Invalid refresh token" });
    const user = getById("users", stored.user_id);
    if (!user) return res.status(401).json({ success: false, error: "User not found" });
    getDb().prepare("DELETE FROM refresh_tokens WHERE id = ?").run(stored.id);
    const newRt = crypto.randomBytes(48).toString("hex");
    create("refresh_tokens", { user_id: user.id, token: newRt, expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000).toISOString() });
    res.json({ success: true, data: { user: sanitizeUser(user), accessToken: createToken({ userId: user.id, email: user.email }), refreshToken: newRt } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post("/logout", requireAuth, (req, res) => {
  try { const { refreshToken } = req.body; if (refreshToken) getDb().prepare("DELETE FROM refresh_tokens WHERE token = ?").run(refreshToken); res.json({ success: true, message: "Logged out" }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get("/me", requireAuth, (req, res) => {
  try {
    const user = getById("users", req.user.userId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    const subscription = getOneWhere("subscriptions", { user_id: user.id });
    res.json({ success: true, data: { ...sanitizeUser(user), subscription } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

export default router;
