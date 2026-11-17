-- ims:migration-phase: post-data

-- 会话列表要回答“这是哪台设备”。platform_security_events 是事件流，记录“某次
-- 登录来自哪里”，与“这个会话当前属于哪台设备”会错位，所以设备信息落在会话行上。
-- 三列都可空：迁移之前建立的会话没有这些数据，回填也无从谈起。
ALTER TABLE public.platform_refresh_sessions
    ADD COLUMN user_agent TEXT
        CHECK (user_agent IS NULL OR length(user_agent) <= 1024),
    ADD COLUMN ip_address TEXT
        CHECK (ip_address IS NULL OR length(ip_address) <= 64),
    ADD COLUMN last_seen_at BIGINT,
    ADD CONSTRAINT platform_refresh_sessions_last_seen_after_create
        CHECK (last_seen_at IS NULL OR last_seen_at >= created_at);
