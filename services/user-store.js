const bcrypt = require("bcrypt");
const { db } = require("./database");
const { resolveRoom } = require("../config/dependencies");

const PASSWORD_SALT_ROUNDS = Number(process.env.CHAT_PASSWORD_SALT_ROUNDS || 10);
const isProduction = process.env.NODE_ENV === "production";

function getSeedPassword(envName, fallback) {
  const configuredPassword = process.env[envName];

  if (configuredPassword) {
    return configuredPassword;
  }

  if (isProduction) {
    throw new Error(`Configura ${envName} antes de iniciar en produccion`);
  }

  return fallback;
}

const seededUsers = [
  {
    username: "admin",
    password: getSeedPassword("CHAT_PASSWORD_ADMIN", "Admin#Pacora2026!"),
    display: "Administrador",
    role: "admin",
    dependencyId: "secretaria-general-gobierno",
    subdependencyId: "contratacion",
  },
];

function hashPassword(password) {
  return bcrypt.hashSync(String(password || ""), PASSWORD_SALT_ROUNDS);
}

function buildUserRecord(rawUser) {
  const room = resolveRoom(rawUser.dependencyId, rawUser.subdependencyId);

  if (!room) {
    return null;
  }

  return {
    username: String(rawUser.username || "").trim().toLowerCase(),
    passwordHash: String(rawUser.passwordHash || "").trim(),
    passwordLegacy: String(rawUser.password || ""),
    display: String(rawUser.display || "").trim(),
    role: rawUser.role === "admin" ? "admin" : "funcionario",
    ...room,
  };
}

function getStoredUsers() {
  const rows = db.prepare(`
    SELECT username, display, role, dependency_id AS dependencyId,
           subdependency_id AS subdependencyId, password_hash AS passwordHash
    FROM users
  `).all();

  return rows.map(buildUserRecord).filter(Boolean);
}

function getUsers() {
  const userMap = new Map();

  seededUsers.forEach((seededUser) => {
    const user = buildUserRecord(seededUser);

    if (user) {
      userMap.set(user.username, user);
    }
  });

  getStoredUsers().forEach((storedUser) => {
    userMap.set(storedUser.username, storedUser);
  });

  return Array.from(userMap.values());
}

function isSeededUsername(username) {
  const normalized = String(username || "").trim().toLowerCase();
  return seededUsers.some((user) => user.username === normalized);
}

function findUserByUsername(username) {
  const normalized = String(username || "").trim().toLowerCase();
  return getUsers().find((user) => user.username === normalized) || null;
}

function verifyPassword(user, receivedPassword) {
  const password = String(receivedPassword || "");

  if (!user || !password) {
    return false;
  }

  if (user.passwordHash) {
    return bcrypt.compareSync(password, user.passwordHash);
  }

  return user.passwordLegacy === password;
}

function maybeUpgradeUserPassword(user) {
  return user;
}

function getManagedUsers() {
  return getUsers()
    .map((user) => ({
      username: user.username,
      display: user.display,
      role: user.role,
      dependencyId: user.dependencyId,
      dependencyName: user.dependencyName,
      subdependencyId: user.subdependencyId,
      subdependencyName: user.subdependencyName,
      roomLabel: user.roomLabel,
      protected: isSeededUsername(user.username),
      deletable: !isSeededUsername(user.username),
    }))
    .sort((a, b) => a.display.localeCompare(b.display, "es"));
}

function createUser(input) {
  const username = String(input.username || "").trim().toLowerCase();
  const display = String(input.display || "").trim();
  const password = String(input.password || "");
  const role = input.role === "admin" ? "admin" : "funcionario";
  const room = resolveRoom(input.dependencyId, input.subdependencyId);

  if (!room) {
    throw new Error("La subdependencia seleccionada no existe");
  }

  if (!username || !display || !password) {
    throw new Error("Completa todos los datos del nuevo usuario");
  }

  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    throw new Error(
      "El usuario debe tener entre 3 y 24 caracteres y solo usar letras, numeros, punto, guion o guion bajo"
    );
  }

  if (password.length < 6) {
    throw new Error("La contrasena debe tener al menos 6 caracteres");
  }

  if (findUserByUsername(username)) {
    throw new Error("Ese nombre de usuario ya esta registrado");
  }

  db.prepare(`
    INSERT INTO users (username, display, role, dependency_id, subdependency_id, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    username,
    display,
    role,
    room.dependencyId,
    room.subdependencyId,
    hashPassword(password)
  );

  return findUserByUsername(username);
}

function updateStoredUserPassword(username, newPassword) {
  const normalized = String(username || "").trim().toLowerCase();
  const password = String(newPassword || "");

  if (!normalized) {
    throw new Error("Usuario invalido");
  }

  if (password.length < 6) {
    throw new Error("La contrasena debe tener al menos 6 caracteres");
  }

  const result = db.prepare(`
    UPDATE users
    SET password_hash = ?
    WHERE username = ?
  `).run(hashPassword(password), normalized);

  if (result.changes) {
    return;
  }

  const seededUser = seededUsers.find((user) => user.username === normalized);

  if (!seededUser) {
    throw new Error("El usuario no existe");
  }

  const seedRecord = buildUserRecord(seededUser);

  if (!seedRecord) {
    throw new Error("El usuario no tiene una sala valida");
  }

  db.prepare(`
    INSERT INTO users (username, display, role, dependency_id, subdependency_id, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    seedRecord.username,
    seedRecord.display,
    seedRecord.role,
    seedRecord.dependencyId,
    seedRecord.subdependencyId,
    hashPassword(password)
  );
}

function changeUserPassword(username, currentPassword, newPassword) {
  const user = findUserByUsername(username);

  if (!user) {
    throw new Error("El usuario no existe");
  }

  if (!verifyPassword(user, currentPassword)) {
    throw new Error("La contrasena actual no es correcta");
  }

  updateStoredUserPassword(user.username, newPassword);
}

function deleteUser(username) {
  const normalized = String(username || "").trim().toLowerCase();

  if (!normalized) {
    throw new Error("Usuario invalido");
  }

  if (isSeededUsername(normalized)) {
    throw new Error("No se puede eliminar el administrador principal");
  }

  const result = db.prepare("DELETE FROM users WHERE username = ?").run(normalized);

  if (!result.changes) {
    throw new Error("El usuario no existe o ya fue eliminado");
  }
}

function migrateStoredUsersToHashes() {
  return;
}

module.exports = {
  getUsers,
  getManagedUsers,
  findUserByUsername,
  verifyPassword,
  maybeUpgradeUserPassword,
  migrateStoredUsersToHashes,
  createUser,
  changeUserPassword,
  updateStoredUserPassword,
  deleteUser,
};
