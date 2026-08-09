import type { AdminRole } from '@/ports/repositories';

export interface AdminAccountResponse {
    id: number;
    username: string;
    producername: string;
    adminRole: AdminRole;
}

export interface AdminAccountListResponse {
    success: true;
    accounts: AdminAccountResponse[];
}

export interface CreateAdminAccountResponse {
    success: true;
    account: AdminAccountResponse;
}

export interface AdminAccountMutationResponse {
    success: true;
}

export type AdminAccountErrorResponse = {
    success: false;
    message: string;
};
