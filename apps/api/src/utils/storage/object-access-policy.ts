export const PROTECTED_PHYSICAL_KEY_SEGMENT = '__protected';

export function protectedPhysicalObjectKey(
    physicalKey: string,
    configuredPrefix = ''
): string {
    const prefix = configuredPrefix.replace(/^\/+|\/+$/g, '');
    if (!prefix) return `${PROTECTED_PHYSICAL_KEY_SEGMENT}/${physicalKey}`;
    const marker = `${prefix}/`;
    if (!physicalKey.startsWith(marker)) {
        throw new Error(`Physical key is outside configured prefix ${prefix}`);
    }
    return `${marker}${PROTECTED_PHYSICAL_KEY_SEGMENT}/${physicalKey.slice(marker.length)}`;
}
