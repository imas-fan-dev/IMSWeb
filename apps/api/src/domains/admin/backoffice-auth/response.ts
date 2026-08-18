import type {
    AdminRole,
    AdminSession,
    AdminSessionResponse,
} from '@imsweb/contracts/admin';
import type { SuccessFlag } from '@imsweb/contracts/common';

export interface LoginSuccessResponse {
    success: true;
    token: string;
    username: string;
    producername: string | null;
    dept: string;
    adminRole: AdminRole | null;
}

export interface LoginErrorResponse {
    success: false;
    message: string;
}

// 会话检查在共享 AdminSession 之上组合 CSRF/JWT 附加字段；
// Web 端 adminSessionSchema 为非 strict，忽略这些附加字段。
export interface CheckAuthUserResponse extends Omit<AdminSession, 'adminRole'> {
    adminRole?: AdminRole | null;
    csrfSecret: string;
    jti?: string;
    iat?: number;
    exp?: number;
}

export interface CheckAuthResponse {
    success: true;
    user: CheckAuthUserResponse;
}

export type RefreshUserResponse = AdminSession;
export type RefreshSuccessResponse = AdminSessionResponse;

export interface RefreshErrorResponse {
    success: false;
    message: string;
}

export type LogoutSuccessResponse = SuccessFlag;

export interface LogoutErrorResponse {
    success: false;
    message: string;
}
