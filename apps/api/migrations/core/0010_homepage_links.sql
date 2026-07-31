PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS homepage_links (
    id TEXT PRIMARY KEY,
    section TEXT NOT NULL CHECK (section IN ('navigation', 'friend', 'support')),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 200),
    href TEXT NOT NULL CHECK (length(href) BETWEEN 1 AND 2048),
    icon TEXT NOT NULL,
    accent TEXT NOT NULL,
    display_order INTEGER NOT NULL CHECK (display_order >= 0),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_homepage_links_section_order
    ON homepage_links(section, display_order, id);

INSERT OR IGNORE INTO homepage_links
    (id, section, title, description, href, icon, accent, display_order, created_at, updated_at)
VALUES
    ('navigation-events', 'navigation', '活动中心', '浏览近期活动与公开信息', '/events', 'calendar', 'franchise-765', 0, 0, 0),
    ('navigation-recommendations', 'navigation', '内容推荐', '发现社区作品与精选内容', '/recommendations', 'book-open', 'franchise-cg', 1, 0, 0),
    ('navigation-live', 'navigation', '直播日程', '查看演出与直播信息', '/live', 'radio-tower', 'franchise-sc', 2, 0, 0),
    ('navigation-community', 'navigation', '社区入口', '查找社区与协作项目', '/community', 'contact', 'franchise-ml', 3, 0, 0),
    ('navigation-wiki', 'navigation', '剧情站', '查阅偶像剧情档案与中文资料', '/wiki', 'library', 'franchise-sc', 4, 0, 0),
    ('navigation-cards', 'navigation', '制作人名片墙', '浏览制作人名片与社区成员', '/community/cards', 'id-card', 'franchise-sidem', 5, 0, 0),
    ('navigation-map', 'navigation', '制作人地图', '查看各地制作人的公开分布', '/producer-map', 'map', 'franchise-gk', 6, 0, 0),
    ('navigation-works', 'navigation', '作品与工具', '浏览社区创作与实用工具', '/works', 'gamepad', 'franchise-sidem', 7, 0, 0),
    ('navigation-chronicle', 'navigation', '活动编年史', '回顾社区线下活动与共同记忆', '/chronicle', 'history', 'franchise-765', 8, 0, 0),
    ('navigation-about', 'navigation', '关于 IMSWeb', '了解项目定位与维护方式', '/about', 'info', 'franchise-gk', 9, 0, 0),
    ('friend-sp', 'friend', '偶像大师 SP 汉化', 'SP 中文化项目', 'https://sp.idolmaster.top/', 'external-link', 'franchise-765', 0, 0, 0),
    ('friend-ofa', 'friend', '偶像大师 OFA 汉化', 'ONE FOR ALL 中文化项目', 'https://ofa.idolmaster.top/', 'external-link', 'franchise-cg', 1, 0, 0),
    ('friend-2nd', 'friend', '偶像大师 2 汉化', '偶像大师 2 中文化项目', 'https://2nd.idolmaster.top/', 'external-link', 'franchise-ml', 2, 0, 0),
    ('friend-spine', 'friend', '闪耀色彩 SpineViewer', '闪耀色彩 Spine 动画查看工具', 'https://spine.asahikari.cn/', 'external-link', 'franchise-sc', 3, 0, 0),
    ('friend-cg-wiki', 'friend', '偶像大师灰姑娘女孩 Wiki', 'Biligame 社区资料站', 'https://wiki.biligame.com/imascg/', 'external-link', 'franchise-sidem', 4, 0, 0),
    ('friend-apply', 'friend', '申请添加友情链接', '通过哔哩哔哩联系站长', 'https://space.bilibili.com/41356186?spm_id_from=333.1007.0.0', 'external-link', 'franchise-gk', 5, 0, 0),
    ('support-rainyun-compute', 'support', '本站由雨云提供计算服务', 'IMSWeb 当前站点支持', 'https://app.rainyun.com/', 'external-link', 'info', 0, 0, 0),
    ('support-rainyun-cloud', 'support', '雨云，新一代云服务提供商', '云计算服务入口', 'https://app.rainyun.com/', 'external-link', 'success', 1, 0, 0),
    ('support-rainyun-platform', 'support', '国内自主云计算平台', '服务商官方网站', 'https://app.rainyun.com/', 'external-link', 'warning', 2, 0, 0);
