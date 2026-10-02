/**
 * Builds a bubbling touch event at a given vertical position.
 *
 * `touchend` carries an empty `touches` list, matching a finger lifting off the
 * screen; the other phases report the single active touch.
 */
export function touchEvent(
  type: "touchstart" | "touchmove" | "touchend",
  y: number
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientY: y }],
  })
  return event
}
