import Foundation
import CoreGraphics

/// Circular CALayer corners and hit ownership share this predicate. Radius is
/// bounded by the shorter side; a 48×96 surface has semicircular end caps.
enum GlassSurfaceGeometry {
  static func contains(_ point: CGPoint, in bounds: CGRect, radius: CGFloat) -> Bool {
    guard bounds.contains(point) else { return false }
    let r = max(0, min(radius, min(bounds.width, bounds.height) / 2))
    guard r > 0 else { return true }
    let x = max(bounds.minX + r, min(point.x, bounds.maxX - r))
    let y = max(bounds.minY + r, min(point.y, bounds.maxY - r))
    let dx = point.x - x
    let dy = point.y - y
    return dx * dx + dy * dy <= r * r
  }
}

#if canImport(UIKit)
import UIKit

/// Descendants of a clipped rounded surface cannot own its transparent corners.
/// The coordinate conversion also accounts for nested scrolling viewports.
func glassSurfaceContains(_ point: CGPoint, from root: UIView, in target: UIView) -> Bool {
  guard !target.isHidden, target.alpha > 0.01,
    target.bounds.contains(target.convert(point, from: root)) else { return false }
  var ancestor: UIView? = target
  while let surface = ancestor, surface !== root {
    guard !surface.isHidden, surface.alpha > 0.01 else { return false }
    if surface.clipsToBounds && !GlassSurfaceGeometry.contains(
      surface.convert(point, from: root), in: surface.bounds, radius: surface.layer.cornerRadius
    ) { return false }
    ancestor = surface.superview
  }
  return true
}
#endif
