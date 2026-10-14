import CoreGraphics

@main
enum ExchangeNavigationLayoutTests {
  static func main() {
    var count = 0
    func check(_ condition: @autoclosure () -> Bool, _ name: String) {
      precondition(condition(), name)
      count += 1
    }
    // Public probe values and independently inspected current system contours.
    for (width, height, left, right, expected) in [(375.0, 667.0, 16.0, 0.0, 335.0), (402.0, 874.0, 16.0, 16.0, 362.0), (440.0, 956.0, 20.0, 20.0, 400.0)] {
      let host = CGRect(x: 0, y: 0, width: width, height: height)
      let nav = ExchangeSearchLayout.navigationRange(bounds: host, leftMargin: left, rightMargin: right, safeLeft: 0, safeRight: 0)!
      check(nav.minX == 20 && nav.width == expected, "calibrated contour range")
      let collapsed = ExchangeSearchLayout.horizontalFrame(host: host, collapsed: true, portrait: true, navigation: nav)
      check(collapsed.minX == nav.minX && collapsed.maxX == nav.maxX, "collapsed edges")
      let expanded = ExchangeSearchLayout.horizontalFrame(host: host, collapsed: false, portrait: true, navigation: nav)
      check(expanded.minX == 8 && expanded.width == width - 16, "expanded reading unaffected")
    }
    let host = CGRect(x: 0, y: 0, width: 440, height: 956)
    let increased = ExchangeSearchLayout.navigationRange(bounds: host, leftMargin: 32, rightMargin: 24, safeLeft: 40, safeRight: 8)!
    check(increased.minX == 40 && increased.maxX == 416, "current margins and safe areas")
    let dom = CGRect(x: 28, y: 880, width: 384, height: 64)
    check(ExchangeSearchLayout.validDOMNavigation(dom, viewport: host), "actual DOM viewport frame")
    check(!ExchangeSearchLayout.validDOMNavigation(CGRect(x: 28, y: 880, width: 500, height: 64), viewport: host), "reject oversized DOM frame")
    check(!ExchangeSearchLayout.validDOMNavigation(CGRect(x: 28, y: 880, width: 384, height: 120), viewport: host), "reject stale vertical binding")
    check(!ExchangeSearchLayout.validDOMNavigation(CGRect(x: -1, y: 880, width: 384, height: 64), viewport: host), "reject negative DOM origin")
    let domAligned = ExchangeSearchLayout.horizontalFrame(host: CGRect(x: 0, y: 0, width: 440, height: 800), collapsed: true, portrait: true, navigation: dom)
    check(domAligned.minX == 28 && domAligned.width == 384, "DOM nav outside map vertically")
    let clipped = ExchangeSearchLayout.horizontalFrame(host: CGRect(x: 40, y: 0, width: 350, height: 800), collapsed: true, portrait: true, navigation: dom)
    check(clipped.minX == 40 && clipped.maxX == 390, "available inline clipping")
    let tablet = ExchangeSearchLayout.horizontalFrame(host: CGRect(x: 0, y: 0, width: 834, height: 1112), collapsed: true, portrait: true, navigation: dom)
    check(tablet.minX == 137 && tablet.width == 560, "tablet cap unchanged")
    for width in [667.0, 874.0, 956.0] {
      let landscape = ExchangeSearchLayout.horizontalFrame(host: CGRect(x: 0, y: 0, width: width, height: 390), collapsed: true, portrait: false, navigation: dom)
      check(landscape.minX == 8 && landscape.width == min(420, max(320, width * 0.48)), "short landscape unchanged")
    }
    check(ExchangeSearchLayout.horizontalFrame(host: host, collapsed: true, portrait: true, navigation: nil).width == 424, "absent optional field retains supported fallback")
    check(ExchangeSearchLayout.navigationRange(bounds: .zero, leftMargin: 16, rightMargin: 16, safeLeft: 0, safeRight: 0) == nil, "initial unavailable layout")
    check(ExchangeSearchLayout.navigationRange(bounds: host, leftMargin: .nan, rightMargin: 16, safeLeft: 0, safeRight: 0) == nil, "invalid margin")
    check(ExchangeSearchLayout.navigationRange(bounds: host, leftMargin: 420, rightMargin: 20, safeLeft: 0, safeRight: 0) == nil, "no undersized target")
    check(ExchangeSearchLayout.horizontalFrame(host: host, collapsed: true, portrait: true, navigation: CGRect(x: CGFloat.infinity, y: 0, width: 384, height: 1)).width == 424, "invalid optional geometry")
    func bottom(_ height: CGFloat, _ top: CGFloat?, clearance: CGFloat, keyboard: CGFloat? = nil, collapsed: Bool = true, portrait: Bool = true, width: CGFloat = 402) -> CGFloat {
      let host = CGRect(x: 0, y: 0, width: width, height: height)
      return ExchangeSearchLayout.collapsedBottom(host: host, viewport: host, collapsed: collapsed, portrait: portrait, clearance: clearance, keyboardTop: keyboard ?? height, navigation: top.map { CGRect(x: 0, y: $0, width: width, height: height - $0) })
    }
    check(bottom(874, 791, clearance: 130) == 779, "402pt dock moves down 35pt from 744")
    check(bottom(956, 873, clearance: 130) == 861, "440pt dock moves down 35pt from 826")
    check(bottom(667, 584, clearance: 96) == 572, "375pt no-home safe docking")
    check(bottom(874, nil, clearance: 130) == 744, "missing navigation retains clearance")
    check(bottom(874, -1, clearance: 130) == 744, "invalid navigation retains clearance")
    check(bottom(874, 0, clearance: 130) == 744, "root inline range is not a docking frame")
    check(bottom(874, 791, clearance: 130, keyboard: 500) == 488, "keyboard bounds docking")
    check(bottom(874, 791, clearance: 130, collapsed: false) == 862, "expanded reading unchanged")
    check(bottom(390, 307, clearance: 130, portrait: false, width: 874) == 260, "landscape unchanged")
    check(bottom(1112, 1029, clearance: 130, width: 834) == 982, "tablet unchanged")
    let map = CGRect(x: 0, y: 0, width: 402, height: 780)
    let viewport = CGRect(x: 0, y: 0, width: 402, height: 874)
    check(ExchangeSearchLayout.collapsedBottom(host: map, viewport: viewport, collapsed: true, portrait: true, clearance: 36, keyboardTop: 840, navigation: CGRect(x: 20, y: 791, width: 362, height: 64)) == 779, "mixed DOM navigation outside host docks once")
    check(ExchangeSearchLayout.collapsedBottom(host: map, viewport: viewport, collapsed: true, portrait: true, clearance: 36, keyboardTop: 840, navigation: CGRect(x: 20, y: 810, width: 362, height: 64)) == 780, "host boundary caps downward docking")
    check(ExchangeSearchLayout.collapsedBottom(host: map, viewport: viewport, collapsed: true, portrait: true, clearance: 36, keyboardTop: 840, navigation: CGRect(x: 20, y: CGFloat.nan, width: 362, height: 64)) == 744, "nonfinite docking retains fallback")
    check(ExchangeSearchLayout.expandedMinimumHeight(handle: 44, input: 48, submit: 44) == 260, "normal expanded budget")
    check(ExchangeSearchLayout.expandedMinimumHeight(handle: 44, input: 120, submit: 106) == 346, "live essential rows retain 44pt reading space and 12pt submit gap")
    check(ExchangeSearchLayout.expandedMinimumHeight(handle: 0, input: 120, submit: 106) == 298, "compact host removes only handle space")
    print("Passed \(count) production exchange navigation geometry cases")
  }
}
