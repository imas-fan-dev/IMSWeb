/** Quick-fill presets shared by the review queue and the management queue. */
export const LOCK_REASON_PRESETS = [
  "用户主动删除",
  "非企划内容",
  "NSFW内容",
  "涉及对现实人物的侮辱",
] as const

export const REJECT_REASON_PRESETS = [
  "信息缺失",
  "信息不符",
  "图片模糊",
  "内容不当",
  "重复提交",
] as const

// A flagged submission is rejected for breaking the rules, not for being
// incomplete, so it gets its own preset set.
export const VIOLATION_REASON_PRESETS = [
  "非企划内容",
  "NSFW内容",
  "涉及对现实人物的侮辱",
  "侵权内容",
] as const
