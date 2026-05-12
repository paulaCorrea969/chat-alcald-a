require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fileRoutes = require("./routes/files");
const { DEPENDENCIES, resolveRoomByRoomId } = require("./config/dependencies");
const {
  MAX_MESSAGES_PER_ROOM,
  getRoomHistory,
  appendRoomMessage,
  deleteRoomMessage,
  findRoomMessage,
} = require("./services/message-store");
const {
  MAX_AUDIT_EVENTS,
  appendAuditEvent,
  getAuditEvents,
} = require("./services/audit-store");
const {
  findUserByUsername,
  verifyPassword,
  maybeUpgradeUserPassword,
  migrateStoredUsersToHashes,
  createUser,
  changeUserPassword,
  updateStoredUserPassword,
  getManagedUsers,
  deleteUser,
} = require("./services/user-store");
const {
  authenticateRequest,
  getSessionFromToken,
  getTokenFromHeader,
  createSession,
  deleteSession,
} = require("./middleware/auth");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MAX_MESSAGE_LENGTH = 1000;
const onlineUsers = new Map();

migrateStoredUsersToHashes();

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

function buildPublicUser(user) {
  return {
    username: user.username,
    display: user.display,
    role: user.role,
    dependencyId: user.dependencyId,
    dependencyName: user.dependencyName,
    subdependencyId: user.subdependencyId,
    subdependencyName: user.subdependencyName,
    roomId: user.roomId,
    roomLabel: user.roomLabel,
  };
}

function writeAuditEvent(event) {
  try {
    appendAuditEvent(event);
  } catch (error) {
    console.error("No se pudo registrar auditoria:", error.message);
  }
}

function emitUsersUpdate(roomId) {
  const users = Array.from(onlineUsers.values())
    .filter((user) => user.roomId === roomId)
    .map((user) => ({
      display: user.display,
      role: user.role,
    }));

  io.to(roomId).emit("users:update", users);
}

function syncSocketRoom(socket, nextRoom) {
  const previousRoomId = socket.session.roomId;

  if (previousRoomId && previousRoomId !== nextRoom.roomId) {
    socket.leave(previousRoomId);
  }

  socket.session = {
    ...socket.session,
    ...nextRoom,
  };

  socket.join(nextRoom.roomId);

  onlineUsers.set(socket.id, {
    display: socket.session.display,
    role: socket.session.role,
    roomId: nextRoom.roomId,
  });

  if (previousRoomId && previousRoomId !== nextRoom.roomId) {
    emitUsersUpdate(previousRoomId);
  }

  emitUsersUpdate(nextRoom.roomId);

  return getRoomHistory(nextRoom.roomId);
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      ok: false,
      message: "Solo un administrador puede gestionar usuarios",
    });
  }

  next();
}

app.get("/api/dependencies", (req, res) => {
  return res.json({
    ok: true,
    dependencies: DEPENDENCIES,
  });
});

app.post("/api/register", authenticateRequest, requireAdmin, (req, res) => {
  try {
    const user = createUser({
      username: req.body?.username,
      display: req.body?.display,
      password: req.body?.password,
      dependencyId: req.body?.dependencyId,
      subdependencyId: req.body?.subdependencyId,
      role: "funcionario",
    });

    writeAuditEvent({
      type: "user.created",
      actorUsername: req.user.username,
      actorDisplay: req.user.display,
      actorRole: req.user.role,
      roomId: req.user.roomId,
      roomLabel: req.user.roomLabel,
      targetUsername: user.username,
      targetDisplay: user.display,
      summary: `Usuario creado en ${user.roomLabel}`,
      meta: {
        dependencyName: user.dependencyName,
        subdependencyName: user.subdependencyName,
      },
    });

    return res.status(201).json({
      ok: true,
      message: "Usuario creado correctamente",
      user: buildPublicUser(user),
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message: error.message || "No se pudo crear el usuario",
    });
  }
});

app.post("/api/login", (req, res) => {
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "").trim();
  const user = findUserByUsername(username);

  if (!user || !verifyPassword(user, password)) {
    return res.status(401).json({
      ok: false,
      message: "Usuario o contrasena incorrectos",
    });
  }

  const safeUser = maybeUpgradeUserPassword(user, password) || user;
  const publicUser = buildPublicUser(safeUser);
  const session = createSession(publicUser);

  return res.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: publicUser,
  });
});

app.post("/api/logout", (req, res) => {
  const token = getTokenFromHeader(req.headers.authorization);

  if (token) {
    deleteSession(token);
  }

  return res.json({ ok: true });
});

app.get("/api/me", authenticateRequest, (req, res) => {
  return res.json({
    ok: true,
    user: req.user,
  });
});

app.get("/api/users", authenticateRequest, requireAdmin, (req, res) => {
  return res.json({
    ok: true,
    users: getManagedUsers(),
  });
});

app.post("/api/change-password", authenticateRequest, (req, res) => {
  try {
    changeUserPassword(
      req.user.username,
      req.body?.currentPassword,
      req.body?.newPassword
    );

    writeAuditEvent({
      type: "user.password_changed",
      actorUsername: req.user.username,
      actorDisplay: req.user.display,
      actorRole: req.user.role,
      roomId: req.user.roomId,
      roomLabel: req.user.roomLabel,
      targetUsername: req.user.username,
      targetDisplay: req.user.display,
      summary: "Usuario cambio su contrasena",
    });

    return res.json({
      ok: true,
      message: "Contrasena actualizada correctamente",
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message: error.message || "No se pudo cambiar la contrasena",
    });
  }
});

app.get("/api/audit", authenticateRequest, requireAdmin, (req, res) => {
  const limit = req.query.limit;

  return res.json({
    ok: true,
    maxEvents: MAX_AUDIT_EVENTS,
    events: getAuditEvents(limit),
  });
});

