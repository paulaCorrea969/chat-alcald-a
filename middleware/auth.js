const crypto = require("crypto");
const { db } = require("../services/database");

const SESSION_TTL_MS = Number(process.env.CHAT_SESSION_TTL_MS || 8 * 60 * 60 * 1000);

function getTokenFromHeader(authorization) {
  const auth = String(authorization || "");
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function isExpired(session) {
  return !session || session.expiresAt <= Date.now();
}

function getSessionFromToken(token) {
  if (!token) {
    return null;
  }

  const session = db.prepare(`
    SELECT user_json AS userJson, expires_at AS expiresAt
    FROM sessions
    WHERE token = ?
  `).get(token);

  if (isExpired(session)) {
    deleteSession(token);
    return null;
  }

  try {
    return JSON.parse(session.userJson);
  } catch (error) {
    deleteSession(token);
    return null;
  }
}

function createSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;

  db.prepare(`
    INSERT INTO sessions (token, user_json, expires_at)
    VALUES (?, ?, ?)
  `).run(token, JSON.stringify(user), expiresAt);

  return {
    token,
    expiresAt,
  };
}

function deleteSession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function authenticateRequest(req, res, next) {
  const token = getTokenFromHeader(req.headers.authorization);
  const user = getSessionFromToken(token);

  if (!user) {
    return res.status(401).json({
      ok: false,
      message: "No autorizado",
    });
  }

  req.user = user;
  req.token = token;
  next();
}

setInterval(() => {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
}, 10 * 60 * 1000).unref();

module.exports = {
  authenticateRequest,
  getSessionFromToken,
  getTokenFromHeader,
  createSession,
  deleteSession,
};
