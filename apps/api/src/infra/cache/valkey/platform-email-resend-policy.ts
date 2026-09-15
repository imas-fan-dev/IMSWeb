import type {
    PlatformEmailResendPolicyCache,
    PlatformEmailResendPolicyRecord,
} from '@/ports/email-delivery';

interface ValkeyPlatformEmailResendPolicyClient {
    sendCommand<T = unknown>(
        args: readonly string[],
        options?: { abortSignal?: AbortSignal },
    ): Promise<T>;
}

export interface ValkeyPlatformEmailResendPolicyCacheOptions {
    keyPrefix: string;
}

const LOGICAL_KEY = 'platform-email-resend-policy:v1';
const TTL_SECONDS = 5;

export const VALKEY_PLATFORM_EMAIL_RESEND_POLICY_WRITE_SCRIPT = `
local key = KEYS[1]
local incoming = ARGV[1]
local incomingUpdatedAt = tonumber(ARGV[2])
local ttlSeconds = tonumber(ARGV[3])
local currentRaw = redis.call('GET', key)
if currentRaw then
  local decoded, current = pcall(cjson.decode, currentRaw)
  local valid = decoded and type(current) == 'table'
  local fields = 0
  if valid then
    for field, _ in pairs(current) do
      fields = fields + 1
      if field ~= 'resendCooldownSeconds' and field ~= 'updatedAt' then
        valid = false
      end
    end
  end
  if valid then
    valid = fields == 2
      and type(current.resendCooldownSeconds) == 'number'
      and current.resendCooldownSeconds == math.floor(current.resendCooldownSeconds)
      and current.resendCooldownSeconds >= 30
      and current.resendCooldownSeconds <= 600
      and type(current.updatedAt) == 'number'
      and current.updatedAt == math.floor(current.updatedAt)
      and current.updatedAt >= 0
  end
  if valid and current.updatedAt > incomingUpdatedAt then
    return 0
  end
end
redis.call('SET', key, incoming, 'EX', ttlSeconds)
return 1
`.trim();

function isPolicyRecord(value: unknown): value is PlatformEmailResendPolicyRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record);
    return fields.length === 2
        && fields.includes('resendCooldownSeconds')
        && fields.includes('updatedAt')
        && Number.isSafeInteger(record.resendCooldownSeconds)
        && Number(record.resendCooldownSeconds) >= 30
        && Number(record.resendCooldownSeconds) <= 600
        && Number.isSafeInteger(record.updatedAt)
        && Number(record.updatedAt) >= 0;
}

function parsePolicyRecord(value: string): PlatformEmailResendPolicyRecord | null {
    try {
        const parsed: unknown = JSON.parse(value);
        return isPolicyRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function assertPolicyRecord(
    record: PlatformEmailResendPolicyRecord,
): void {
    if (!isPolicyRecord(record)) {
        throw new Error('Platform email resend policy cache record is invalid');
    }
}

export class ValkeyPlatformEmailResendPolicyCache
    implements PlatformEmailResendPolicyCache
{
    private readonly key: string;

    constructor(
        private readonly client: ValkeyPlatformEmailResendPolicyClient,
        options: ValkeyPlatformEmailResendPolicyCacheOptions,
    ) {
        this.key = `${options.keyPrefix}${LOGICAL_KEY}`;
    }

    async read(signal?: AbortSignal): Promise<PlatformEmailResendPolicyRecord | null> {
        const reply = await this.client.sendCommand<unknown>(
            ['GET', this.key],
            { abortSignal: signal },
        );
        if (reply === null) return null;
        if (typeof reply !== 'string') {
            throw new Error('Valkey resend policy read returned an unexpected reply');
        }
        return parsePolicyRecord(reply);
    }

    async writeIfNewer(
        record: PlatformEmailResendPolicyRecord,
        signal?: AbortSignal,
    ): Promise<boolean> {
        assertPolicyRecord(record);
        const reply = await this.client.sendCommand<unknown>(
            [
                'EVAL',
                VALKEY_PLATFORM_EMAIL_RESEND_POLICY_WRITE_SCRIPT,
                '1',
                this.key,
                JSON.stringify(record),
                String(record.updatedAt),
                String(TTL_SECONDS),
            ],
            { abortSignal: signal },
        );
        if (reply === 0) return false;
        if (reply === 1) return true;
        throw new Error('Valkey resend policy write returned an unexpected reply');
    }
}
