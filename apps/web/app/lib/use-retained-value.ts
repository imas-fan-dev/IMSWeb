import { useState } from "react"

/**
 * 对话框关闭时父组件通常立刻把选中项置空，但弹层还要播退场动画。
 * 把打开时的最后一个非空值留住，让内容在淡出期间保持完整，避免「先空白再消失」。
 *
 * 只在 `null ↔ 非空` 翻转时更新快照：既不在 render 期读写 ref，也不会因为
 * 父组件每次 render 新建对象/数组而陷入重复 setState。
 */
export function useRetainedValue<T>(value: T | null): T | null {
  const [retained, setRetained] = useState<T | null>(value)
  const [wasOpen, setWasOpen] = useState(value !== null)
  if (value !== null && !wasOpen) {
    setRetained(value)
    setWasOpen(true)
  } else if (value === null && wasOpen) {
    setWasOpen(false)
  }
  return value ?? retained
}
