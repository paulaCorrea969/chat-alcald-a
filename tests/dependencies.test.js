const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveRoom,
  resolveRoomByRoomId,
  buildRoomId,
} = require("../config/dependencies");

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
