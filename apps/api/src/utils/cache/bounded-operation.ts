const DEFAULT_CACHE_OPERATION_TIMEOUT_MS = 250;

export async function withBoundedCacheOperation<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMilliseconds = DEFAULT_CACHE_OPERATION_TIMEOUT_MS,
): Promise<T> {
    if (
        !Number.isSafeInteger(timeoutMilliseconds)
        || timeoutMilliseconds < 1
        || timeoutMilliseconds > 5_000
    ) {
        throw new Error('Cache operation timeout must be between 1 and 5000 milliseconds');
    }

    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
            reject(new Error('Cache operation exceeded its deadline'));
            controller.abort();
        }, timeoutMilliseconds);
    });

    try {
        return await Promise.race([operation(controller.signal), deadline]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}
