export function invalidRequest(message: string): never {
    throw Object.assign(new Error(message), { status: 400 });
}

export function requestRecord(value: unknown, message: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalidRequest(message);
    return value as Record<string, unknown>;
}

export interface RevisionedContentRequest {
    content: unknown;
    revision: string | null;
}

export function revisionedContentRequest(
    value: unknown,
    subject: string
): RevisionedContentRequest {
    const payload = requestRecord(value, `${subject}格式无效`);
    if (payload.revision !== null && typeof payload.revision !== 'string') {
        invalidRequest(`${subject}版本无效`);
    }
    return { content: payload.content, revision: payload.revision } as RevisionedContentRequest;
}

export function uniqueStringIdListRequest(
    value: unknown,
    messages: { invalid: string; duplicate: string }
): string[] {
    const payload = requestRecord(value, messages.invalid);
    if (!Array.isArray(payload.ids) || payload.ids.some((id) => typeof id !== 'string')) {
        invalidRequest(messages.invalid);
    }
    const ids = payload.ids as string[];
    if (new Set(ids).size !== ids.length) invalidRequest(messages.duplicate);
    return ids;
}
