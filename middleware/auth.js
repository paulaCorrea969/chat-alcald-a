const crypto = require("crypto");

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

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

  const session = sessions.get(token);

  if (isExpired(session)) {
    sessions.delete(token);
    return null;
  }

  return session.user;
}

function createSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;

  sessions.set(token, {
    user,
    expiresAt,
  });

  return {
    token,
    expiresAt,
  };
}

function deleteSession(token) {
  sessions.delete(token);
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
  for (const [token, session] of sessions.entries()) {
    if (isExpired(session)) {
      sessions.delete(token);
    }
  }
}, 10 * 60 * 1000).unref();

module.exports = {
  authenticateRequest,
  getSessionFromToken,
  getTokenFromHeader,
  createSession,
  deleteSession,
};
