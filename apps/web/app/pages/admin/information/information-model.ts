import { isApiError } from "~/lib/api"
import type {
  InformationCategory,
  InformationContentType,
  InformationSubmission,
} from "~/lib/api"

export const emptyInformationSubmission: InformationSubmission = {
  title: "",
  category: "activity",
  contentType: "external",
  externalUrl: "",
  html: "",
  image: "",
}

const bodyAssetAttribute = "data-information-body-asset"

export type InformationBodyAsset = {
  token: string
  url: string
}

function htmlTemplate(html: string) {
  const template = document.createElement("template")
  template.innerHTML = html
  return template
}

export function maskInformationBodyAssets(html: string) {
  if (!html) return { html, assets: [] as InformationBodyAsset[] }

  const template = htmlTemplate(html)
  const assets: InformationBodyAsset[] = []
  template.content
    .querySelectorAll<HTMLImageElement>("img[src]")
    .forEach((image) => {
      const url = image.getAttribute("src")
      if (!url) return
      const token = `正文图片 ${assets.length + 1}`
      assets.push({ token, url })
      image.removeAttribute("src")
      image.setAttribute(bodyAssetAttribute, token)
    })
  return { html: template.innerHTML, assets }
}

export function appendInformationBodyAsset(
  html: string,
  url: string,
  assets: InformationBodyAsset[]
) {
  const token = `正文图片 ${assets.length + 1}`
  const image = document.createElement("img")
  image.setAttribute(bodyAssetAttribute, token)
  image.setAttribute("alt", "")
  return {
    html: `${html}${html ? "\n" : ""}${image.outerHTML}`,
    asset: { token, url },
  }
}

export function restoreInformationBodyAssets(
  html: string,
  assets: InformationBodyAsset[]
) {
  if (!html || !assets.length) return html

  const template = htmlTemplate(html)
  const urlsByToken = new Map(assets.map((asset) => [asset.token, asset.url]))
  template.content
    .querySelectorAll<HTMLImageElement>(`img[${bodyAssetAttribute}]`)
    .forEach((image) => {
      const token = image.getAttribute(bodyAssetAttribute)
      const url = token ? urlsByToken.get(token) : undefined
      if (!url) return
      image.setAttribute("src", url)
      image.removeAttribute(bodyAssetAttribute)
    })
  return template.innerHTML
}

export function informationErrorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

export function categoryLabel(category: InformationCategory) {
  return category === "activity" ? "活动资讯" : "同人活动"
}

export function contentTypeLabel(contentType: InformationContentType) {
  return contentType === "external" ? "外部链接" : "站内 HTML"
}
