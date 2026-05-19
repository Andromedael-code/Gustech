import { z } from 'zod';
import { AppError } from './http.js';

export const onlyDigits = (value = '') => String(value).replace(/\D/g, '');
export const slugify = (value = '') => String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
export const toSafeInteger = (value, fallback = 1) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function validateCPF(cpf) {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calc = (base, factor) => {
    let total = 0;
    for (const n of base) total += Number(n) * factor--;
    const mod = (total * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  return calc(digits.slice(0, 9), 10) === Number(digits[9]) && calc(digits.slice(0, 10), 11) === Number(digits[10]);
}

export function validatePhone(phone) {
  const digits = onlyDigits(phone);
  return digits.length >= 10 && digits.length <= 11;
}

export const addressSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(80).default('Endereço'),
  street: z.string().trim().min(2).max(150),
  number: z.string().trim().min(1).max(20),
  neighborhood: z.string().trim().min(2).max(100),
  zip: z.string().trim().min(8).max(9),
  complement: z.string().trim().max(120).optional().or(z.literal('')),
  isDefault: z.boolean().optional().default(false)
}).superRefine((value, ctx) => {
  if (onlyDigits(value.zip).length !== 8) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['zip'], message: 'CEP inválido.' });
  }
});

export const profileSchema = z.object({
  username: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(120),
  cpf: z.string().trim(),
  phone: z.string().trim(),
  email: z.string().email().optional()
}).superRefine((value, ctx) => {
  if (!validateCPF(value.cpf)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cpf'], message: 'CPF inválido.' });
  }
  if (!validatePhone(value.phone)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Celular inválido.' });
  }
});

export const profileUpdateSchema = z.object({
  username: z.string().trim().min(2).max(50)
});

export const phoneVerificationStartSchema = z.object({
  phone: z.string().trim()
}).superRefine((value, ctx) => {
  if (!validatePhone(value.phone)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Celular inválido.' });
  }
});

export const phoneVerificationConfirmSchema = z.object({
  phone: z.string().trim(),
  code: z.string().trim().min(4).max(10)
}).superRefine((value, ctx) => {
  if (!validatePhone(value.phone)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Celular inválido.' });
  }
});

export const orderItemSchema = z.object({
  productId: z.string().trim().max(100).optional().nullable(),
  name: z.string().trim().min(1).max(120),
  price: z.coerce.number().positive(),
  quantity: z.coerce.number().int().min(1).max(99),
  image: z.string().trim().max(500).optional().nullable().or(z.literal('')).optional()
});

export const createOrderSchema = z.object({
  method: z.enum(['pix', 'credit_card', 'debit_card', 'boleto', 'teste']),
  paymentDetails: z.record(z.any()).default({}),
  deliveryAddress: addressSchema,
  items: z.array(orderItemSchema).min(1)
});

export const reviewSchema = z.object({
  rating: z.coerce.number().min(1).max(5),
  comment: z.string().trim().min(8).max(1000)
});

export const statusSchema = z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']);

export const allowedTransitions = {
  pending: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: []
};

export function assertStatusTransition(currentStatus, nextStatus) {
  if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
    throw new AppError(400, `Transição de status inválida: ${currentStatus} -> ${nextStatus}.`);
  }
}

export function validateWithSchema(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(' ');
    throw new AppError(400, message || 'Dados inválidos.', result.error.flatten());
  }
  return result.data;
}
