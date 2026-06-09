import { createVerify } from 'node:crypto';
import { env } from './env.js';

const firebaseAdminModule = await import('firebase-admin').catch(() => null);
const admin = firebaseAdminModule?.default || null;
const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cachedServiceAccount;
let cachedCerts = { expiresAt: 0, values: null };

function readServiceAccountFromEnv() {
  if (cachedServiceAccount !== undefined) return cachedServiceAccount;
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!encoded) {
    cachedServiceAccount = null;
    return cachedServiceAccount;
  }

  try {
    cachedServiceAccount = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    return cachedServiceAccount;
  } catch (error) {
    const wrapped = new Error('FIREBASE_SERVICE_ACCOUNT_JSON invalido.');
    wrapped.cause = error;
    throw wrapped;
  }
}

function getFirebaseProjectId() {
  return env.firebase.projectId || readServiceAccountFromEnv()?.project_id || '';
}

function decodeBase64Url(value) {
  return Buffer.from(String(value || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function parseJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('JWT invalido.');
  return {
    signedContent: `${parts[0]}.${parts[1]}`,
    signature: decodeBase64Url(parts[2]),
    header: JSON.parse(decodeBase64Url(parts[0]).toString('utf8')),
    payload: JSON.parse(decodeBase64Url(parts[1]).toString('utf8'))
  };
}

async function fetchFirebaseCerts() {
  if (cachedCerts.values && Date.now() < cachedCerts.expiresAt) return cachedCerts.values;

  const response = await fetch(FIREBASE_CERTS_URL);
  if (!response.ok) throw new Error('Falha ao carregar certificados Firebase.');

  const cacheControl = response.headers.get('cache-control') || '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 3600);
  cachedCerts = {
    values: await response.json(),
    expiresAt: Date.now() + maxAge * 1000
  };
  return cachedCerts.values;
}

async function verifyWithPublicCerts(token) {
  const projectId = getFirebaseProjectId();
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID nao configurado.');

  const { signedContent, signature, header, payload } = parseJwt(token);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('JWT Firebase invalido.');

  const certs = await fetchFirebaseCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error('Certificado Firebase nao encontrado.');

  const verifier = createVerify('RSA-SHA256');
  verifier.update(signedContent);
  verifier.end();
  if (!verifier.verify(cert, signature)) throw new Error('Assinatura Firebase invalida.');

  const now = Math.floor(Date.now() / 1000);
  if (Number(payload.exp || 0) <= now) throw new Error('Token Firebase expirado.');
  if (Number(payload.iat || 0) > now + 300) throw new Error('Token Firebase emitido no futuro.');
  if (payload.aud !== projectId) throw new Error('Audience Firebase invalida.');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Issuer Firebase invalido.');
  if (!payload.sub || String(payload.sub).length > 128) throw new Error('Subject Firebase invalido.');

  return { ...payload, uid: payload.user_id || payload.sub };
}

export function initFirebaseAdmin() {
  if (!admin) {
    throw new Error('firebase-admin nao esta instalado.');
  }
  if (admin.apps.length) return admin;
  const serviceAccount = readServiceAccountFromEnv();
  admin.initializeApp(serviceAccount ? { credential: admin.credential.cert(serviceAccount) } : undefined);
  return admin;
}

export function getAuth() {
  return initFirebaseAdmin().auth();
}

export async function verifyFirebaseIdToken(token) {
  if (admin) return getAuth().verifyIdToken(token);
  return verifyWithPublicCerts(token);
}

export { admin };
