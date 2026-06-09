import { AppError } from '../utils/http.js';
import { onlyDigits } from '../utils/validators.js';

const cache = new Map();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function getCachedCep(cep) {
  const entry = cache.get(cep);
  if (!entry || Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(cep);
    return null;
  }
  return entry.data;
}

export async function lookupCep(rawCep) {
  const cep = onlyDigits(rawCep);
  if (cep.length !== 8) throw new AppError(400, 'CEP invalido.');

  const cached = getCachedCep(cep);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal });
    if (!response.ok) throw new AppError(502, 'Falha ao consultar CEP.');

    const data = await response.json();
    if (data?.erro) throw new AppError(404, 'CEP nao encontrado.');

    const result = {
      cep: data.cep || cep,
      logradouro: data.logradouro || '',
      bairro: data.bairro || '',
      localidade: data.localidade || '',
      uf: data.uf || ''
    };
    cache.set(cep, { data: result, cachedAt: Date.now() });
    return result;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'Falha ao consultar CEP.');
  } finally {
    clearTimeout(timeout);
  }
}
