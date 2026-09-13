import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import nodemailer from 'nodemailer';
import type {
    PlatformEmailConfiguration,
    PlatformEmailConfigurationAdminView,
    PlatformEmailConfigurationRecord,
    PlatformEmailConfigurationStore,
    PlatformEmailConfigurationWriteInput,
    PlatformEmailSender,
    PlatformEmailSecretBox,
    PlatformEmailVerificationMessage,
} from '@/ports/email';
import {
    PlatformEmailConfigurationValidationError,
    PlatformEmailDeliveryError,
} from '@/ports/email';

interface RuntimeSmtpConfiguration {
    host: string;
    port: number;
    security: PlatformEmailConfigurationRecord['security'];
    username: string;
    password: string;
    fromAddress: string;
    fromName: string;
}

interface SmtpTransportConfiguration extends RuntimeSmtpConfiguration {
    resolvedAddress: string;
}

interface SmtpTransport {
    verify(): Promise<true>;
    sendMail(input: {
        from: { address: string; name: string };
        to: string;
        subject: string;
        text: string;
        html: string;
    }): Promise<unknown>;
    close(): void;
}

type SmtpTransportFactory = (config: SmtpTransportConfiguration) => SmtpTransport;
type SmtpHostResolver = (hostname: string) => Promise<readonly string[]>;

const SMTP_HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

function createTransport(config: SmtpTransportConfiguration): SmtpTransport {
    return nodemailer.createTransport({
        host: config.resolvedAddress,
        port: config.port,
        secure: config.security === 'tls',
        requireTLS: config.security === 'starttls',
        authMethod: 'LOGIN',
        auth: {
            user: config.username,
            pass: config.password,
        },
        tls: {
            minVersion: 'TLSv1.2',
            rejectUnauthorized: true,
            servername: config.host,
        },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
    });
}

async function resolveHost(hostname: string): Promise<readonly string[]> {
    return (await lookup(hostname, { all: true, verbatim: true })).map(
        ({ address }) => address,
    );
}

function privateIpv4(address: string): boolean {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
        return true;
    }
    const [first, second, third] = parts as [number, number, number, number];
    return (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        first >= 224 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 192 && second === 0 && (third === 0 || third === 2)) ||
        (first === 192 && second === 88 && third === 99) ||
        (first === 198 && (second === 18 || second === 19)) ||
        (first === 198 && second === 51 && third === 100) ||
        (first === 203 && second === 0 && third === 113)
    );
}

function privateIpv6(address: string): boolean {
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) {
        const mapped = normalized.slice('::ffff:'.length);
        return isIP(mapped) !== 4 || privateIpv4(mapped);
    }
    return (
        normalized === '::' ||
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        /^(?:fe[89ab])/.test(normalized) ||
        normalized.startsWith('ff') ||
        normalized.startsWith('2001:db8:')
    );
}

function publicAddress(address: string): boolean {
    const version = isIP(address);
    if (version === 4) return !privateIpv4(address);
    if (version === 6) return !privateIpv6(address);
    return false;
}

function maskUsername(username: string): string {
    const [local, domain] = username.split('@');
    if (domain) {
        return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
    }
    return `${username.slice(0, Math.min(3, username.length))}***`;
}

function validFromName(value: string): boolean {
    return value.length >= 1 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
}

