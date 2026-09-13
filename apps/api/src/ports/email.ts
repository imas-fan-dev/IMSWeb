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

export interface PlatformEmailSender {
    isAvailable(): Promise<boolean>;
    sendRegistrationVerification(
        message: PlatformEmailVerificationMessage
    ): Promise<void>;
    sendPasswordResetVerification(
        message: PlatformEmailVerificationMessage
    ): Promise<void>;
}

export interface EmailServices {
    platformEmailSender: PlatformEmailSender;
    platformEmailConfiguration: PlatformEmailConfiguration;
}
