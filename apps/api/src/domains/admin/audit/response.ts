export interface AuditLogResponse {
    id: number | string;
    username: string | null;
    producername: string | null;
    action: string | null;
    target: string | null;
    ip: string | null;
    time: string | null;
}

export interface AuditLogListResponse {
    success: true;
    data: AuditLogResponse[];
}

export type AuditErrorResponse =
    | {
        success: false;
        message: '未登录' | 'token无效';
    }
    | {
        message: '无权限（仅op可访问）';
    };

function auditRecord(value: unknown): { [key: string]: unknown } {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Audit repository returned an invalid row');
    }
    return value as { [key: string]: unknown };
}

function auditId(value: unknown): number | string {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
    if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value;
    throw new Error('Audit repository returned an invalid id');
}

function nullableText(value: unknown, field: string): string | null {
    if (value === null) return null;
    if (typeof value === 'string') return value;
    throw new Error(`Audit repository returned an invalid ${field}`);
}

export function toAuditLogResponse(value: unknown): AuditLogResponse {
    const log = auditRecord(value);
    return {
        id: auditId(log.id),
        username: nullableText(log.username, 'username'),
        producername: nullableText(log.producername, 'producername'),
        action: nullableText(log.action, 'action'),
        target: nullableText(log.target, 'target'),
        ip: nullableText(log.ip, 'ip'),
        time: nullableText(log.time, 'time')
    };
}