app.delete("/api/users/:username", authenticateRequest, requireAdmin, (req, res) => {
  const username = String(req.params.username || "").trim().toLowerCase();

  if (username === req.user.username) {
    return res.status(400).json({
      ok: false,
      message: "No puedes eliminar tu propia cuenta mientras estas en sesion",
    });
  }

  try {
    const targetUser = findUserByUsername(username);
    deleteUser(username);

    writeAuditEvent({
      type: "user.deleted",
      actorUsername: req.user.username,
      actorDisplay: req.user.display,
      actorRole: req.user.role,
      roomId: req.user.roomId,
      roomLabel: req.user.roomLabel,
      targetUsername: username,
      targetDisplay: targetUser?.display || "",
      summary: "Usuario eliminado por administrador",
      meta: {
        targetRoomLabel: targetUser?.roomLabel || "",
      },
    });

    return res.json({
      ok: true,
      message: "Usuario eliminado correctamente",
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message: error.message || "No se pudo eliminar el usuario",
    });
  }
});

app.post("/api/users/:username/reset-password", authenticateRequest, requireAdmin, (req, res) => {
  const username = String(req.params.username || "").trim().toLowerCase();
  const newPassword = String(req.body?.newPassword || "").trim();

  try {
    const targetUser = findUserByUsername(username);

    if (!targetUser) {
      throw new Error("El usuario no existe");
    }

    updateStoredUserPassword(username, newPassword);

    writeAuditEvent({
      type: "user.password_reset",
      actorUsername: req.user.username,
      actorDisplay: req.user.display,
      actorRole: req.user.role,
      roomId: req.user.roomId,
      roomLabel: req.user.roomLabel,
      targetUsername: username,
      targetDisplay: targetUser.display,
      summary: "Administrador restablecio una contrasena",
    });

    return res.json({
      ok: true,
      message: "Contrasena restablecida correctamente",
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message: error.message || "No se pudo restablecer la contrasena",
    });
  }
});

app.use("/api/files", fileRoutes);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const userSession = getSessionFromToken(token);

  if (!userSession) {
    return next(new Error("NO_AUTH"));
  }

  socket.session = userSession;
  next();
});

io.on("connection", (socket) => {
  const { display, role, roomId } = socket.session;
  socket.join(roomId);
  const roomHistory = getRoomHistory(roomId);
  socket.emit("chat:history", roomHistory);

  onlineUsers.set(socket.id, {
    display,
    role,
    roomId,
  });

  emitUsersUpdate(roomId);
  io.to(roomId).emit("system:message", `${display} se conecto`);

  socket.on("chat:message", (text) => {
    const { username, display, role, roomId } = socket.session;
    const cleanText = String(text || "").trim().slice(0, MAX_MESSAGE_LENGTH);

    if (!cleanText) {
      return;
    }

    const timestamp = new Date();
    const messageData = appendRoomMessage(roomId, {
      username,
      user: display,
      role,
      roomId,
      text: cleanText,
      time: timestamp.toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      createdAt: timestamp.toISOString(),
    });

    io.to(roomId).emit("chat:message", messageData);
  });

  socket.on("chat:delete-message", (messageId) => {
    const { username, display, role, roomId } = socket.session;
    const existingMessage = findRoomMessage(roomId, messageId);

    if (!existingMessage) {
      socket.emit("chat:error", "El mensaje ya no existe");
      return;
    }

    const canDelete =
      existingMessage.username === username || role === "admin";

    if (!canDelete) {
      socket.emit("chat:error", "No tienes permiso para eliminar ese mensaje");
      return;
    }

    const deletedMessage = deleteRoomMessage(roomId, messageId);

    if (!deletedMessage) {
      socket.emit("chat:error", "No se pudo eliminar el mensaje");
      return;
    }

    writeAuditEvent({
      type: "message.deleted",
      actorUsername: username,
      actorDisplay: display,
      actorRole: role,
      roomId,
      roomLabel: socket.session.roomLabel,
      targetUsername: deletedMessage.username,
      targetDisplay: deletedMessage.user,
      summary: "Mensaje eliminado para todos",
      meta: {
        messageId: deletedMessage.id,
        preview: deletedMessage.text.slice(0, 120),
      },
    });

    io.to(roomId).emit("chat:message-deleted", {
      id: deletedMessage.id,
      deletedBy: display,
    });
  });

  socket.on("admin:switch-room", (payload) => {
    if (socket.session.role !== "admin") {
      socket.emit("chat:error", "Solo el administrador puede cambiar de sala");
      return;
    }

    const roomId = String(payload?.roomId || "").trim();
    const nextRoom = resolveRoomByRoomId(roomId);

    if (!nextRoom) {
      socket.emit("chat:error", "La sala seleccionada no existe");
      return;
    }

    const history = syncSocketRoom(socket, nextRoom);

    writeAuditEvent({
      type: "admin.room_switched",
      actorUsername: socket.session.username,
      actorDisplay: socket.session.display,
      actorRole: socket.session.role,
      roomId: nextRoom.roomId,
      roomLabel: nextRoom.roomLabel,
      summary: "Administrador cambio de sala activa",
    });

    socket.emit("admin:room-switched", {
      room: nextRoom,
      history,
    });
  });

  socket.on("disconnect", () => {
    const { roomId } = socket.session;
    onlineUsers.delete(socket.id);
    emitUsersUpdate(roomId);
    io.to(roomId).emit("system:message", `${display} salio`);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);
  console.log(`Historial persistente activo con limite de ${MAX_MESSAGES_PER_ROOM} mensajes por sala`);
  console.log(`Auditoria activa con limite de ${MAX_AUDIT_EVENTS} eventos`);
});
