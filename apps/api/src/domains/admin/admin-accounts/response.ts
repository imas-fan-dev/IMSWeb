import type {
    AdminAccount,
    // pi-lens-ignore: ts:2305
    AdminAccountErrorResponse as ContractAdminAccountErrorResponse,
    AdminAccountList,
    AdminAccountMutation,
    // pi-lens-ignore: ts:2305
    AdminLogoutSuccessResponse
} from '@imsweb/contracts/admin';

export type AdminAccountResponse = AdminAccount;
export type AdminAccountListResponse = AdminAccountList;
export type CreateAdminAccountResponse = AdminAccountMutation;
export type AdminAccountMutationResponse = AdminLogoutSuccessResponse;
export type AdminAccountErrorResponse = ContractAdminAccountErrorResponse;
