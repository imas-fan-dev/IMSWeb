const CONTENT_TYPES: Record<string, string> = {
    '.avif': 'image/avif', '.bmp': 'image/bmp', '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon',
    '.jfif': 'image/jpeg', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.geojson': 'application/geo+json', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.webp': 'image/webp',
    '.woff': 'font/woff', '.woff2': 'font/woff2'
};

export function contentTypeForPath(filePath: string): string {
    const extension = /\.[a-z0-9]+$/i.exec(filePath)?.[0].toLowerCase() || '';
    return CONTENT_TYPES[extension] || 'application/octet-stream';
}
