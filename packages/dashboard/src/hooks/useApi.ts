import { useCallback } from 'react';

export interface ApiError {
  status: number;
  message: string;
}

const API_KEY_STORAGE_KEY = 'decigraph_api_key';

export function getStoredApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setStoredApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export function clearStoredApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

export function useApi() {
  const baseUrl = import.meta.env.VITE_API_URL || '';

  const request = useCallback(
    async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      const url = `${baseUrl}${path}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Inject Bearer auth header if API key is stored
      const apiKey = getStoredApiKey();
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const options: RequestInit = {
        method,
        headers,
      };

      if (body !== undefined) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        const errorBody = await response.text();
        let message: string;
        try {
          const parsed = JSON.parse(errorBody);
          message = parsed.message || parsed.error || errorBody;
        } catch {
          message = errorBody || response.statusText;
        }
        throw { status: response.status, message } as ApiError;
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json();
    },
    [baseUrl],
  );

  const get = useCallback(<T>(path: string): Promise<T> => request<T>('GET', path), [request]);

  const post = useCallback(
    <T>(path: string, body: unknown): Promise<T> => request<T>('POST', path, body),
    [request],
  );

  const patch = useCallback(
    <T>(path: string, body: unknown): Promise<T> => request<T>('PATCH', path, body),
    [request],
  );

  const del = useCallback(
    (path: string): Promise<void> => request<void>('DELETE', path),
    [request],
  );

  return { get, post, patch, del, baseUrl };
}
