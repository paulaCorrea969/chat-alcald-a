const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const { DatabaseSync } = require("node:sqlite");

const dataDir = path.resolve(__dirname, "../data");
const databasePath = process.env.CHAT_DB_PATH
  ? path.resolve(process.env.CHAT_DB_PATH)
  : path.join(dataDir, "chat-alcaldia.sqlite");
const usersJsonPath = path.join(dataDir, "users.json");
const messagesJsonPath = path.join(dataDir, "messages.json");
const auditJsonPath = path.join(dataDir, "audit-log.json");
const PASSWORD_SALT_ROUNDS = Number(process.env.CHAT_PASSWORD_SALT_ROUNDS || 10);
const skipJsonMigration = process.env.CHAT_SKIP_JSON_MIGRATION === "1";

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    display TEXT NOT NULL,
    role TEXT NOT NULL,
    dependency_id TEXT NOT NULL,
    subdependency_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    username TEXT NOT NULL,
    user_display TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    time_label TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_room_created
  ON messages (room_id, created_at);

  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    actor_username TEXT,
    actor_display TEXT,
    actor_role TEXT,
    room_id TEXT,
    room_label TEXT,
    target_username TEXT,
    target_display TEXT,
    summary TEXT NOT NULL,
    meta_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_audit_created
  ON audit_events (created_at);
`);

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function readJsonObject(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function hashLegacyPassword(password) {
  return bcrypt.hashSync(String(password || ""), PASSWORD_SALT_ROUNDS);
}

function runInTransaction(work) {
  db.exec("BEGIN");

  try {
    work();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateUsersFromJsonIfNeeded() {
  const count = db.prepare("SELECT COUNT(*) AS total FROM users").get().total;

  if (count > 0) {
    return;
  }

  const users = readJsonArray(usersJsonPath);
  const insert = db.prepare(`
    INSERT INTO users (username, display, role, dependency_id, subdependency_id, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  runInTransaction(() => {
    for (const user of users) {
      const username = String(user.username || "").trim().toLowerCase();
      const display = String(user.display || "").trim();
      const role = user.role === "admin" ? "admin" : "funcionario";
      const dependencyId = String(user.dependencyId || "").trim();
      const subdependencyId = String(user.subdependencyId || "").trim();
      const passwordHash = String(user.passwordHash || "").trim() || hashLegacyPassword(user.password || "");

      if (!username || !display || !dependencyId || !subdependencyId || !passwordHash) {
        continue;
      }

      insert.run(username, display, role, dependencyId, subdependencyId, passwordHash);
    }
  });
}

function migrateMessagesFromJsonIfNeeded() {
  const count = db.prepare("SELECT COUNT(*) AS total FROM messages").get().total;

  if (count > 0) {
    return;
  }

  const roomMap = readJsonObject(messagesJsonPath);
  const insert = db.prepare(`
    INSERT INTO messages (id, room_id, username, user_display, role, text, time_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  runInTransaction(() => {
    for (const [roomId, messages] of Object.entries(roomMap)) {
      if (!Array.isArray(messages)) {
        continue;
      }

      for (const message of messages) {
        const id = String(message.id || "").trim();
        const username = String(message.username || "").trim().toLowerCase();
        const userDisplay = String(message.user || "").trim();
        const role = String(message.role || "funcionario").trim();
        const text = String(message.text || "").trim();
        const timeLabel = String(message.time || "").trim();
        const createdAt = String(message.createdAt || new Date().toISOString()).trim();

        if (!id || !roomId || !userDisplay || !text || !timeLabel) {
          continue;
        }

        insert.run(id, roomId, username, userDisplay, role, text, timeLabel, createdAt);
      }
    }
  });
}

function migrateAuditFromJsonIfNeeded() {
  const count = db.prepare("SELECT COUNT(*) AS total FROM audit_events").get().total;

  if (count > 0) {
    return;
  }

  const events = readJsonArray(auditJsonPath);
  const insert = db.prepare(`
    INSERT INTO audit_events (
      id, type, created_at, actor_username, actor_display, actor_role,
      room_id, room_label, target_username, target_display, summary, meta_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  runInTransaction(() => {
    for (const event of events) {
      const id = String(event.id || "").trim();
      const type = String(event.type || "system.event").trim();
      const createdAt = String(event.createdAt || new Date().toISOString()).trim();
      const summary = String(event.summary || "").trim();

      if (!id || !summary) {
        continue;
      }

      insert.run(
        id,
        type,
        createdAt,
        String(event.actorUsername || "").trim().toLowerCase(),
        String(event.actorDisplay || "").trim(),
        String(event.actorRole || "").trim(),
        String(event.roomId || "").trim(),
        String(event.roomLabel || "").trim(),
        String(event.targetUsername || "").trim().toLowerCase(),
        String(event.targetDisplay || "").trim(),
        summary,
        JSON.stringify(event.meta && typeof event.meta === "object" ? event.meta : {})
      );
    }
  });
}

if (!skipJsonMigration) {
  migrateUsersFromJsonIfNeeded();
  migrateMessagesFromJsonIfNeeded();
  migrateAuditFromJsonIfNeeded();
}

module.exports = {
  db,
  databasePath,
};
