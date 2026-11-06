import type {
    // pi-lens-ignore: ts:2305
    AdminBackofficeFailureResponse,
    // pi-lens-ignore: ts:2305
    AdminLoginSuccessResponse,
    // pi-lens-ignore: ts:2305
    AdminLogoutSuccessResponse,
    // pi-lens-ignore: ts:2305
    AdminRefreshSuccessResponse,
    // pi-lens-ignore: ts:2305
    AdminRefreshUser,
    AdminSessionResponse
} from '@imsweb/contracts/admin';

export type LoginSuccessResponse = AdminLoginSuccessResponse;
export type LoginErrorResponse = AdminBackofficeFailureResponse;
export type CheckAuthResponse = AdminSessionResponse;
export type RefreshUserResponse = AdminRefreshUser;
export type RefreshSuccessResponse = AdminRefreshSuccessResponse;
export type RefreshErrorResponse = AdminBackofficeFailureResponse;
export type LogoutSuccessResponse = AdminLogoutSuccessResponse;
export type LogoutErrorResponse = AdminBackofficeFailureResponse;
