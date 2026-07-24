export function safeUploadBaseName(filename: string): string {
    const base = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '')
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}._-]+/gu, '_')
        .slice(0, 80);
    return base || 'image';
}