export class ConfiguredPlatformEmailService
    implements PlatformEmailConfiguration, PlatformEmailSender
{
    constructor(
        private readonly store: PlatformEmailConfigurationStore,
        private readonly secretBox: PlatformEmailSecretBox,
        private readonly transportFactory: SmtpTransportFactory = createTransport,
        private readonly hostResolver: SmtpHostResolver = resolveHost,
    ) {}

    async getSettings(): Promise<PlatformEmailConfigurationAdminView> {
        return this.adminView(await this.store.getPlatformEmailConfiguration());
    }

    async updateSettings(
        input: PlatformEmailConfigurationWriteInput,
    ): Promise<
        | { status: 'saved'; settings: PlatformEmailConfigurationAdminView }
        | { status: 'conflict'; settings: PlatformEmailConfigurationAdminView }
    > {
        const current = await this.store.getPlatformEmailConfiguration();
        if (current.updatedAt !== input.expectedUpdatedAt) {
            return { status: 'conflict', settings: this.adminView(current) };
        }
        const next = this.configurationRecord(input, current);
        if (next.enabled) {
            await this.withTransport(this.runtimeConfiguration(next), (transport) =>
                transport.verify(),
            );
        }
        const result = await this.store.updatePlatformEmailConfiguration({
            ...next,
            expectedUpdatedAt: input.expectedUpdatedAt,
        });
        return result.status === 'saved'
            ? { status: 'saved', settings: this.adminView(result.configuration) }
            : { status: 'conflict', settings: this.adminView(result.configuration) };
    }

    async sendTest(
        input: PlatformEmailConfigurationWriteInput & { recipient: string },
    ): Promise<
        | { status: 'sent'; recipient: string }
        | { status: 'conflict'; settings: PlatformEmailConfigurationAdminView }
    > {
        const current = await this.store.getPlatformEmailConfiguration();
        if (current.updatedAt !== input.expectedUpdatedAt) {
            return { status: 'conflict', settings: this.adminView(current) };
        }
        const config = this.runtimeConfiguration(
            this.configurationRecord(input, current),
        );
        const recipient = input.recipient.trim().toLowerCase();
        if (!EMAIL_PATTERN.test(recipient) || recipient.length > 320) {
            throw new PlatformEmailConfigurationValidationError(
                'Test recipient must be a valid email address',
            );
        }
        await this.withTransport(config, async (transport) => {
            await transport.verify();
            await transport.sendMail({
                from: { address: config.fromAddress, name: config.fromName },
                to: recipient,
                subject: 'IMSWeb email delivery test',
                text: 'This message confirms that IMSWeb SMTP delivery is configured correctly.',
                html: '<p>This message confirms that IMSWeb SMTP delivery is configured correctly.</p>',
            });
        });
        return { status: 'sent', recipient };
    }

    async isAvailable(): Promise<boolean> {
        try {
            const record = await this.store.getPlatformEmailConfiguration();
            if (!record.enabled) return false;
            this.runtimeConfiguration(record);
            return true;
        } catch {
            return false;
        }
    }

    sendRegistrationVerification(
        message: PlatformEmailVerificationMessage,
    ): Promise<void> {
        return this.sendVerification(
            message,
            'IMSWeb registration verification code',
            'registration',
        );
    }

    sendPasswordResetVerification(
        message: PlatformEmailVerificationMessage,
    ): Promise<void> {
        return this.sendVerification(
            message,
            'IMSWeb password reset verification code',
            'password reset',
        );
    }

    private async sendVerification(
        message: PlatformEmailVerificationMessage,
        subject: string,
        purpose: string,
    ): Promise<void> {
        const record = await this.store.getPlatformEmailConfiguration();
        if (!record.enabled) {
            throw new PlatformEmailDeliveryError('SMTP delivery is disabled');
        }
        const config = this.runtimeConfiguration(record);
        const text = [
            `Your IMSWeb ${purpose} verification code is ${message.code}.`,
            `It expires in ${message.expiresInMinutes} minutes.`,
            'If you did not request this code, you can ignore this message.',
        ].join('\n\n');
        const html = [
            `<p>Your IMSWeb ${purpose} verification code is:</p>`,
            `<p><strong>${message.code}</strong></p>`,
            `<p>It expires in ${message.expiresInMinutes} minutes.</p>`,
            '<p>If you did not request this code, you can ignore this message.</p>',
        ].join('');
        await this.withTransport(config, (transport) =>
            transport.sendMail({
                from: { address: config.fromAddress, name: config.fromName },
                to: message.email,
                subject,
                text,
                html,
            }),
        );
    }

    private configurationRecord(
        input: PlatformEmailConfigurationWriteInput,
        current: PlatformEmailConfigurationRecord,
    ): PlatformEmailConfigurationRecord {
        const host = input.host.trim().toLowerCase();
        let usernameCiphertext = current.usernameCiphertext;
        if (input.username !== undefined) {
            const username = input.username.trim();
            if (!username) {
                throw new PlatformEmailConfigurationValidationError(
                    'SMTP username cannot be empty',
                );
            }
            usernameCiphertext = this.secretBox.encrypt(username);
        }
        let passwordCiphertext = current.passwordCiphertext;
        if (input.password !== undefined) {
            if (!input.password) {
                throw new PlatformEmailConfigurationValidationError(
                    'SMTP password cannot be empty',
                );
            }
            passwordCiphertext = this.secretBox.encrypt(input.password);
        }
        const record: PlatformEmailConfigurationRecord = {
            enabled: input.enabled,
            host,
            port: input.port,
            security: input.security,
            usernameCiphertext,
            passwordCiphertext,
            fromAddress: input.fromAddress.trim().toLowerCase(),
            fromName: input.fromName.trim(),
            updatedAt: Math.max(Date.now(), current.updatedAt + 1),
        };
        this.validateRecord(record);
        return record;
    }

    private validateRecord(record: PlatformEmailConfigurationRecord): void {
        if (!SMTP_HOST_PATTERN.test(record.host)) {
            throw new PlatformEmailConfigurationValidationError(
                'SMTP host must be a public domain name',
            );
        }
        if (!Number.isInteger(record.port) || record.port < 1 || record.port > 65_535) {
            throw new PlatformEmailConfigurationValidationError(
                'SMTP port must be an integer from 1 to 65535',
            );
        }
        if (!['tls', 'starttls'].includes(record.security)) {
            throw new PlatformEmailConfigurationValidationError(
                'SMTP security must be tls or starttls',
            );
        }
        if (!EMAIL_PATTERN.test(record.fromAddress) || record.fromAddress.length > 320) {
            throw new PlatformEmailConfigurationValidationError(
                'SMTP sender address must be a valid email address',
            );
        }
        if (!validFromName(record.fromName)) {
            throw new PlatformEmailConfigurationValidationError(
                'SMTP sender name is invalid',
            );
        }
    }

    private runtimeConfiguration(
        record: PlatformEmailConfigurationRecord,
    ): RuntimeSmtpConfiguration {
        this.validateRecord(record);
        if (!record.usernameCiphertext || !record.passwordCiphertext) {
            throw new PlatformEmailConfigurationValidationError(
                'SMTP username and password are required',
            );
        }
        try {
            const username = this.secretBox.decrypt(record.usernameCiphertext).trim();
            const password = this.secretBox.decrypt(record.passwordCiphertext);
            if (!username || !password) throw new Error('Empty SMTP credential');
            return {
                host: record.host,
                port: record.port,
                security: record.security,
                username,
                password,
                fromAddress: record.fromAddress,
                fromName: record.fromName,
            };
        } catch {
            throw new PlatformEmailConfigurationValidationError(
                'Stored SMTP credentials are invalid and must be replaced',
            );
        }
    }

    private adminView(
        record: PlatformEmailConfigurationRecord,
    ): PlatformEmailConfigurationAdminView {
        let usernameMasked: string | null = null;
        let passwordConfigured = false;
        try {
            if (record.usernameCiphertext) {
                const username = this.secretBox.decrypt(record.usernameCiphertext).trim();
                if (username) usernameMasked = maskUsername(username);
            }
            if (record.passwordCiphertext) {
                passwordConfigured = Boolean(
                    this.secretBox.decrypt(record.passwordCiphertext),
                );
            }
        } catch {
            usernameMasked = null;
            passwordConfigured = false;
        }
        return {
            enabled: record.enabled,
            configured: Boolean(
                record.host &&
                usernameMasked &&
                passwordConfigured &&
                record.fromAddress,
            ),
            host: record.host,
            port: record.port,
            security: record.security,
            usernameMasked,
            passwordConfigured,
            fromAddress: record.fromAddress,
            fromName: record.fromName,
            updatedAt: record.updatedAt,
        };
    }

    private async withTransport<T>(
        config: RuntimeSmtpConfiguration,
        operation: (transport: SmtpTransport) => Promise<T>,
    ): Promise<T> {
        let addresses: readonly string[];
        try {
            addresses = await this.hostResolver(config.host);
        } catch {
            throw new PlatformEmailDeliveryError('SMTP host could not be resolved');
        }
        const [resolvedAddress] = addresses;
        if (
            !resolvedAddress ||
            addresses.some((address) => !publicAddress(address))
        ) {
            throw new PlatformEmailConfigurationValidationError(
                'SMTP host must resolve only to public addresses',
            );
        }
        const transport = this.transportFactory({
            ...config,
            resolvedAddress,
        });
        try {
            return await operation(transport);
        } catch {
            throw new PlatformEmailDeliveryError('SMTP connection or delivery failed');
        } finally {
            transport.close();
        }
    }
}
