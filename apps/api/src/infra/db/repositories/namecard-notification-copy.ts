/**
 * Single source for the copy attached to every card lifecycle notification.
 *
 * Both review pipelines write the same kinds (`core-repository.ts` for the
 * exchange queue, `fudaba-repository.ts` for registered-card reviews), so the
 * wording lives here instead of being repeated per call site - and drifts
 * independently of the reviewer who edits it.
 */
export type NamecardNotificationCopyKind =
    | 'card-approved'
    | 'card-rejected'
    | 'card-locked'
    | 'card-unlocked'
    | 'card-transferred-out'
    | 'card-transferred-in'
    | 'card-admin-edited';

export interface NamecardNotificationCopy {
    kind: NamecardNotificationCopyKind;
    title: string;
    body: string;
}

export function cardApprovedCopy(cardNumber: number): NamecardNotificationCopy {
    return {
        kind: 'card-approved',
        title: `名片 #${cardNumber} 已通过审核`,
        body: `你的名片 #${cardNumber} 已通过审核，现已展示在名片墙上。`
    };
}

export function cardRejectedCopy(
    cardNumber: number,
    reason: string | null
): NamecardNotificationCopy {
    const trimmed = reason?.trim() ?? '';
    return {
        kind: 'card-rejected',
        title: `名片 #${cardNumber} 未通过审核`,
        body: trimmed.length > 0
            ? `你的名片 #${cardNumber} 未通过审核。驳回理由：${trimmed}。请按理由修改后可重新提交。`
            : `你的名片 #${cardNumber} 未通过审核。请修改后可重新提交。`
    };
}

export function cardLockedCopy(
    cardNumber: number,
    reason: string
): NamecardNotificationCopy {
    return {
        kind: 'card-locked',
        title: `名片 #${cardNumber} 已被锁定`,
        body: `你的名片 #${cardNumber} 已被锁定。锁定理由：${reason}。`
    };
}

export function cardUnlockedCopy(cardNumber: number): NamecardNotificationCopy {
    return {
        kind: 'card-unlocked',
        title: `名片 #${cardNumber} 已解除锁定`,
        body: `你的名片 #${cardNumber} 已解除锁定，重新进入审核队列。审核通过后会再次展示在名片墙上。`
    };
}

/**
 * A brand new revision of an already published card was turned down. The copy
 * has to say so, otherwise the owner assumes the card went offline.
 */
export function cardRevisionRejectedCopy(
    cardNumber: number,
    reason: string | null
): NamecardNotificationCopy {
    const trimmed = reason?.trim() ?? '';
    return {
        kind: 'card-rejected',
        title: `名片 #${cardNumber} 的新版本未通过审核`,
        body: trimmed.length > 0
            ? `你的名片 #${cardNumber} 的新版本未通过审核。驳回理由：${trimmed}。此前已发布的版本仍然有效。`
            : `你的名片 #${cardNumber} 的新版本未通过审核。此前已发布的版本仍然有效。`
    };
}

/** Same situation as a rejection, but the submission broke the rules. */
export function cardRevisionFlaggedCopy(
    cardNumber: number,
    reason: string
): NamecardNotificationCopy {
    return {
        kind: 'card-rejected',
        title: `名片 #${cardNumber} 的新版本已被标记违规`,
        body: `你的名片 #${cardNumber} 的新版本因违规被拒绝。理由：${reason}。此前已发布的版本仍然有效。`
    };
}


/**
 * The management console rewrote the card. The owner gets a line per changed
 * field, because "an administrator edited your card" alone leaves them guessing
 * what to fix.
 */
export function cardAdminEditedCopy(
    cardNumber: number,
    reason: string,
    changes: readonly { label: string; before: string | null; after: string | null }[]
): NamecardNotificationCopy {
    const lines = changes
        .slice(0, ADMIN_EDIT_NOTIFICATION_LIMIT)
        .map((change) => `- ${change.label}：${clip(change.before)} → ${clip(change.after)}`);
    const overflow = changes.length - lines.length;
    if (overflow > 0) lines.push(`- 另有 ${overflow} 项改动`);
    return {
        kind: 'card-admin-edited',
        title: `名片 #${cardNumber} 已被管理员修改`,
        body: clip(
            `你的名片 #${cardNumber} 已被管理员修改。理由：${reason}。\n修改内容：\n${lines.join('\n')}`,
            ADMIN_EDIT_NOTIFICATION_BODY_LIMIT
        )
    };
}

/** The card moved to another account: the previous owner is told why. */
export function cardTransferredOutCopy(
    cardNumber: number,
    reason: string
): NamecardNotificationCopy {
    return {
        kind: 'card-transferred-out',
        title: `名片 #${cardNumber} 已转出`,
        body: `你的名片 #${cardNumber} 已被管理员转移到其他账号。理由：${reason}。`
    };
}

/** …and the new owner learns where the card came from. */
export function cardTransferredInCopy(
    cardNumber: number,
    reason: string
): NamecardNotificationCopy {
    return {
        kind: 'card-transferred-in',
        title: `名片 #${cardNumber} 已归入你的账号`,
        body: `名片 #${cardNumber} 已由管理员归入你的账号。理由：${reason}。`
    };
}

const ADMIN_EDIT_NOTIFICATION_LIMIT = 12;
const ADMIN_EDIT_NOTIFICATION_BODY_LIMIT = 3800;

function clip(value: string | null, limit = 120): string {
    const text = (value ?? '').replace(/\s+/g, ' ').trim();
    if (!text.length) return '（空）';
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
