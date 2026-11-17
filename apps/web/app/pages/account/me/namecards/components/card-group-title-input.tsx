import { useRef, useState } from "react"

import { Input } from "~/components/ui/input"
import { CARD_GROUP_TITLE_MAX_LENGTH } from "../card-manager-model"

/**
 * 新建 / 重命名分组的标题输入（§7.2）：回车或失焦提交，空标题不提交，`Esc` 取消。
 *
 * - 提交的标题已去首尾空白；空标题走 `onCancel`（新建时不建组，重命名时保持原名）
 *   并把输入框的值回填成当前标题；
 * - `maxLength` 卡在 40 字，与服务端 `namecardCardLayoutGroupSchema` 同口径；
 * - 回车提交后输入框若还留在页面上（重命名），`blur` 不会重复提交：提交过一次之后
 *   必须再输入内容才会重新提交。
 */
export function CardGroupTitleInput({
  value = "",
  label,
  placeholder,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  /** 初始标题：新建时为空，重命名时是当前标题。 */
  value?: string
  /** 无障碍名称（`aria-label`）。 */
  label: string
  placeholder?: string
  autoFocus?: boolean
  /** 提交非空标题（已去首尾空白）。 */
  onSubmit: (title: string) => void
  /** 空标题提交或 `Esc`：新建时收起输入区，重命名时保持原名。 */
  onCancel?: () => void
}) {
  const [title, setTitle] = useState(value)
  // 同一个值连续提交两次没有意义，而「回车提交 + 输入框失焦」会各触发一次：
  // 只有再次输入内容才允许重新提交。新建时提交后输入框会被卸载，这条守卫更保险。
  const committed = useRef(false)

  function commit() {
    if (committed.current) return
    committed.current = true
    const next = title.trim()
    if (!next) {
      // 空标题不改变分组名（新建时收起输入区，重命名时保持原名），所以把输入框的值
      // 也回填成当前标题——不然清空后失焦，组头会空白到下次输入为止。
      setTitle(value)
      onCancel?.()
      return
    }
    // 提交的是去空白后的标题，输入框也跟着显示它——重命名后不会留下「 主推 」这种半成品。
    setTitle(next)
    onSubmit(next)
  }

  function cancel() {
    committed.current = true
    setTitle(value)
    onCancel?.()
  }

  return (
    <form
      className="min-w-0"
      onSubmit={(event) => {
        event.preventDefault()
        commit()
      }}
    >
      <Input
        aria-label={label}
        autoFocus={autoFocus}
        maxLength={CARD_GROUP_TITLE_MAX_LENGTH}
        placeholder={placeholder}
        value={title}
        onBlur={commit}
        onChange={(event) => {
          committed.current = false
          setTitle(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            cancel()
            return
          }
          if (event.key === "Enter") {
            // 不依赖浏览器的隐式提交：单输入框表单在 jsdom 与真实浏览器里的行为
            // 都要一致（回车提交，输入框继续留着时也不会再被 `blur` 提交一次）。
            event.preventDefault()
            commit()
          }
        }}
      />
    </form>
  )
}
