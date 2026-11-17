/**
 * 站内信派发器的生命周期端口。
 *
 * 与 `ObjectCleanupRunner` 一样，派发器跑在 API 进程里，随进程启动并在关闭时
 * 等待当前 tick 结束，避免关闭过程中半途写库。
 */
export interface StationMessageDispatchRunner {
    start(): void;
    run(): Promise<void>;
    close(): Promise<void>;
}
