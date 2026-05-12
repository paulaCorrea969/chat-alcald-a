const crypto = require("crypto");
const { db } = require("./database");

const MAX_MESSAGES_PER_ROOM = Number(process.env.CHAT_MAX_MESSAGES_PER_ROOM || 5000);

function normalizeMessage(message) {
  return {
    id: String(message.id || crypto.randomUUID()).trim(),
    username: String(message.username || "").trim().toLowerCase(),
    user: String(message.user || message.userDisplay || "").trim(),
    role: String(message.role || "funcionario").trim(),
    roomId: String(message.roomId || "").trim(),
    text: String(message.text || "").trim(),
    time: String(message.time || message.timeLabel || "").trim(),
    createdAt: String(message.createdAt || new Date().toISOString()).trim(),
  };
}

function getRoomHistory(roomId) {
  const normalizedRoomId = String(roomId || "").trim();
  const rows = db.prepare(`
    SELECT id, room_id AS roomId, username, user_display AS userDisplay,
           role, text, time_label AS timeLabel, created_at AS createdAt
    FROM messages
    WHERE room_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(normalizedRoomId);

  return rows.map(normalizeMessage);
}

function trimRoomMessages(roomId) {
  const count = db.prepare(`
    SELECT COUNT(*) AS total
    FROM messages
    WHERE room_id = ?
  `).get(roomId).total;

  if (count <= MAX_MESSAGES_PER_ROOM) {
    return;
  }

  const overflow = count - MAX_MESSAGES_PER_ROOM;
  db.prepare(`
    DELETE FROM messages
    WHERE id IN (
      SELECT id
      FROM messages
      WHERE room_id = ?
      ORDER BY created_at ASC, id ASC
      LIMIT ?
    )
  `).run(roomId, overflow);
}

function appendRoomMessage(roomId, message) {
  const normalizedRoomId = String(roomId || "").trim();
  const nextMessage = normalizeMessage({
    ...message,
    roomId: normalizedRoomId,
  });

  db.prepare(`
    INSERT INTO messages (id, room_id, username, user_display, role, text, time_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextMessage.id,
    nextMessage.roomId,
    nextMessage.username,
    nextMessage.user,
    nextMessage.role,
    nextMessage.text,
    nextMessage.time,
    nextMessage.createdAt
  );

  trimRoomMessages(normalizedRoomId);
  return nextMessage;
}

function deleteRoomMessage(roomId, messageId) {
  const existing = findRoomMessage(roomId, messageId);

  if (!existing) {
    return null;
  }

  db.prepare("DELETE FROM messages WHERE id = ? AND room_id = ?").run(existing.id, existing.roomId);
  return existing;
}

function findRoomMessage(roomId, messageId) {
  const normalizedRoomId = String(roomId || "").trim();
  const normalizedMessageId = String(messageId || "").trim();
  const row = db.prepare(`
    SELECT id, room_id AS roomId, username, user_display AS userDisplay,
           role, text, time_label AS timeLabel, created_at AS createdAt
    FROM messages
    WHERE room_id = ? AND id = ?
  `).get(normalizedRoomId, normalizedMessageId);

  return row ? normalizeMessage(row) : null;
}

module.exports = {
  MAX_MESSAGES_PER_ROOM,
  getRoomHistory,
  appendRoomMessage,
  deleteRoomMessage,
  findRoomMessage,
};
