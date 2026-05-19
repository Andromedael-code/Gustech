import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError } from '../utils/http.js';

const uploadRoot = path.resolve(process.cwd(), 'backend', 'uploads', 'products');
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
]);

function extensionFromMime(mime = '') {
  return ALLOWED_MIME_TYPES.get(String(mime).toLowerCase()) || null;
}

export async function saveUploadedImage({ dataUrl, originalName = 'image' }) {
  const normalized = String(dataUrl || '').trim();
  const match = normalized.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new AppError(400, 'Arquivo de imagem inválido.');

  const [, mime, base64] = match;
  const safeMime = String(mime).toLowerCase();
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
