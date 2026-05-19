import { env } from '../config/env.js';
import { getPool, withTransaction } from '../config/mysql.js';
import { getUserProfile, upsertUserProfile } from '../repositories/userRepository.js';
import { AppError } from '../utils/http.js';
import { phoneVerificationConfirmSchema, phoneVerificationStartSchema, validateWithSchema } from '../utils/validators.js';

const mockVerificationStore = new Map();
const MOCK_VERIFICATION_CODE = '123456';

function onlyDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhoneToE164(phone) {
  const digits = onlyDigits(phone);
  if (!digits) throw new AppError(400, 'Celular inválido.');

  if (digits.startsWith(env.sms.defaultCountryCode) && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `+${env.sms.defaultCountryCode}${digits}`;
  }

  if (String(phone).trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  throw new AppError(400, 'Celular inválido para verificação por SMS.');
}

function formatPhoneForDisplay(phone) {
  const digits = onlyDigits(phone);
  const national = digits.startsWith(env.sms.defaultCountryCode) && digits.length >= 12
    ? digits.slice(env.sms.defaultCountryCode.length)
    : digits;

  if (national.length <= 10) {
    return national.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }

  return national.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

async function twilioVerifyRequest(pathname, formData) {
  const auth = Buffer.from(`${env.sms.twilioAccountSid}:${env.sms.twilioAuthToken}`).toString('base64');
  const response = await fetch(`https://verify.twilio.com/v2/Services/${env.sms.twilioVerifyServiceSid}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(formData)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AppError(response.status >= 500 ? 502 : 400, data.message || 'Falha ao processar a verificação por SMS.');
  }

  return data;
}

async function loadRequiredProfile(uid) {
  const profile = await getUserProfile(getPool(), uid);
  if (!profile) throw new AppError(404, 'Perfil do usuário não encontrado.');
  return profile;
}

export async function startMyPhoneVerification(uid, payload) {
  const { phone } = validateWithSchema(phoneVerificationStartSchema, payload || {});
  const profile = await loadRequiredProfile(uid);
  const currentDigits = onlyDigits(profile.phone);
  const nextDigits = onlyDigits(phone);

  if (currentDigits === nextDigits && profile.phoneVerifiedAt) {
    throw new AppError(400, 'Esse celular já está confirmado na sua conta.');
  }

  if (env.sms.enabled) {
    await twilioVerifyRequest('/Verifications', {
      To: normalizePhoneToE164(phone),
      Channel: 'sms'
    });

    return {
      ok: true,
      phone: formatPhoneForDisplay(phone),
      message: 'Código enviado por SMS.'
    };
  }

  mockVerificationStore.set(uid, {
    phoneDigits: onlyDigits(phone),
    code: MOCK_VERIFICATION_CODE,
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  return {
    ok: true,
    phone: formatPhoneForDisplay(phone),
    mock: true,
    message: 'Modo teste ativo: simulamos o envio do código. Use 123456 para confirmar.'
  };
}

export async function confirmMyPhoneVerification(uid, email, payload) {
  const { phone, code } = validateWithSchema(phoneVerificationConfirmSchema, payload || {});
  const profile = await loadRequiredProfile(uid);
  const phoneDigits = onlyDigits(phone);

  if (env.sms.enabled) {
    const verification = await twilioVerifyRequest('/VerificationCheck', {
      To: normalizePhoneToE164(phone),
      Code: code
    });

    if (verification.status !== 'approved') {
      throw new AppError(400, 'Código inválido ou expirado.');
    }
  } else {
    const mockVerification = mockVerificationStore.get(uid);
    if (!mockVerification || mockVerification.expiresAt < Date.now()) {
      mockVerificationStore.delete(uid);
      throw new AppError(400, 'O código de teste expirou. Solicite um novo envio.');
    }

    if (mockVerification.phoneDigits !== phoneDigits || String(code).trim() !== mockVerification.code) {
      throw new AppError(400, 'Código de teste inválido.');
    }

    mockVerificationStore.delete(uid);
  }

  const verifiedPhone = formatPhoneForDisplay(phone);
  const phoneVerifiedAt = new Date();

  await withTransaction(async (connection) => {
    await upsertUserProfile(connection, uid, {
      username: profile.username,
      name: profile.name,
      cpf: profile.cpf,
      phone: verifiedPhone,
      email: profile.email || email || '',
      phoneVerifiedAt
    });
  });

  return {
    ok: true,
    phone: verifiedPhone,
    phoneVerifiedAt: phoneVerifiedAt.toISOString(),
    message: 'Celular confirmado por SMS e atualizado com sucesso.'
  };
}
