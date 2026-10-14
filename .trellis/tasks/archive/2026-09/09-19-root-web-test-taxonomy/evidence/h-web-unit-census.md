# Web unit 单 describe ≥10 it 清单（H 批）

- 日期：2026-09-19
- 范围：`apps/web/tests/unit/**/*.test.ts(x)`
- 判据：文件内**恰好一个**顶层 `describe`，且其直接子级 `it(...)` 数量 ≥10
- 扫描方式：TypeScript AST 解析每个测试文件，按源码顺序统计 `describe` / `it` 调用；`it.each` 按一条源码用例计，不计入 `it` 数
- 扫描结果：共 220 个测试文件，符合判据的 **24 个**

## 归类前清单（24 个）

| 文件 | it 数 | 处理 |
| --- | ---: | --- |
| `components/app/app-navigation-provider.test.tsx` | 19 | 无连续 ≥3 词前缀，保持不动 |
| `e2e/api-dispatcher.test.ts` | 22 | 无连续 ≥3 词前缀，保持不动 |
| `mocks/data/wiki.test.ts` | 21 | 归 4 组 |
| `pages/account/account-security-page.test.tsx` | 21 | 无连续 ≥3 词前缀，保持不动 |
| `mocks/data/fudaba.test.ts` | 15 | 归 4 组 |
| `lib/native-glass-controls.test.tsx` | 14 | 无连续 ≥3 词前缀，保持不动 |
| `lib/api/endpoints/fudaba.test.ts` | 14 | 无连续 ≥3 词前缀，保持不动 |
| `lib/geolocation.test.ts` | 13 | 归 1 组 |
| `pages/account/use-platform-oauth-app-link.test.tsx` | 13 | 无连续 ≥3 词前缀，保持不动 |
| `pages/community/exchange/community-exchange-me-page.test.tsx` | 13 | 无连续 ≥3 词前缀，保持不动 |
| `lib/api/endpoints/wiki.test.ts` | 12 | 无连续 ≥3 词前缀，保持不动 |
| `pages/community/community-cards-page.test.tsx` | 12 | 无连续 ≥3 词前缀，保持不动 |
| `pages/wiki/classic/classic-wiki-pages.test.tsx` | 12 | 无连续 ≥3 词前缀，保持不动 |
| `pages/wiki/modern/wiki-index-page.test.tsx` | 12 | 无连续 ≥3 词前缀，保持不动 |
| `lib/media/crop-avatar-image.test.ts` | 11 | 无连续 ≥3 词前缀，保持不动 |
| `pages/account/account-auth-page.test.tsx` | 11 | 无连续 ≥3 词前缀，保持不动 |
| `pages/admin/producer-map/producer-map-manager.test.tsx` | 11 | 无连续 ≥3 词前缀，保持不动 |
| `pages/community/exchange/exchange-office-map.test.tsx` | 11 | 无连续 ≥3 词前缀，保持不动 |
| `pages/community/hooks/use-namecard-preview-navigation.test.ts` | 11 | 无连续 ≥3 词前缀，保持不动 |
| `components/editorial/community-post-detail.test.tsx` | 10 | 无连续 ≥3 词前缀，保持不动 |
| `components/platform/platform-session-provider.test.tsx` | 10 | 归 1 组 |
| `components/shared/theme-toggle.test.tsx` | 10 | 归 2 组 |
| `lib/api/endpoints/platform.test.ts` | 10 | 无连续 ≥3 词前缀，保持不动 |
| `pages/community/exchange-map-model.test.ts` | 10 | 无连续 ≥3 词前缀，保持不动 |

`lib/geolocation.test.ts` 源码内 13 条 `it(`，另有 1 条 `it.each` 展开为 3 条执行用例，运行时共 16 条。

## 被排除的 3 个文件

这些文件里有某个 describe 的直接 `it` ≥10，但文件内顶层 describe 不止一个，不符合「恰好一个 describe」判据，因此不在本批范围：

| 文件 | 顶层 describe 数 | ≥10 的 describe |
| --- | ---: | --- |
| `lib/api/api.test.ts` | 4 | `API response policy`（12） |
| `lib/api/media-urls.test.ts` | 2 | `media URL normalisation with a configured origin`（16） |
| `lib/platform-oauth-deep-link.test.ts` | 3 | `app-wide callback delivery`（10） |

## 归类后复扫

对处理后的 5 个文件重新扫描，其顶层 describe 的直接 `it` 已降到 10 以下，不再出现在清单里；其余 19 个文件未改动，仍在清单里。

| 文件 | 顶层直接 it | 二级 describe 数 | 子级 it 合计 |
| --- | ---: | ---: | ---: |
| `components/platform/platform-session-provider.test.tsx` | 8 | 1 | 2 |
| `components/shared/theme-toggle.test.tsx` | 5 | 2 | 5 |
| `lib/geolocation.test.ts` | 11 | 1 | 2 |
| `mocks/data/fudaba.test.ts` | 4 | 4 | 11 |
| `mocks/data/wiki.test.ts` | 6 | 4 | 15 |

`lib/geolocation.test.ts` 的顶层直接 `it` 仍有 11 条，因此仍满足「单 describe ≥10 it」的字面条件；本批只有唯一一段连续共享前缀（2 条），按规则只加了这一组。其余单条用例按规则留在顶层 describe 内，未另造类别。
