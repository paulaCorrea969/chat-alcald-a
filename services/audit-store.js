const crypto = require("crypto");
const { db } = require("./database");

const MAX_AUDIT_EVENTS = Number(process.env.CHAT_MAX_AUDIT_EVENTS || 2000);

function appendAuditEvent(input) {
  const nextEvent = {
    id: crypto.randomUUID(),
    type: String(input.type || "system.event").trim(),
    createdAt: new Date().toISOString(),
    actorUsername: String(input.actorUsername || "").trim().toLowerCase(),
    actorDisplay: String(input.actorDisplay || "").trim(),
    actorRole: String(input.actorRole || "").trim(),
    roomId: String(input.roomId || "").trim(),
    roomLabel: String(input.roomLabel || "").trim(),
    targetUsername: String(input.targetUsername || "").trim().toLowerCase(),
    targetDisplay: String(input.targetDisplay || "").trim(),
    summary: String(input.summary || "").trim(),
    meta: input.meta && typeof input.meta === "object" ? input.meta : {},
  };

  db.prepare(`
    INSERT INTO audit_events (
      id, type, created_at, actor_username, actor_display, actor_role,
      room_id, room_label, target_username, target_display, summary, meta_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextEvent.id,
    nextEvent.type,
    nextEvent.createdAt,
    nextEvent.actorUsername,
    nextEvent.actorDisplay,
    nextEvent.actorRole,
    nextEvent.roomId,
    nextEvent.roomLabel,
    nextEvent.targetUsername,
    nextEvent.targetDisplay,
    nextEvent.summary,
    JSON.stringify(nextEvent.meta)
  );

  db.prepare(`
    DELETE FROM audit_events
    WHERE id IN (
      SELECT id
      FROM audit_events
      ORDER BY created_at DESC, id DESC
      LIMIT -1 OFFSET ?
    )
  `).run(MAX_AUDIT_EVENTS);

  return nextEvent;
}

function getAuditEvents(limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const rows = db.prepare(`
    SELECT id, type, created_at AS createdAt, actor_username AS actorUsername,
           actor_display AS actorDisplay, actor_role AS actorRole,
           room_id AS roomId, room_label AS roomLabel,
           target_username AS targetUsername, target_display AS targetDisplay,
           summary, meta_json AS metaJson
    FROM audit_events
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(safeLimit);

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    createdAt: row.createdAt,
    actorUsername: row.actorUsername,
    actorDisplay: row.actorDisplay,
    actorRole: row.actorRole,
    roomId: row.roomId,
    roomLabel: row.roomLabel,
    targetUsername: row.targetUsername,
    targetDisplay: row.targetDisplay,
    summary: row.summary,
    meta: (() => {
      try {
        return JSON.parse(row.metaJson || "{}");
      } catch (error) {
        return {};
      }
    })(),
  }));
}

module.exports = {
  MAX_AUDIT_EVENTS,
  appendAuditEvent,
  getAuditEvents,
};
