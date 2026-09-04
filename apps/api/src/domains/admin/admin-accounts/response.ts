import type {
    AdminAccount,
    AdminAccountList,
    AdminAccountMutation,
} from '@imsweb/contracts/admin';
import type { SuccessFlag } from '@imsweb/contracts/common';

export type AdminAccountResponse = AdminAccount;
export type AdminAccountListResponse = AdminAccountList;
export type CreateAdminAccountResponse = AdminAccountMutation;
export type AdminAccountMutationResponse = SuccessFlag;

export type AdminAccountErrorResponse = {
    success: false;
    message: string;
};
