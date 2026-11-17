import {
  GeolocationFailure,
  type GeolocationFailureKind,
} from "~/lib/geolocation"

export function locationFailureKind(error: unknown): GeolocationFailureKind {
  return error instanceof GeolocationFailure ? error.kind : "unavailable"
}

export const locationFailureCopy = {
  "permission-denied": {
    title: "未获得位置权限",
    description:
      "请在浏览器或系统设置中检查位置权限。您也可以搜索地点或在地图上手动选点。",
    retry: true,
  },
  timeout: {
    title: "获取位置超时，请重试",
    description: "定位服务暂未响应。请稍后重试，也可以搜索地点或手动选点。",
    retry: true,
  },
  unavailable: {
    title: "暂时无法获取您的位置",
    description: "请检查设备定位服务后重试，也可以搜索地点或手动选点。",
    retry: true,
  },
  unsupported: {
    title: "当前设备不支持位置服务",
    description: "您可以通过搜索地点或在地图上手动选点继续浏览。",
    retry: false,
  },
} satisfies Record<
  GeolocationFailureKind,
  { title: string; description: string; retry: boolean }
>

type Rect = { x: number; y: number; width: number; height: number }

export function placeLocationFailureNotice(
  width: number,
  height: number,
  occlusion?: Rect | null
) {
  const gap = 12
  // The right-hand 48pt native controls sit 20pt inside the viewport. Reserve
  // their entire width and a gap; DOM z-index cannot cover that UIKit layer.
  const controlsClearance = 84
  let left = gap
  let right = width - controlsClearance
  let availableHeight = height - 96
  let bottom: number | undefined
  if (occlusion) {
    if (occlusion.width >= width * 0.65) {
      availableHeight = occlusion.y - gap * 2
      bottom = height - occlusion.y + gap
    } else {
      const before = occlusion.x - gap
      const after = width - occlusion.x - occlusion.width - controlsClearance
      if (after >= before)
        left = Math.max(left, occlusion.x + occlusion.width + gap)
      else right = Math.min(right, occlusion.x - gap)
    }
  }
  const cardWidth = Math.min(320, Math.max(0, right - left))
  return {
    left: right - cardWidth,
    leftBoundary: left,
    width: cardWidth,
    maxHeight: Math.max(0, availableHeight),
    ...(bottom === undefined ? {} : { bottom }),
    visible: cardWidth >= 220 && availableHeight >= 132,
  }
}
