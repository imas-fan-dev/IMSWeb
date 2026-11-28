import {
    DEFAULT_PRIVACY_POLICY_BODY,
    DEFAULT_PRIVACY_POLICY_TITLE
} from '@/domains/content/privacy-policy/default-content';

export interface PrivacyPolicyDraft {
    enabled: boolean;
    title: string;
    body: string;
}

export interface PrivacyPolicyContent extends PrivacyPolicyDraft {
    updatedAt: string | null;
}

export const PRIVACY_POLICY_TITLE_MAX_LENGTH = 120;
export const PRIVACY_POLICY_BODY_MAX_LENGTH = 20000;

export function defaultPrivacyPolicyDraft(): PrivacyPolicyDraft {
    return {
        enabled: true,
        title: DEFAULT_PRIVACY_POLICY_TITLE,
        body: DEFAULT_PRIVACY_POLICY_BODY
    };
}

function invalid(message: string): never {
    throw Object.assign(new Error(message), { status: 400 });
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        invalid('隐私条款格式无效');
    }
    return value as Record<string, unknown>;
}

function normalizedText(
    value: unknown,
    label: string,
    maxLength: number
): string {
    const text = typeof value === 'string'
        ? value.replace(/\r\n/g, '\n').trim()
        : '';
    if (!text || text.length > maxLength) {
        invalid(`${label}必须为1-${maxLength}个字符`);
    }
    return text;
}

export function validatePrivacyPolicyDraft(value: unknown): PrivacyPolicyDraft {
    const payload = record(value);
    if (typeof payload.enabled !== 'boolean') invalid('隐私条款开关无效');
    return {
        enabled: payload.enabled,
        title: normalizedText(payload.title, '条款标题', PRIVACY_POLICY_TITLE_MAX_LENGTH),
        body: normalizedText(payload.body, '条款正文', PRIVACY_POLICY_BODY_MAX_LENGTH)
    };
}

export function parsePrivacyPolicyContent(body: Uint8Array): PrivacyPolicyContent {
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(body));
    } catch {
        throw new Error('Stored privacy policy config is not valid JSON');
    }
    const source = record(value);
    const updatedAt = source.updatedAt;
    if (updatedAt !== null && (
        typeof updatedAt !== 'string' ||
        !Number.isFinite(Date.parse(updatedAt))
    )) {
        throw new Error('Stored privacy policy update time is invalid');
    }
    return {
        ...validatePrivacyPolicyDraft(source),
        updatedAt: updatedAt as string | null
    };
}

export function serializePrivacyPolicyContent(content: PrivacyPolicyContent): Uint8Array {
    return new TextEncoder().encode(`${JSON.stringify(content)}\n`);
}
