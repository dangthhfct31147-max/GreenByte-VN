const ADMIN_TOKEN_KEY = 'eco_admin_token';

export function getAdminToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null) {
    if (typeof window === 'undefined') return;
    if (!token) {
        window.localStorage.removeItem(ADMIN_TOKEN_KEY);
        return;
    }
    window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
}
