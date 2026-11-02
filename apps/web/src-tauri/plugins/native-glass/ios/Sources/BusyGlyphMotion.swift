import UIKit

private let busyGlyphRotationKey = "ims.busy-glyph.rotation"

/// Busy is independent of enabled state. Repeated geometry/configuration updates
/// keep the same animation rather than restarting its phase on every snapshot.
func synchronizeBusyGlyphMotion(_ glyph: UIView?, busy: Bool) {
  guard let glyph else { return }
  guard busy, !UIAccessibility.isReduceMotionEnabled else {
    glyph.layer.removeAnimation(forKey: busyGlyphRotationKey)
    return
  }
  guard glyph.layer.animation(forKey: busyGlyphRotationKey) == nil else { return }
  let rotation = CABasicAnimation(keyPath: "transform.rotation.z")
  rotation.fromValue = 0
  rotation.toValue = Double.pi * 2
  rotation.duration = 1
  rotation.repeatCount = .greatestFiniteMagnitude
  rotation.timingFunction = CAMediaTimingFunction(name: .linear)
  rotation.isAdditive = true
  glyph.layer.add(rotation, forKey: busyGlyphRotationKey)
}
