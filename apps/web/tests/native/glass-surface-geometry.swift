import Foundation
import CoreGraphics

@main
struct GlassSurfaceGeometryRegression {
  static func main() {
    var cases = 0
    func expect(_ point: CGPoint, _ bounds: CGRect, _ radius: CGFloat, _ admitted: Bool, _ label: String) {
      precondition(GlassSurfaceGeometry.contains(point, in: bounds, radius: radius) == admitted, label)
      cases += 1
    }

    for width in [402.0, 440.0] {
      let side = CGRect(x: width - 56, y: 257, width: 48, height: 96)
      expect(CGPoint(x: side.minX + 1, y: side.minY + 1), side, 24, false, "transparent refresh corner must pass to map")
      expect(CGPoint(x: side.maxX - 1, y: side.maxY - 1), side, 24, false, "transparent locate corner must pass to map")
      expect(CGPoint(x: side.midX, y: side.minY + 24), side, 24, true, "refresh center")
      expect(CGPoint(x: side.midX, y: side.minY + 72), side, 24, true, "locate center")
      expect(CGPoint(x: side.minX + 1, y: side.minY + 47), side, 24, true, "refresh inner edge retains full target")
      expect(CGPoint(x: side.minX + 1, y: side.minY + 49), side, 24, true, "locate inner edge retains full target")
      expect(CGPoint(x: side.minX - 1, y: side.midY), side, 24, false, "outside side skin")
      let locateCoordinates = CGRect(x: 0, y: -48, width: 48, height: 96)
      expect(CGPoint(x: 1, y: 1), locateCoordinates, 24, true, "lower segment is not its own circle")
      expect(CGPoint(x: 1, y: 47), locateCoordinates, 24, false, "lower segment external corner")
      let circle = CGRect(x: side.minX, y: side.minY, width: 48, height: 48)
      expect(CGPoint(x: circle.minX + 1, y: circle.minY + 1), circle, 24, false, "suppressed locate leaves circular refresh")
      expect(CGPoint(x: circle.midX, y: circle.midY), circle, 24, true, "circle center")
      expect(CGPoint(x: circle.minX + 1, y: circle.midY), circle, 24, true, "circle horizontal edge")
      expect(CGPoint(x: circle.minX + 1, y: circle.minY + 1), circle, 999, false, "oversized payload radius clamps to circle")
      expect(CGPoint(x: circle.minX + 1, y: circle.minY + 1), circle, 0, true, "square surface retains corner")
      expect(CGPoint(x: circle.minX + 1, y: circle.minY + 1), circle, -2, true, "negative radius clamps to zero")
    }
    expect(CGPoint(x: 347, y: 258), CGRect(x: 346, y: 257, width: 48, height: 96), 24, false, "exact R1 corner replay")
    expect(.zero, .zero, 24, false, "empty surface has no hit ownership")
    print("PASS \(cases) production rounded-surface geometry cases; UIKit event delivery remains a native runtime check")
  }
}
