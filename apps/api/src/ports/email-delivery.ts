import type { PlatformEmailVerificationMessage } from '@/ports/email';

export type PlatformEmailDeliveryPurpose = 'registration' | 'password_reset';

export type PlatformEmailDeliveryFailureCategory =
    | 'configuration'
    | 'credentials'
    | 'dns'
    | 'dns_policy'
    | 'tls'
    | 'authentication'
    | 'smtp_transient'
    | 'smtp_permanent'
    | 'network'
    | 'envelope'
    | 'recipient_rejected'
    | 'deadline'
    | 'payload'
    | 'unknown';

interface PlatformEmailJobPayloadBase {
    normalizedEmail: string;
    code: string;
}

export type PlatformEmailJobPayload =
    | (PlatformEmailJobPayloadBase & {
          purpose: 'registration';
          expiresInMinutes: 10;
      })
    | (PlatformEmailJobPayloadBase & {
          purpose: 'password_reset';
          expiresInMinutes: 15;
      });

export interface PlatformEmailJobIdentity {
    readonly jobId: string;
    readonly purpose: PlatformEmailDeliveryPurpose;
    readonly deliveryToken: string;
    readonly payloadVersion: number;
}

declare const preparedPlatformEmailJobPayload: unique symbol;

export interface PlatformEmailPreparedJobPayload extends PlatformEmailJobIdentity {
    readonly normalizedEmail: string;
    readonly payloadCiphertext: string;
    readonly [preparedPlatformEmailJobPayload]: true;
}

export interface PlatformEmailJobPayloadCipher {
    encrypt(
        identity: PlatformEmailJobIdentity,
        payload: PlatformEmailJobPayload,
    ): PlatformEmailPreparedJobPayload;
    decrypt(identity: PlatformEmailJobIdentity, ciphertext: string): PlatformEmailJobPayload;
}

export interface PlatformEmailDeliveryEnqueueInput
    extends PlatformEmailPreparedJobPayload {
    readonly codeHash: string;
    readonly createdAt: number;
}

export type PlatformEmailDeliveryEnqueueResult =
    | {
          status: 'queued';
          resendAfter: number;
          retryAfterSeconds: number;
          policyUpdatedAt: number;
      }
    | { status: 'cooldown'; retryAfterMs: number }
    | {
          status: 'email-not-found';
          retryAfterSeconds: number;
          policyUpdatedAt: number;
      };

export interface PlatformEmailDeliveryQueue {
    enqueueRegistration(
        input: PlatformEmailDeliveryEnqueueInput,
    ): Promise<Exclude<PlatformEmailDeliveryEnqueueResult, { status: 'email-not-found' }>>;
    enqueuePasswordReset(
        input: PlatformEmailDeliveryEnqueueInput,
    ): Promise<PlatformEmailDeliveryEnqueueResult>;
}

export interface PlatformEmailDeliveryClaim extends PlatformEmailJobIdentity {
    payloadCiphertext: string;
    attempts: number;
    deadlineAt: number;
    leaseToken: string;
    leaseExpiresAt: number;
}

export type PlatformEmailDeliveryCompletionResult =
    | 'completed'
    | 'superseded'
    | 'lease-lost';

export type PlatformEmailDeliveryFailureResult =
    | 'retry-scheduled'
    | 'failed'
    | 'superseded'
    | 'lease-lost';

export interface PlatformEmailDeliveryWorkerStore {
    claim(input: {
        now: number;
        limit: number;
        leaseDurationMs: number;
    }): Promise<PlatformEmailDeliveryClaim[]>;
    renewLease(input: {
        jobId: string;
        leaseToken: string;
        now: number;
        leaseDurationMs: number;
    }): Promise<boolean>;
    complete(input: {
        jobId: string;
        leaseToken: string;
        normalizedEmail: string;
        deliveryToken: string;
        acceptedAt: number;
    }): Promise<PlatformEmailDeliveryCompletionResult>;
    recordFailure(input: {
        jobId: string;
        leaseToken: string;
        failedAt: number;
        category: PlatformEmailDeliveryFailureCategory;
        transient: boolean;
        acceptanceAmbiguous: boolean;
    }): Promise<PlatformEmailDeliveryFailureResult>;
    failExpired(now: number, limit: number): Promise<number>;
    deleteTerminal(before: number, limit: number): Promise<number>;
}

export type PlatformEmailDeliveryAttemptResult =
    | { status: 'accepted'; acceptedAt: number }
    | {
          status: 'failed';
          category: PlatformEmailDeliveryFailureCategory;
          transient: boolean;
          acceptanceAmbiguous: boolean;
      };

export interface PlatformEmailWorkerSender {
    deliverVerification(input: {
        purpose: PlatformEmailDeliveryPurpose;
        message: PlatformEmailVerificationMessage;
        deadlineAt: number;
        signal: AbortSignal;
    }): Promise<PlatformEmailDeliveryAttemptResult>;
}

export interface PlatformEmailResendPolicyRecord {
    resendCooldownSeconds: number;
    updatedAt: number;
}

export interface PlatformEmailResendPolicyCache {
    read(): Promise<PlatformEmailResendPolicyRecord | null>;
    writeIfNewer(record: PlatformEmailResendPolicyRecord): Promise<boolean>;
}
