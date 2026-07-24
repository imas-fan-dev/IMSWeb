export function statusFromError(error: unknown, fallback = 500): number {
    if (error && typeof error === 'object' && 'status' in error) {
        const status = Number((error as { status?: unknown }).status);
        if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
    }
    return fallback;
}

export function messageFromError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
