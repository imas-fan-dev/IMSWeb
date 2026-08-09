import type { AdminRole } from '@/ports/repositories';

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

export interface CheckAuthUserResponse {
    id: number;
    username: string;
    producername: string;
    dept: string;
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

export interface RefreshUserResponse {
    id: number;
    username: string;
    producername: string;
    dept: string;
    adminRole: AdminRole | null;
}

export interface RefreshSuccessResponse {
    success: true;
    user: RefreshUserResponse;
}

export interface RefreshErrorResponse {
    success: false;
    message: string;
}

export interface LogoutSuccessResponse {
    success: true;
}

export interface LogoutErrorResponse {
    success: false;
    message: string;
}
