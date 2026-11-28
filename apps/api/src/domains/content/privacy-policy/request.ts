import {
    validatePrivacyPolicyDraft,
    type PrivacyPolicyDraft
} from '@/domains/content/privacy-policy/data';
import { revisionedContentRequest } from '@/utils/validation/request-data';

export interface AdminPrivacyPolicyUpdateRequest {
    content: PrivacyPolicyDraft;
    revision: string | null;
}

export function validateAdminPrivacyPolicyUpdateRequest(
    value: unknown
): AdminPrivacyPolicyUpdateRequest {
    const request = revisionedContentRequest(value, '隐私条款');
    return {
        content: validatePrivacyPolicyDraft(request.content),
        revision: request.revision
    };
}
