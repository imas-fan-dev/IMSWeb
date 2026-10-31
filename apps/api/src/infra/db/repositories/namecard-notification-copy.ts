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
    | 'card-unlocked';

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
