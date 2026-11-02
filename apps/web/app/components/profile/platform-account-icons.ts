import deremasIcon from "~/assets/platform-icons/deremas.svg"
import gakumasIcon from "~/assets/platform-icons/gakumas.svg"
import millionIcon from "~/assets/platform-icons/million.svg"
import shanimasIcon from "~/assets/platform-icons/shanimas.svg"
import switchIcon from "~/assets/platform-icons/switch.svg"
import xboxIcon from "~/assets/platform-icons/xbox.svg"

/**
 * 平台图标按目录里的 `icon` 键取；未收录的平台回退成首字母圆点，
 * 这样后台新增平台时不会因为缺图而整行不显示。
 */
export const PLATFORM_ICON_URLS: Record<string, string> = {
  demeras: deremasIcon,
  deremas: deremasIcon,
  gakumas: gakumasIcon,
  million: millionIcon,
  shanimas: shanimasIcon,
  switch: switchIcon,
  xbox: xboxIcon,
}
