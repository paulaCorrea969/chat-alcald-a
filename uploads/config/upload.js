const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { resolveRoomByRoomId } = require("../../config/dependencies");

const baseUploadsDir = path.resolve(__dirname, "..");
const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"]);
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

fs.mkdirSync(baseUploadsDir, { recursive: true });

function sanitizeValue(value, fallback) {
  return path
    .basename(String(value || fallback))
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const requestedRoomId = String(req.headers["x-room-id"] || "").trim();
    const effectiveRoomId =
      req.user?.role === "admin" && requestedRoomId && resolveRoomByRoomId(requestedRoomId)
        ? requestedRoomId
        : req.user?.roomId;
    const roomId = sanitizeValue(effectiveRoomId, "general");
    const roomDir = path.join(baseUploadsDir, roomId);
    fs.mkdirSync(roomDir, { recursive: true });
    cb(null, roomDir);
  },
  filename(req, file, cb) {
    const cleanName = sanitizeValue(file.originalname, "archivo");
    cb(null, `${Date.now()}-${cleanName}`);
  },
});

function fileFilter(req, file, cb) {
  const extension = path.extname(file.originalname || "").toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();

  if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(mimeType)) {
    cb(new Error("Tipo de archivo no permitido"));
    return;
  }

  cb(null, true);
}

module.exports = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter,
});
