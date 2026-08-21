// @imsweb/contracts 根导出：按业务命名空间聚合，供工具链与符合性测试
// 一站式引用。业务代码的主要消费路径是子路径导入（见 README），根导出
// 不做扁平 re-export，避免跨域原子名撞名。
// 命名规则：命名空间 = 子路径的 camelCase（fudaba/card-claims ↔ fudabaCardClaims）。
export * as wiki from "./wiki.js"
export * as platform from "./platform/index.js"
export * as platformAdmin from "./platform/admin.js"
export * as namecards from "./namecards.js"
export * as fudaba from "./fudaba/index.js"
export * as fudabaCardClaims from "./fudaba/card-claims.js"
export * as fudabaLocationReview from "./fudaba/location-review.js"
export * as about from "./about.js"
export * as admin from "./admin.js"
export * as chronicle from "./chronicle.js"
export * as events from "./events.js"
export * as homepageLinks from "./homepage-links.js"
export * as information from "./information.js"
export * as live from "./live.js"
export * as news from "./news.js"
export * as producerMap from "./producer-map.js"
export * as sitePackages from "./site-packages.js"
export * as common from "./common.js"
export * as paths from "./paths.js"
