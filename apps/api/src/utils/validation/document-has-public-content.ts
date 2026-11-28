/** 发布门槛：正文里至少要有一段可见文字或一张图片。 */
export function documentHasPublicContent(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(documentHasPublicContent);
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    if (record.type === 'image') return true;
    if (record.type === 'text' && typeof record.text === 'string' && record.text.trim()) return true;
    return Object.values(record).some(documentHasPublicContent);
}
