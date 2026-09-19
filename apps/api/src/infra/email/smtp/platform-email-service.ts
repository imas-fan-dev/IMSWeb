import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import nodemailer from 'nodemailer';
import type {
    PlatformEmailDeliveryAttemptResult,
    PlatformEmailDeliveryFailureCategory,
    PlatformEmailDeliveryPurpose,
    PlatformEmailResendPolicyCache,
    PlatformEmailWorkerSender,
} from '@/ports/email-delivery';
import type {
    PlatformEmailConfiguration,
    PlatformEmailConfigurationAdminView,
    PlatformEmailConfigurationRecord,
    PlatformEmailConfigurationStore,
    PlatformEmailConfigurationWriteInput,
    PlatformEmailSecretBox,
    PlatformEmailVerificationMessage,
} from '@/ports/email';
import {
    PlatformEmailConfigurationValidationError,
    PlatformEmailDeliveryError,
} from '@/ports/email';
import { withBoundedCacheOperation } from '@/utils/cache/bounded-operation';

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
    }): Promise<{ accepted?: readonly unknown[] }>;
    close(): void;
}

type SmtpTransportFactory = (config: SmtpTransportConfiguration) => SmtpTransport;
type SmtpHostResolver = (hostname: string) => Promise<readonly string[]>;

type PlatformEmailResendPolicyWriteErrorReporter = (
    operation: 'write-through',
) => void;

interface ConfiguredPlatformEmailServiceOptions {
    resendPolicyCache?: PlatformEmailResendPolicyCache;
    reportResendPolicyCacheError?: PlatformEmailResendPolicyWriteErrorReporter;
}

function reportPlatformEmailResendPolicyWriteError(
    operation: 'write-through',
): void {
    console.error(JSON.stringify({
        event: 'platform_email_resend_policy_cache_error',
        operation,
    }));
}

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

const nonPublicIpv4Addresses = new BlockList();
const publicIpv6Addresses = new BlockList();
const nonPublicIpv6Addresses = new BlockList();

for (const [network, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
] as const) {
    nonPublicIpv4Addresses.addSubnet(network, prefix, 'ipv4');
}

publicIpv6Addresses.addSubnet('2000::', 3, 'ipv6');

for (const [network, prefix] of [
    ['2001::', 23],
    ['2001:2::', 48],
    ['2001:10::', 28],
    ['2001:20::', 28],
    ['2001:db8::', 32],
    ['2002::', 16],
    ['3fff::', 20],
] as const) {
    nonPublicIpv6Addresses.addSubnet(network, prefix, 'ipv6');
}

