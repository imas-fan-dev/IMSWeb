import { isApiError } from "~/lib/api"
import type {
  WikiAdminStories,
  WikiAdminStory,
  WikiAdminStoryCard,
} from "~/lib/api"
import type {
  StoryEditorDefaults,
  StoryEditorMode,
} from "./story-editor-dialog"

export type StoriesRequest = {
  key: string
  data: WikiAdminStories | null
  error: unknown
}

export type StoryEditorState = {
  story: WikiAdminStory | WikiAdminStoryCard | null
  defaults: StoryEditorDefaults
  mode: StoryEditorMode
}

export type WikiAdminCategory = WikiAdminStories["categories"][number]

export type CategoryEditorState = {
  category: WikiAdminCategory | null
}

export type DeleteTarget =
  | {
      kind: "card"
      category: string
      cardName: string
      linkCount: number
      revision: number
    }
  | {
      kind: "category"
      category: string
      linkCount: number
      revision: number
    }
  | {
      kind: "source"
      storyId: number
      videoTitle: string
      cardName: string
      sourceCount: number
      mediaRevision: number
    }

export function errorMessage(error: unknown) {
  return isApiError(error) ? error.message : "请求失败，请稍后重试"
}

export function positiveId(value: string | null) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function positiveIds(value: string) {
  return [
    ...new Set(value.split(",").map((item) => positiveId(item.trim()))),
  ].filter((item): item is number => item !== null)
}
