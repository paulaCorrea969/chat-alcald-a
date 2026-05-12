const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  resolveRoom,
  resolveRoomByRoomId,
  buildRoomId,
} = require("../config/dependencies");

const tempDir = path.resolve(__dirname, "tmp");
const dbPath = path.join(tempDir, "chat-alcaldia-test.sqlite");

fs.mkdirSync(tempDir, { recursive: true });
process.env.CHAT_DB_PATH = dbPath;
process.env.CHAT_SKIP_JSON_MIGRATION = "1";

const { db } = require("../services/database");
const userStore = require("../services/user-store");
const messageStore = require("../services/message-store");
const auditStore = require("../services/audit-store");

function resetDatabase() {
  db.exec(`
    DELETE FROM users;
    DELETE FROM messages;
    DELETE FROM audit_events;
  `);
}

test.beforeEach(() => {
  resetDatabase();
});

test("resolveRoom construye la sala correctamente", () => {
  const room = resolveRoom("secretaria-general-gobierno", "contratacion");

  assert.ok(room);
  assert.equal(room.roomId, "secretaria-general-gobierno__contratacion");
  assert.match(room.roomLabel, /Contratacion/);
});

test("resolveRoomByRoomId encuentra la sala por identificador", () => {
  const roomId = buildRoomId("hacienda-credito-publico", "tesoreria");
  const room = resolveRoomByRoomId(roomId);

  assert.ok(room);
  assert.equal(room.dependencyId, "hacienda-credito-publico");
  assert.equal(room.subdependencyId, "tesoreria");
});

test("resolveRoomByRoomId devuelve null para una sala inexistente", () => {
  assert.equal(resolveRoomByRoomId("sala-invalida"), null);
});

test("createUser crea usuario y verifyPassword valida hash", () => {
  const user = userStore.createUser({
    username: "prueba_user",
    display: "Prueba User",
    password: "clave123",
    dependencyId: "secretaria-general-gobierno",
    subdependencyId: "contratacion",
    role: "funcionario",
  });

  assert.equal(user.username, "prueba_user");
  assert.equal(user.role, "funcionario");
  assert.equal(userStore.verifyPassword(user, "clave123"), true);
  assert.equal(userStore.verifyPassword(user, "otra-clave"), false);
});

test("changeUserPassword actualiza la contrasena del usuario", () => {
  userStore.createUser({
    username: "cambio_pwd",
    display: "Cambio Pwd",
    password: "inicial123",
    dependencyId: "secretaria-general-gobierno",
    subdependencyId: "contratacion",
    role: "funcionario",
  });

  userStore.changeUserPassword("cambio_pwd", "inicial123", "nueva123");
  const updatedUser = userStore.findUserByUsername("cambio_pwd");

  assert.equal(userStore.verifyPassword(updatedUser, "nueva123"), true);
  assert.equal(userStore.verifyPassword(updatedUser, "inicial123"), false);
});

test("appendRoomMessage y findRoomMessage operan sobre SQLite", () => {
  const created = messageStore.appendRoomMessage("room-test", {
    username: "autor",
    user: "Autor",
    role: "funcionario",
    text: "Mensaje de prueba",
    time: "08:30",
    createdAt: new Date().toISOString(),
  });

  const history = messageStore.getRoomHistory("room-test");
  const found = messageStore.findRoomMessage("room-test", created.id);

  assert.equal(history.length, 1);
  assert.equal(found.id, created.id);
  assert.equal(found.text, "Mensaje de prueba");
});

test("deleteRoomMessage elimina un mensaje existente", () => {
  const created = messageStore.appendRoomMessage("room-delete", {
    username: "autor",
    user: "Autor",
    role: "funcionario",
    text: "Mensaje a borrar",
    time: "09:00",
    createdAt: new Date().toISOString(),
  });

  const deleted = messageStore.deleteRoomMessage("room-delete", created.id);
  const history = messageStore.getRoomHistory("room-delete");

  assert.equal(deleted.id, created.id);
  assert.equal(history.length, 0);
});

test("appendAuditEvent y getAuditEvents registran eventos", () => {
  auditStore.appendAuditEvent({
    type: "user.created",
    actorUsername: "admin",
    actorDisplay: "Administrador",
    summary: "Usuario creado en la sala",
    roomLabel: "Secretaria general y de gobierno / Contratacion",
  });

  const events = auditStore.getAuditEvents(10);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "user.created");
  assert.match(events[0].summary, /Usuario creado/);
});
