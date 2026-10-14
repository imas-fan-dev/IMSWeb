import CoreGraphics

/// Calibrated phone-portrait floor for the current system tab capsule. Public
/// content/safe margins can increase it; this is not a UIKit glass-frame API.
enum ExchangeSearchLayout {
  static let minimumNavigationInset: CGFloat = 20
  static let inputToSubmitSpacing: CGFloat = 12

  static func expandedMinimumHeight(handle: CGFloat, input: CGFloat, submit: CGFloat) -> CGFloat {
    let handleSpace = handle > 0 ? handle + 4 : 0
    return max(260, handleSpace + max(48, input) + inputToSubmitSpacing + max(44, submit) + 4 + 44 + 12)
  }

  /// Separate vertical docking input: never use the inline range's root y.
  static func collapsedBottom(host: CGRect, viewport: CGRect, collapsed: Bool, portrait: Bool, clearance: CGFloat, keyboardTop: CGFloat, navigation: CGRect?) -> CGFloat {
    let fallback = min(host.maxY - (collapsed ? clearance : 12), keyboardTop - 12)
    guard collapsed, portrait, host.width < 768, let navigation,
      [viewport.minX, viewport.minY, viewport.width, viewport.height].allSatisfy({ $0.isFinite }),
      viewport.width > 0, viewport.height > 0,
      validDOMNavigation(navigation, viewport: viewport), navigation.minY >= host.minY + 44 else { return fallback }
    // Replace duplicate clearance, allowing downward movement, but never place
    // the tools outside the map host or through the current keyboard boundary.
    return min(navigation.minY - 12, host.maxY, keyboardTop - 12)
  }

  static func validDOMNavigation(_ frame: CGRect, viewport: CGRect) -> Bool {
    [frame.minX, frame.minY, frame.width, frame.height].allSatisfy { $0.isFinite }
      && frame.minX >= viewport.minX && frame.minY >= viewport.minY
      && frame.width >= 44 && frame.height > 0
      && frame.maxX <= viewport.maxX + 2 && frame.maxY <= viewport.maxY + 2
  }

  static func navigationRange(bounds: CGRect, leftMargin: CGFloat, rightMargin: CGFloat, safeLeft: CGFloat, safeRight: CGFloat) -> CGRect? {
    guard bounds.minX.isFinite, bounds.minY.isFinite, bounds.width.isFinite, bounds.width > 0, bounds.height.isFinite, bounds.height > 0,
      [leftMargin, rightMargin, safeLeft, safeRight].allSatisfy({ $0.isFinite && $0 >= 0 }) else { return nil }
    let left = max(minimumNavigationInset, leftMargin, safeLeft)
    let right = max(minimumNavigationInset, rightMargin, safeRight)
    guard bounds.width - left - right >= 44 else { return nil }
    return CGRect(x: bounds.minX + left, y: bounds.minY, width: bounds.width - left - right, height: bounds.height)
  }

  static func horizontalFrame(host: CGRect, collapsed: Bool, portrait: Bool, navigation: CGRect?) -> CGRect {
    let short = host.height <= 500 && host.width >= 640
    if short {
      return CGRect(x: host.minX + 8, y: host.minY, width: min(420, max(320, host.width * 0.48)), height: host.height)
    }
    if collapsed && portrait && host.width < 768, let navigation,
      navigation.minX.isFinite, navigation.width.isFinite, navigation.width >= 44 {
      // Only inline coordinates align: the actual DOM nav can be vertically
      // outside the map host. Do not intersect the two rectangles vertically.
      let left = max(host.minX, navigation.minX)
      let right = min(host.maxX, navigation.maxX)
      if right - left >= 44 {
        return CGRect(x: left, y: host.minY, width: right - left, height: host.height)
      }
    }
    let width = host.width < 768 ? host.width - 16 : min(host.width - 16, 560)
    return CGRect(x: host.midX - width / 2, y: host.minY, width: width, height: host.height)
  }
}
