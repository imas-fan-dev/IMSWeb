export function getRequestPathSegments(requestUrl: unknown): string[] | null {
    let requestPath = String(requestUrl || '').split('?')[0];
    try {
        for (let iteration = 0; iteration < 2; iteration += 1) {
            const decoded = decodeURIComponent(requestPath);
            if (decoded === requestPath) break;
            requestPath = decoded;
        }
    } catch {
        return null;
    }

    const segments = requestPath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (segments.some((segment) => segment === '.' || segment === '..')) return null;
    return segments;
}

export function isProtectedChronicleUploadPath(requestUrl: unknown): boolean {
    const segments = getRequestPathSegments(requestUrl);
    if (!segments) return false;
    return segments.slice(0, 5).map((segment) => segment.toLowerCase()).join('/') ===
        'assets/images/eventchronicle/events/upload';
}

export function isNamecardUploadPath(requestUrl: unknown): boolean {
    const segments = getRequestPathSegments(requestUrl);
    if (!segments) return false;
    return segments.slice(0, 3).map((segment) => segment.toLowerCase()).join('/') ===
        'uploads/namecard/original';
}

export function isSensitiveRequestPath(requestUrl: unknown): boolean {
    const segments = getRequestPathSegments(requestUrl);
    if (!segments) return true;

    const lowerSegments = segments.map((segment) => segment.toLowerCase());
    const firstSegment = lowerSegments[0] || '';
    const internalDirectory = new Set([
        '.git', '.venv', '__pycache__', 'data', 'database', 'logs', 'node_modules',
        'templates', 'venv'
    ]).has(firstSegment);
    const chronicleMetadata = lowerSegments.slice(0, 5).join('/') ===
        'assets/images/eventchronicle/events/meta' ||
        lowerSegments.slice(0, 4).join('/') === 'assets/images/eventchronicle/meta';
    const privateWorkDirectory = lowerSegments.some((segment) =>
        segment === '.idempotency' || segment === '.staging' || segment === '.trash'
    );

    if (internalDirectory || chronicleMetadata || privateWorkDirectory) return true;

    return segments.some((segment) => {
        const name = segment.toLowerCase();
        const isVirtualEnv = name === 'venv' || name === '.venv' || name.endsWith('_venv');
        const isEnvironmentFile = name === '.env' || name.startsWith('.env.');
        const isDeploymentManifest = /^(?:requirements(?:-[^/]*)?\.txt|readme(?:\.[^/]*)?|package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|uv\.lock|pipfile(?:\.lock)?|pyproject\.toml|dockerfile|docker-compose(?:\.[^/]*)?\.ya?ml|wrangler\.(?:toml|jsonc?)|nginx\.conf)$/.test(name);
        const hasSensitiveExtension = /\.(?:db|sqlite|sqlite3|py|ini|log|pid|env|psd|sql|txt|bak|conf|config|toml|lock|wal|shm)$/.test(name);
        const isSqliteSidecar = /-(?:wal|shm|journal)$/.test(name);
        const isArchive = /\.(?:tar(?:\.gz)?|tgz|zip|7z)$/.test(name);
        return isVirtualEnv || isEnvironmentFile || isDeploymentManifest ||
            hasSensitiveExtension || isSqliteSidecar || isArchive;
    });
}
