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
        const baseEndsWithApi = API_BASE_URL.endsWith('/api');
        const pathStartsWithApi = path.startsWith('/api/') || path === '/api';

        if (baseEndsWithApi && pathStartsWithApi) {
            path = path.slice(4); // remove literal /api segment
        } else if (!baseEndsWithApi && !pathStartsWithApi) {
            path = `/api${path}`;
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

type AiFeedbackPayload = {
    module: 'RECOMMENDATIONS' | 'SELLER_ASSISTANT' | 'PRICE_SUGGESTION' | 'MATCH_BUYERS' | 'VISION_CLASSIFIER';
    event_type:
    | 'REQUEST'
    | 'IMPRESSION'
    | 'CLICK'
    | 'APPLY'
    | 'VIEW'
    | 'CART_ADD'
    | 'INQUIRY_OPEN'
    | 'INQUIRY_ACCEPTED'
    | 'INQUIRY_REJECTED'
    | 'REVIEW_POSITIVE'
    | 'REVIEW_NEGATIVE';
    product_id?: string;
    inquiry_id?: string;
    category?: string;
    location?: string;
    metadata?: Record<string, unknown>;
};

const AI_SESSION_KEY = 'eco_ai_session_id';

function resolveAiSessionId(): string | undefined {
    if (typeof window === 'undefined') return undefined;

    try {
        const existing = window.localStorage.getItem(AI_SESSION_KEY);
        if (existing && existing.trim().length > 0) return existing;

        const generated =
            typeof window.crypto?.randomUUID === 'function'
                ? window.crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        window.localStorage.setItem(AI_SESSION_KEY, generated);
        return generated;
    } catch {
        return undefined;
    }
}

export function sendAiFeedback(payload: AiFeedbackPayload): void {
    const sessionId = resolveAiSessionId();

    void apiFetch('ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...payload,
            session_id: sessionId,
        }),
        keepalive: true,
    }).catch(() => undefined);
}
