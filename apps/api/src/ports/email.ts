export type PlatformEmailConnectionSecurity = 'tls' | 'starttls';

export interface PlatformEmailVerificationMessage {
    email: string;
    code: string;
    expiresInMinutes: number;
}

export interface PlatformEmailConfigurationRecord {
    enabled: boolean;
    host: string;
    port: number;
    security: PlatformEmailConnectionSecurity;
    usernameCiphertext: string | null;
    passwordCiphertext: string | null;
    fromAddress: string;
    fromName: string;
    resendCooldownSeconds: number;
    updatedAt: number;
}

export interface PlatformEmailConfigurationAdminView {
    enabled: boolean;
    configured: boolean;
    host: string;
    port: number;
    security: PlatformEmailConnectionSecurity;
    usernameMasked: string | null;
    passwordConfigured: boolean;
    fromAddress: string;
    fromName: string;
    resendCooldownSeconds: number;
    updatedAt: number;
}

export interface PlatformEmailConfigurationWriteInput {
    enabled: boolean;
    host: string;
    port: number;
    security: PlatformEmailConnectionSecurity;
    username?: string;
    password?: string;
    fromAddress: string;
    fromName: string;
    resendCooldownSeconds: number;
    expectedUpdatedAt: number;
}

export interface PlatformEmailConfigurationStore {
    getPlatformEmailConfiguration(): Promise<PlatformEmailConfigurationRecord>;
    updatePlatformEmailConfiguration(
        input: PlatformEmailConfigurationRecord & { expectedUpdatedAt: number }
    ): Promise<
        | { status: 'saved'; configuration: PlatformEmailConfigurationRecord }
        | { status: 'conflict'; configuration: PlatformEmailConfigurationRecord }
    >;
}

export interface PlatformEmailSecretBox {
    encrypt(value: string): string;
    decrypt(value: string): string;
}

export class PlatformEmailConfigurationValidationError extends Error {
    override readonly name = 'PlatformEmailConfigurationValidationError';
}

export class PlatformEmailDeliveryError extends Error {
    override readonly name = 'PlatformEmailDeliveryError';
}

export interface PlatformEmailConfiguration {
    getSettings(): Promise<PlatformEmailConfigurationAdminView>;
    updateSettings(input: PlatformEmailConfigurationWriteInput): Promise<
        | { status: 'saved'; settings: PlatformEmailConfigurationAdminView }
        | { status: 'conflict'; settings: PlatformEmailConfigurationAdminView }
    >;
    sendTest(
        input: PlatformEmailConfigurationWriteInput & { recipient: string }
    ): Promise<
        | { status: 'sent'; recipient: string }
        | { status: 'conflict'; settings: PlatformEmailConfigurationAdminView }
    >;
}

/** 后台群发转发的正文载荷（纯文本，服务端负责转 HTML）。 */
export interface PlatformEmailMessage {
    recipient: string;
    subject: string;
    text: string;
}

export interface PlatformEmailMessageResult {
    status: 'sent' | 'failed';
    /** 失败时是否值得重试（临时性错误）。 */
    retryable: boolean;
    message: string | null;
}

/**
 * 用当前 SMTP 配置发送任意标题/正文的邮件。
 *
 * 与验证码投递队列的区别：调用方自带进度表（`station_message_recipients`），
 * 所以这里只做「一批一次连接」的投递与逐封结果返回，不参与重试调度。
 */
export interface PlatformEmailMessageSender {
    sendMessages(
        messages: readonly PlatformEmailMessage[]
    ): Promise<PlatformEmailMessageResult[]>;
}

export interface EmailServices {
    platformEmailConfiguration: PlatformEmailConfiguration;
    platformEmailMessageSender: PlatformEmailMessageSender;
}
