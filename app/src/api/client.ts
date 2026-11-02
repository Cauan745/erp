import { AppError } from '../errors';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8081').replace(/\/+$/, '');
export const REQUEST_TIMEOUT_MS = 10000;

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly details: unknown) {
    super(code);
    this.name = 'ApiError';
  }
}

// Each call makes exactly one HTTP attempt. Mutations are never replayed.
export async function apiRequest(path: string, init: RequestInit = {}, apiBaseUrl = API_BASE_URL): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      signal: controller.signal
    });
    if (response.status === 204 && response.ok) return undefined;
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AppError(controller.signal.aborted ? 'requestTimeout' : 'apiResponseInvalid');
    }
    if (!response.ok) {
      if (typeof body === 'object' && body !== null && 'error' in body) {
        const error = body.error;
        if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
          throw new ApiError(response.status, error.code, 'details' in error ? error.details : {});
        }
      }
      throw new AppError('apiResponseInvalid');
    }
    return body;
  } catch (error) {
    if (error instanceof ApiError || error instanceof AppError) throw error;
    throw new AppError(controller.signal.aborted ? 'requestTimeout' : 'networkUnavailable');
  } finally {
    clearTimeout(timeout);
  }
}
