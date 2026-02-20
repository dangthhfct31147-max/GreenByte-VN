/// <reference types="vite/client" />
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const FALLBACK_TOKEN_KEY = 'eco_auth_token';

let fallbackToken: string | null = null;

if (typeof window !== 'undefined') {
    fallbackToken = window.localStorage.getItem(FALLBACK_TOKEN_KEY);
}

export function getApiUrl(endpoint: string): string {
    // Ensure endpoint starts with / if not present
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${API_BASE_URL}${path}`;
}

export function setAuthToken(token: string | null) {
    fallbackToken = token;
    if (typeof window === 'undefined') return;
    if (!token) {
        window.localStorage.removeItem(FALLBACK_TOKEN_KEY);
        return;
    }
    window.localStorage.setItem(FALLBACK_TOKEN_KEY, token);
}

export function clearAuthToken() {
    setAuthToken(null);
}

export function apiFetch(endpoint: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (fallbackToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${fallbackToken}`);
    }

    return fetch(getApiUrl(endpoint), {
        ...init,
        headers,
        credentials: 'include',
    });
}