function publicAddress(address: string): boolean {
    const version = isIP(address);
    if (version === 4) return !nonPublicIpv4Addresses.check(address, 'ipv4');
    if (version === 6) {
        return (
            publicIpv6Addresses.check(address, 'ipv6') &&
            !nonPublicIpv6Addresses.check(address, 'ipv6')
        );
    }
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

interface SmtpErrorEvidence {
    code?: unknown;
    command?: unknown;
    responseCode?: unknown;
}

class PlatformEmailAttemptDeadlineError extends Error {
    override readonly name = 'PlatformEmailAttemptDeadlineError';

    constructor(readonly acceptanceAmbiguous = false) {
        super('Platform email delivery attempt deadline exceeded');
    }
}

class PlatformEmailAttemptAbortedError extends Error {
    override readonly name = 'PlatformEmailAttemptAbortedError';
}

const TRANSIENT_NETWORK_CODES = new Set([
    'ETIMEDOUT',
    'ESOCKET',
    'ECONNECTION',
    'ECONNRESET',
    'ECONNREFUSED',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'EPIPE',
]);

const TLS_ERROR_CODES = new Set([
    'CERT_HAS_EXPIRED',
    'CERT_NOT_YET_VALID',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_GET_ISSUER_CERT',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

function tlsErrorCode(code: string): boolean {
    return (
        TLS_ERROR_CODES.has(code) ||
        code.startsWith('ERR_TLS') ||
        code.startsWith('ERR_SSL') ||
        code.startsWith('CERT_')
    );
}

function safeCloseTransport(transport: SmtpTransport): void {
    try {
        transport.close();
    } catch {
        // Closing is best effort after the attempt result has been classified.
    }
}

function smtpErrorEvidence(error: unknown): SmtpErrorEvidence {
    return error && typeof error === 'object' ? error : {};
}

function classifiedFailure(error: unknown): Exclude<
    PlatformEmailDeliveryAttemptResult,
    { status: 'accepted' }
> {
    const evidence = smtpErrorEvidence(error);
    const code = typeof evidence.code === 'string' ? evidence.code : '';
    const responseCode = typeof evidence.responseCode === 'number'
        ? evidence.responseCode
        : 0;
    const acceptanceAmbiguous = error instanceof PlatformEmailAttemptDeadlineError
        ? error.acceptanceAmbiguous
        : typeof evidence.command === 'string' &&
          evidence.command.toUpperCase() === 'DATA' &&
          (TRANSIENT_NETWORK_CODES.has(code) || code === 'EAI_AGAIN');
    let category: PlatformEmailDeliveryFailureCategory = 'unknown';
    let transient = false;
    if (error instanceof PlatformEmailAttemptDeadlineError) {
        category = 'deadline';
    } else if (responseCode >= 400 && responseCode < 500) {
        category = 'smtp_transient';
        transient = true;
    } else if (code === 'EAUTH' || responseCode === 535) {
        category = 'authentication';
    } else if (responseCode >= 500 && responseCode < 600) {
        category = 'smtp_permanent';
    } else if (code === 'EAI_AGAIN') {
        category = 'dns';
        transient = true;
    } else if (code === 'ENOTFOUND') {
        category = 'dns';
    } else if (tlsErrorCode(code)) {
        category = 'tls';
    } else if (TRANSIENT_NETWORK_CODES.has(code)) {
        category = 'network';
        transient = true;
    } else if (code === 'EENVELOPE' || code === 'EMESSAGE') {
        category = 'envelope';
    }
    return { status: 'failed', category, transient, acceptanceAmbiguous };
}

function acceptedRecipient(value: unknown): string | null {
    if (typeof value === 'string') return value.trim().toLowerCase();
    if (value && typeof value === 'object' && 'address' in value) {
        const address = value.address;
        return typeof address === 'string' ? address.trim().toLowerCase() : null;
    }
    return null;
}

function verificationContent(
    message: PlatformEmailVerificationMessage,
    purpose: string,
): { text: string; html: string } {
    return {
        text: [
            `Your IMSWeb ${purpose} verification code is ${message.code}.`,
            `It expires in ${message.expiresInMinutes} minutes.`,
            'If you did not request this code, you can ignore this message.',
        ].join('\n\n'),
        html: [
            `<p>Your IMSWeb ${purpose} verification code is:</p>`,
            `<p><strong>${message.code}</strong></p>`,
            `<p>It expires in ${message.expiresInMinutes} minutes.</p>`,
            '<p>If you did not request this code, you can ignore this message.</p>',
        ].join(''),
    };
}

export class ConfiguredPlatformEmailService
    implements PlatformEmailConfiguration, PlatformEmailWorkerSender
{
    private readonly resendPolicyCache?: PlatformEmailResendPolicyCache;
    private readonly reportResendPolicyCacheError: PlatformEmailResendPolicyWriteErrorReporter;

    constructor(
        private readonly store: PlatformEmailConfigurationStore,
        private readonly secretBox: PlatformEmailSecretBox,
        private readonly transportFactory: SmtpTransportFactory = createTransport,
        private readonly hostResolver: SmtpHostResolver = resolveHost,
        options: ConfiguredPlatformEmailServiceOptions = {},
    ) {
        this.resendPolicyCache = options.resendPolicyCache;
        this.reportResendPolicyCacheError = options.reportResendPolicyCacheError
            ?? reportPlatformEmailResendPolicyWriteError;
    }

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
        if (result.status === 'conflict') {
            return { status: 'conflict', settings: this.adminView(result.configuration) };
        }
        await this.writeResendPolicy(result.configuration);
        return { status: 'saved', settings: this.adminView(result.configuration) };
    }

    private async writeResendPolicy(
        configuration: PlatformEmailConfigurationRecord,
    ): Promise<void> {
        const cache = this.resendPolicyCache;
        if (!cache) return;
        try {
            await withBoundedCacheOperation((signal) =>
                cache.writeIfNewer(
                    {
                        resendCooldownSeconds: configuration.resendCooldownSeconds,
                        updatedAt: configuration.updatedAt,
                    },
                    signal,
                ),
            );
        } catch {
            try {
                this.reportResendPolicyCacheError('write-through');
            } catch {
                // Cache diagnostics must not change a committed settings response.
            }
        }
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

    async deliverVerification(input: {
        purpose: PlatformEmailDeliveryPurpose;
        message: PlatformEmailVerificationMessage;
        deadlineAt: number;
        signal: AbortSignal;
    }): Promise<PlatformEmailDeliveryAttemptResult> {
        if (input.signal.aborted) {
            return classifiedFailure(new PlatformEmailAttemptAbortedError());
        }
        if (input.deadlineAt <= Date.now()) {
            return classifiedFailure(new PlatformEmailAttemptDeadlineError());
        }
        let config: RuntimeSmtpConfiguration;
        try {
            const record = await this.beforeDeadline(
                () => this.store.getPlatformEmailConfiguration(),
                input.deadlineAt,
                { signal: input.signal },
            );
            if (!record.enabled) {
                return {
                    status: 'failed',
                    category: 'configuration',
                    transient: false,
                    acceptanceAmbiguous: false,
                };
            }
            config = this.runtimeConfiguration(record);
        } catch (error) {
            if (error instanceof PlatformEmailAttemptDeadlineError) {
                return classifiedFailure(error);
            }
            return {
                status: 'failed',
                category:
                    error instanceof PlatformEmailConfigurationValidationError
                        ? 'credentials'
                        : 'configuration',
                transient: false,
                acceptanceAmbiguous: false,
            };
        }

        let transport: SmtpTransport | undefined;
        let transportClosed = false;
        const closeTransport = (): void => {
            if (!transport || transportClosed) return;
            transportClosed = true;
            safeCloseTransport(transport);
        };
        try {
            const addresses = await this.beforeDeadline(
                () => this.hostResolver(config.host),
                input.deadlineAt,
                { signal: input.signal },
            );
            const [resolvedAddress] = addresses;
            if (
                !resolvedAddress ||
                addresses.some((address) => !publicAddress(address))
            ) {
                return {
                    status: 'failed',
                    category: 'dns_policy',
                    transient: false,
                    acceptanceAmbiguous: false,
                };
            }

            this.requireAttemptActive(input.deadlineAt, input.signal);
            transport = this.transportFactory({ ...config, resolvedAddress });
            this.requireAttemptActive(input.deadlineAt, input.signal);
            const purpose = input.purpose === 'registration'
                ? 'registration'
                : 'password reset';
            const subject = input.purpose === 'registration'
                ? 'IMSWeb registration verification code'
                : 'IMSWeb password reset verification code';
            const content = verificationContent(input.message, purpose);
            const result = await this.beforeDeadline(
                () => transport!.sendMail({
                    from: { address: config.fromAddress, name: config.fromName },
                    to: input.message.email,
                    subject,
                    ...content,
                }),
                input.deadlineAt,
                {
                    signal: input.signal,
                    onAbort: closeTransport,
                    onDeadline: closeTransport,
                    acceptanceAmbiguousOnDeadline: true,
                },
            );
            const acceptedAt = Date.now();
            if (acceptedAt > input.deadlineAt) {
                return classifiedFailure(new PlatformEmailAttemptDeadlineError(true));
            }
            if (input.signal.aborted) {
                return classifiedFailure(new PlatformEmailAttemptAbortedError());
            }
            const intendedRecipient = input.message.email.trim().toLowerCase();
            const accepted = result.accepted?.some(
                (recipient) => acceptedRecipient(recipient) === intendedRecipient,
            );
            if (!accepted) {
                return {
                    status: 'failed',
                    category: 'recipient_rejected',
                    transient: false,
                    acceptanceAmbiguous: false,
                };
            }
            return { status: 'accepted', acceptedAt };
        } catch (error) {
            return classifiedFailure(error);
        } finally {
            closeTransport();
        }
    }

    private requireAttemptActive(deadlineAt: number, signal: AbortSignal): void {
        if (signal.aborted) {
            throw new PlatformEmailAttemptAbortedError();
        }
        if (deadlineAt <= Date.now()) {
            throw new PlatformEmailAttemptDeadlineError();
        }
    }

    private beforeDeadline<T>(
        operation: () => Promise<T> | T,
        deadlineAt: number,
        options: {
            signal?: AbortSignal;
            onAbort?: () => void;
            onDeadline?: () => void;
            acceptanceAmbiguousOnDeadline?: boolean;
        } = {},
    ): Promise<T> {
        if (options.signal?.aborted) {
            try {
                options.onAbort?.();
            } catch {
                // Cancellation still wins when transport cleanup fails.
            }
            return Promise.reject(new PlatformEmailAttemptAbortedError());
        }
        const remaining = deadlineAt - Date.now();
        if (remaining <= 0) {
            try {
                options.onDeadline?.();
            } catch {
                // The deadline result takes precedence over transport cleanup.
            }
            return Promise.reject(
                new PlatformEmailAttemptDeadlineError(
                    options.acceptanceAmbiguousOnDeadline,
                ),
            );
        }
        return new Promise<T>((resolve, reject) => {
            let settled = false;
            let timer: NodeJS.Timeout;
            const settle = (operation: () => void): void => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                options.signal?.removeEventListener('abort', abort);
                operation();
            };
            const abort = (): void => {
                try {
                    options.onAbort?.();
                } catch {
                    // Cancellation still wins when transport cleanup fails.
                }
                settle(() => reject(new PlatformEmailAttemptAbortedError()));
            };
            timer = setTimeout(() => {
                try {
                    options.onDeadline?.();
                } catch {
                    // The deadline result takes precedence over transport cleanup.
                }
                settle(() => reject(
                    new PlatformEmailAttemptDeadlineError(
                        options.acceptanceAmbiguousOnDeadline,
                    ),
                ));
            }, remaining);
            options.signal?.addEventListener('abort', abort, { once: true });
            if (options.signal?.aborted) {
                abort();
                return;
            }
            let operationResult: Promise<T>;
            try {
                operationResult = Promise.resolve(operation());
            } catch (error) {
                settle(() => reject(error));
                return;
            }
            operationResult.then(
                (value) => settle(() => resolve(value)),
                (error) => settle(() => reject(error)),
            );
        });
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
            resendCooldownSeconds: input.resendCooldownSeconds,
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
        if (
            !Number.isInteger(record.resendCooldownSeconds) ||
            record.resendCooldownSeconds < 30 ||
            record.resendCooldownSeconds > 600
        ) {
            throw new PlatformEmailConfigurationValidationError(
                'Verification code resend cooldown must be an integer from 30 to 600 seconds',
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
            resendCooldownSeconds: record.resendCooldownSeconds,
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
