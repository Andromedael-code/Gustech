import admin from 'firebase-admin';

export function initFirebaseAdmin() {
  if (admin.apps.length) return admin;
  admin.initializeApp();
  return admin;
}

export function getAuth() {
  return initFirebaseAdmin().auth();
}

export { admin };
