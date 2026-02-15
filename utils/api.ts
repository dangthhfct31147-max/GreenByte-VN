export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function getApiUrl(endpoint: string): string {
    // Ensure endpoint starts with / if not present
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${API_BASE_URL}${path}`;
}

export function apiFetch(endpoint: string, init?: RequestInit): Promise<Response> {
    return fetch(getApiUrl(endpoint), {
        ...init,
        credentials: 'include',
    });
}
