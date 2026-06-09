import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AppError } from '../utils/http.js';

const uploadRoot = fileURLToPath(new URL('../../uploads/products/', import.meta.url));
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
]);
const MIME_ALIASES = new Map([
  ['image/jpg', 'image/jpeg'],
  ['image/pjpeg', 'image/jpeg'],
  ['image/x-png', 'image/png'],
  ['image/x-webp', 'image/webp'],
  ['image/webp', 'image/webp'] // fix: SEC-2
]);
const MAGIC_BYTES = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // fix: SEC-2
  'image/gif': [0x47, 0x49, 0x46]
};

function extensionFromMime(mime = '') {
  return ALLOWED_MIME_TYPES.get(normalizeMime(mime)) || null; // fix: SEC-2
}

function normalizeMime(mime = '') {
  const safeMime = String(mime).toLowerCase(); // fix: BUG-1
  return MIME_ALIASES.get(safeMime) || safeMime;
}

function validateMagicBytes(buffer, mime) {
  if (!Buffer.isBuffer(buffer)) return false;
  if (mime === 'image/webp') {
    return buffer.length >= 12
      && buffer[0] === 0x52
      && buffer[1] === 0x49
      && buffer[2] === 0x46
      && buffer[3] === 0x46
      && buffer[8] === 0x57
      && buffer[9] === 0x45
      && buffer[10] === 0x42
      && buffer[11] === 0x50;
  }
  const signature = MAGIC_BYTES[mime];
  return Boolean(signature) && signature.every((byte, index) => buffer[index] === byte);
}

export async function saveUploadedImage({ dataUrl, originalName = 'image' }) {
  const normalized = String(dataUrl || '').trim();
  const match = normalized.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new AppError(400, 'Arquivo de imagem inválido.');

  const [, mime, base64] = match;
  const safeMime = normalizeMime(String(mime).toLowerCase()); // fix: SEC-2
  const extension = extensionFromMime(safeMime);
  if (!extension) {
    throw new AppError(400, 'Formato de imagem não suportado. Use JPG, PNG, WEBP ou GIF.');
  }

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw new AppError(400, 'Conteúdo de imagem inválido.');
  }

  if (!buffer?.byteLength) throw new AppError(400, 'A imagem enviada está vazia.');
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError(400, 'A imagem excede o limite de 8 MB.');
  }
  if (!validateMagicBytes(buffer, safeMime)) {
    throw new AppError(400, 'Conteudo de imagem nao corresponde ao formato informado.');
  }

  const baseName = path.basename(String(originalName || 'image'), path.extname(String(originalName || 'image')))
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'image';

  const filename = `${Date.now()}-${baseName}-${crypto.randomUUID()}${extension}`;

  await fs.mkdir(uploadRoot, { recursive: true });
  await fs.writeFile(path.join(uploadRoot, filename), buffer);

  return `/uploads/products/${filename}`;
}
