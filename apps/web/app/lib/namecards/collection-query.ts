/**
 * 名片册列表的查询口径：每页条数与排序键的默认方向。
 *
 * 接口（`GET /community/exchange/me/collection`）与页面共用同一份常量，
 * 避免「前端传 asc、服务端按 desc 兜底」这种两处各写一半的默认值。
 */
import type {
  NamecardCollectionDirection,
  NamecardCollectionSort,
} from "@imsweb/contracts/namecards"

/** 名片册固定每页 24 条（PRD §3）。 */
export const NAMECARD_COLLECTION_PAGE_SIZE = 24

/** PRD §3：交换时间与制作日期倒序，制作人名与企划正序。 */
export const NAMECARD_COLLECTION_DEFAULT_DIRECTION: Record<
  NamecardCollectionSort,
  NamecardCollectionDirection
> = {
  exchange: "desc",
  name: "asc",
  series: "asc",
  date: "desc",
}
