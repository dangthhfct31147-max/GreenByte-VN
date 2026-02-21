/// <reference types="vite/client" />
const RAW_API_BASE_URL = (import.meta.env.VITE_API_URL || '').trim();
const HAS_CUSTOM_API_BASE = RAW_API_BASE_URL.length > 0;
export const API_BASE_URL = HAS_CUSTOM_API_BASE ? RAW_API_BASE_URL.replace(/\/+$/, '') : '';
const FALLBACK_TOKEN_KEY = 'eco_auth_token';

let fallbackToken: string | null = null;

if (typeof window !== 'undefined') {
    fallbackToken = window.localStorage.getItem(FALLBACK_TOKEN_KEY);
}

export function getApiUrl(endpoint: string): string {
    let path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    if (HAS_CUSTOM_API_BASE) {
        if (API_BASE_URL.endsWith('/api') && path.startsWith('/api/')) {
            path = path.slice('/api'.length);
        }
        return `${API_BASE_URL}${path}`;
    }

    if (!path.startsWith('/api/')) {
        path = `/api${path}`;
    }

    return path;
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
