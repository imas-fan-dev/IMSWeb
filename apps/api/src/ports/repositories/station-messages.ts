/**
 * 后台站内信（群发）的持久化端口。
 *
 * 站内信的「送达」复用 `namecard_notifications`（`kind = 'station-message'`），
 * 因此收件人在「消息」面板读到的是一条普通通知，未读角标与保留策略完全共用；
 * `station_messages` 只承担批次审计、定时派发与邮件转发的进度，不参与读取。
 */
export type StationMessageAudience = 'all' | 'selected';

export type StationMessageStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'canceled';

export type StationMessageEmailState = 'pending' | 'sent' | 'failed' | 'skipped';

export interface StationMessageRecord {
    id: string;
    senderAdminId: string;
    senderAdminName: string;
    title: string;
    body: string;
    audience: StationMessageAudience;
    forwardEmail: boolean;
    scheduledAt: number | null;
    status: StationMessageStatus;
    recipientCount: number;
    deliveredCount: number;
    emailSentCount: number;
    emailFailedCount: number;
    failureReason: string | null;
    createdAt: number;
    startedAt: number | null;
    completedAt: number | null;
}

export interface NewStationMessageInput {
    senderAdminId: string;
    senderAdminName: string;
    title: string;
    body: string;
    audience: StationMessageAudience;
    /** `audience === 'selected'` 时的收件人；`'all'` 时为空。 */
    accountIds: readonly string[];
    forwardEmail: boolean;
    /** 毫秒时间戳；`null` 表示立即发送。 */
    scheduledAt: number | null;
}

export interface StationMessageTarget {
    accountId: string;
    displayName: string;
    email: string | null;
    status: string;
}

/** 某一批次的收件人快照，供后台「历史审计」列出指定接收用户。 */
export interface StationMessageDelivery {
    accountId: string;
    displayName: string | null;
    email: string | null;
    delivered: boolean;
    emailState: StationMessageEmailState;
}

export interface StationMessageEmailTarget {
    accountId: string;
    email: string;
    attempts: number;
}

export interface StationMessageEmailResult {
    state: Exclude<StationMessageEmailState, 'pending' | 'skipped'>;
    error: string | null;
    /** 失败但仍可重试时为 `true`：收件人保持 `pending`，等下一轮再发。 */
    retryable: boolean;
}

export interface StationMessageRepository {
    create(input: NewStationMessageInput): Promise<StationMessageRecord>;
    findById(id: string): Promise<StationMessageRecord | null>;
    list(query: {
        limit: number;
        offset: number;
    }): Promise<{ messages: StationMessageRecord[]; total: number }>;
    listTargets(query: {
        query?: string;
        limit: number;
        offset: number;
    }): Promise<{ targets: StationMessageTarget[]; total: number }>;
    /** 该批次的名册快照（收件人 + 送达/邮件状态），按账号 ID 排序。 */
    listDeliveries(messageId: string): Promise<StationMessageDelivery[]>;
    cancel(id: string): Promise<StationMessageRecord | null>;
    /**
     * 领取一条到期的定时批次并把它派发出去（写入所有收件人的站内信）。
     * 返回被派发的批次；没有到期的批次时返回 `null`。
     */
    dispatchDue(): Promise<StationMessageRecord | null>;
    /** 还有待转发邮件的批次（按创建时间正序），供派发器逐条推进。 */
    listPendingEmailMessages(limit: number): Promise<string[]>;
    /** 领取该批次尚未投递邮件的收件人（含邮箱地址）。 */
    claimEmailTargets(messageId: string, limit: number): Promise<StationMessageEmailTarget[]>;
    markEmailResult(
        messageId: string,
        accountId: string,
        result: StationMessageEmailResult
    ): Promise<void>;
    /** 标记批次邮件转发全部结束（记录计数并清理 pending 残留）。 */
    completeEmailForwarding(messageId: string): Promise<void>;
}
