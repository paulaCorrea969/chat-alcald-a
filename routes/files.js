const express = require("express");
const fs = require("fs");
const path = require("path");
const upload = require("../uploads/config/upload");
const { authenticateRequest } = require("../middleware/auth");
const { appendAuditEvent } = require("../services/audit-store");
const { resolveRoomByRoomId } = require("../config/dependencies");

const router = express.Router();

function getRoomUploadsDir(user) {
  return path.resolve(__dirname, "../uploads", user.roomId);
}

function ensureRoomDir(user) {
  const roomDir = getRoomUploadsDir(user);
  fs.mkdirSync(roomDir, { recursive: true });
  return roomDir;
}

function getEffectiveUser(req) {
  const requestedRoomId = String(req.headers["x-room-id"] || "").trim();

  if (req.user.role !== "admin" || !requestedRoomId) {
    return req.user;
  }

  const room = resolveRoomByRoomId(requestedRoomId);

  if (!room) {
    return req.user;
  }

  return {
    ...req.user,
    ...room,
  };
}

router.use(authenticateRequest);

router.get("/", (req, res) => {
  const effectiveUser = getEffectiveUser(req);
  const uploadsDir = ensureRoomDir(effectiveUser);
  const files = fs
    .readdirSync(uploadsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fullPath = path.join(uploadsDir, entry.name);
      const stats = fs.statSync(fullPath);

      return {
        name: entry.name,
        size: stats.size,
        uploadedAt: stats.mtime.toISOString(),
        url: `/api/files/${encodeURIComponent(entry.name)}`,
      };
    })
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  return res.json({
    ok: true,
    files,
  });
});

router.get("/:filename", (req, res) => {
  const effectiveUser = getEffectiveUser(req);
  const uploadsDir = ensureRoomDir(effectiveUser);
  const fileName = path.basename(String(req.params.filename || ""));
  const filePath = path.join(uploadsDir, fileName);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({
      ok: false,
      message: "Archivo no encontrado",
    });
  }

  return res.download(filePath, fileName);
});

router.post("/upload", (req, res) => {
  upload.single("archivo")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.message || String(error),
      });
    }

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "No se subio ningun archivo",
      });
    }

    const effectiveUser = getEffectiveUser(req);
    const timestamp = new Date();

    console.log(
      `[ARCHIVO] ${req.file.originalname} guardado como ${req.file.filename} en ${effectiveUser.roomId} - ${timestamp.toISOString()}`
    );

    try {
      appendAuditEvent({
        type: "file.uploaded",
        actorUsername: effectiveUser.username,
        actorDisplay: effectiveUser.display,
        actorRole: effectiveUser.role,
        roomId: effectiveUser.roomId,
        roomLabel: effectiveUser.roomLabel,
        summary: "Archivo subido a la sala",
        meta: {
          fileName: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size || 0,
        },
      });
    } catch (auditError) {
      console.error("No se pudo registrar auditoria de archivo:", auditError.message);
    }

    return res.json({
      ok: true,
      message: "Archivo subido correctamente",
      file: req.file.filename,
      original: req.file.originalname,
      uploadedAt: timestamp.toISOString(),
      url: `/api/files/${encodeURIComponent(req.file.filename)}`,
    });
  });
});

module.exports = router;
