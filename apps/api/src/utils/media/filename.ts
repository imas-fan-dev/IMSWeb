export function safeUploadBaseName(filename: string): string {
    const base = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '')
        .normalize('NFKC')
        .replace(/[^\x00-\x7F]+/g, '_')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80);
    return base || 'image';
}
