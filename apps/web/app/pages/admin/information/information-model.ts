import { isApiError } from "~/shared/api"
import type {
  InformationCategory,
  InformationContentType,
  InformationSubmission,
} from "~/shared/api"

export const emptyInformationSubmission: InformationSubmission = {
  title: "",
  category: "activity",
  contentType: "external",
  externalUrl: "",
  html: "",
  image: "",
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
