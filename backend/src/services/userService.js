import { withTransaction, getPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/http.js';
import { addressSchema, profileSchema, profileUpdateSchema, validateWithSchema } from '../utils/validators.js';
import { getAddresses, getUserProfile, listAdmins, replaceAddresses, upsertAdmin, upsertUserProfile } from '../repositories/userRepository.js';

function onlyDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

export async function getMe(uid) {
  const connection = getPool();
  const profile = await getUserProfile(connection, uid);
  const addresses = await getAddresses(connection, uid);
  return {
    profile,
    addresses,
    phoneVerification: {
      enabled: env.sms.enabled,
      mock: !env.sms.enabled
    }
  };
}

export async function saveMyProfile(uid, email, payload) {
  const connection = getPool();
  const existingProfile = await getUserProfile(connection, uid);

  if (!existingProfile) {
    const profile = validateWithSchema(profileSchema, { ...payload, email: payload.email || email || '' });
    await withTransaction(async (transaction) => {
      await upsertUserProfile(transaction, uid, { ...profile, phoneVerifiedAt: null });
    });
    return { ok: true };
  }

  const updates = validateWithSchema(profileUpdateSchema, {
    username: payload?.username ?? existingProfile.username
  });

  if (payload?.name && String(payload.name).trim() !== String(existingProfile.name || '').trim()) {
    throw new AppError(400, 'O nome completo não pode ser alterado após o cadastro.');
  }

  if (payload?.cpf && onlyDigits(payload.cpf) !== onlyDigits(existingProfile.cpf)) {
    throw new AppError(400, 'O CPF não pode ser alterado após o cadastro.');
  }

  if (payload?.phone && onlyDigits(payload.phone) !== onlyDigits(existingProfile.phone)) {
    throw new AppError(400, 'Para alterar o celular, confirme o novo número por SMS antes de salvar.');
  }

  const profile = validateWithSchema(profileSchema, {
    username: updates.username,
    name: existingProfile.name,
    cpf: existingProfile.cpf,
    phone: existingProfile.phone,
    email: existingProfile.email || email || ''
  });

  await withTransaction(async (connection) => {
    await upsertUserProfile(connection, uid, {
      ...profile,
      phoneVerifiedAt: existingProfile.phoneVerifiedAt || null
    });
  });
  return { ok: true };
}

export async function saveMyAddresses(uid, payload) {
  const rawAddresses = Array.isArray(payload?.addresses) ? payload.addresses : [];
  const normalized = rawAddresses.map((address, index) => {
    const parsed = validateWithSchema(addressSchema, address);
    return { ...parsed, id: parsed.id || `addr_${index}_${Date.now()}` };
  });

  if (normalized.length && !normalized.some((item) => item.isDefault)) normalized[0].isDefault = true;
  if (normalized.filter((item) => item.isDefault).length > 1) {
    normalized.forEach((item, index) => {
      item.isDefault = index === normalized.findIndex((candidate) => candidate.isDefault);
    });
  }

  await withTransaction(async (connection) => {
    await replaceAddresses(connection, uid, normalized);
  });

  return { ok: true, addresses: normalized };
}

export async function getAdmins() {
  return listAdmins(getPool());
}

export async function createAdmin(currentUserUid, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail.includes('@')) throw new AppError(400, 'Email inválido.');

  const connection = getPool();
  const [users] = await connection.execute('SELECT id, email FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
  const targetUser = users[0];
  if (!targetUser) {
    throw new AppError(404, 'Usuário não encontrado no MySQL. Cadastre o perfil do usuário antes de promovê-lo a administrador.');
  }

  await withTransaction(async (transaction) => {
    await upsertAdmin(transaction, {
      uid: targetUser.id,
      email: normalizedEmail,
      role: 'admin',
      createdBy: currentUserUid
    });
  });

  return { ok: true, uid: targetUser.id, email: normalizedEmail };
}
