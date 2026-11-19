/**
 * 待确认交换的有效期（doc `docs/architecture/namecard-exchange.md` §7）。
 *
 * 读取侧超过这个时长仍 `pending` 的行直接投影成 `expired`（不写库也自洽）；
 * 裁决侧命中过期行时顺手把它落成 `expired`，并把通知正文里承诺的
 * 「一周内不处理将自动过期」兑现成 409。
 *
 * 常量本体住在 `@imsweb/contracts/namecards-runtime`：基础设施（仓储）也要按它投影，
 * 而架构分层不允许 `infra/` 依赖 `domains/`。这里保持设计文档约定的对外位置。
 */
export { NAMECARD_EXCHANGE_PENDING_TTL_MS } from '@imsweb/contracts/namecards';
