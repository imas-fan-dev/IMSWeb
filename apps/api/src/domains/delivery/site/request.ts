import { invalidRequest } from '@/utils/validation/request-data';

export interface SiteIndexRequest {
    assetRequest: Request;
}

export function siteIndexRequest(request: Request): SiteIndexRequest {
    try {
        const url = new URL(request.url);
        url.pathname = '/index.html';
        url.search = '';
        return { assetRequest: new Request(url, request) };
    } catch {
        invalidRequest('站点请求地址无效');
    }
}
