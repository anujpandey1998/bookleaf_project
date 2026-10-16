import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { AppError } from '../utils/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export function resolvePrivateUploadDir({
  isVercel = Boolean(process.env.VERCEL),
  tempDirectory = os.tmpdir(),
} = {}) {
  return isVercel
    ? path.join(tempDirectory, 'bookleaf-private-uploads')
    : path.resolve(__dirname, '..', '..', 'private-uploads');
}

export const PRIVATE_UPLOAD_DIR = resolvePrivateUploadDir();
fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });

const allowedExtensions = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm']);

export const uploadTicketFiles = multer({
  storage: multer.diskStorage({
    destination: PRIVATE_UPLOAD_DIR,
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { files: 5, fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!allowedExtensions.has(path.extname(file.originalname).toLowerCase())) {
      callback(new AppError(400, 'Only PDF, JPG, PNG, GIF, WEBP, MP4, MOV, and WEBM files are allowed'));
      return;
    }
    callback(null, true);
  },
});

export async function removeTemporaryUploads(files = []) {
  await Promise.all(files.map((file) => fs.promises.rm(file.path, { force: true })));
}
