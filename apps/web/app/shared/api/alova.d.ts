import "alova"

import type { ApiMethodMeta } from "./types"

declare module "alova" {
  interface AlovaCustomTypes {
    meta: ApiMethodMeta
  }
}
