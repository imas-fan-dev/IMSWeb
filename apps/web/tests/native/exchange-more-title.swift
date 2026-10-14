import UIKit
import WebKit
import XCTest

// Compile with the production native-glass Sources and installed Tauri modules.
// Execute in an iOS XCTest host; a standalone typecheck does not run these tests.
@available(iOS 26.0, *)
@MainActor
final class ExchangeMoreTitleTests: XCTestCase {
  private struct Fixture {
    let window: UIWindow
    let parent: UIViewController
    let host: NativeGlassSearchHost
    let webview: WKWebView

    func layout(_ size: CGSize) {
      window.frame = CGRect(origin: .zero, size: size)
      parent.view.frame = CGRect(origin: .zero, size: size)
      webview.frame = parent.view.bounds
      host.view.frame = parent.view.bounds
      host.view.setNeedsLayout()
      window.layoutIfNeeded()
      parent.view.layoutIfNeeded()
      host.view.layoutIfNeeded()
    }
  }

  private func fixture() -> Fixture {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 440, height: 956))
    let parent = UIViewController()
    parent.traitOverrides.preferredContentSizeCategory = .large
    window.rootViewController = parent
    window.isHidden = false
    let webview = WKWebView()
    parent.view.addSubview(webview)
    let host = NativeGlassSearchHost()
    parent.addChild(host)
    parent.view.addSubview(host.view)
    host.didMove(toParent: parent)
    host.webview = webview
    return Fixture(window: window, parent: parent, host: host, webview: webview)
  }

  private func snapshot(_ size: CGSize, more: String = "更多", detent: String = "medium", busy: Bool = false, message: String = "", hasResults: Bool = true) throws -> NativeSearchArgs {
    let data = try JSONSerialization.data(withJSONObject: [
      "id": "exchange-search", "generation": 1, "revision": 1,
      "host": ["x": 0, "y": 0, "width": size.width, "height": size.height],
      "bottomClearance": 0, "dark": false, "detent": detent, "editing": false,
      "query": "上海", "busy": busy, "message": message, "attribution": "",
      "selected": "上海站", "selectedLabel": "上海站", "selectedAddress": "上海市静安区",
      "filterApplied": false, "pointCount": 1, "hasAttribution": true,
      "results": hasResults ? [["id": "station", "label": "上海站", "address": "上海市静安区"]] : [],
      "labels": ["filter": "筛选", "offices": "事务所", "cards": "名片",
                 "more": more, "source": "地图来源", "account": "我的交换账号",
                 "submit": "查找", "collapse": "收起", "expand": "展开", "cancel": "取消"]
    ])
    return try JSONDecoder().decode(NativeSearchArgs.self, from: data)
  }

  private func descendant<T: UIView>(_ root: UIView, id: String, type: T.Type) throws -> T {
    if root.accessibilityIdentifier == id, let found = root as? T { return found }
    for view in root.subviews {
      if let found = try? descendant(view, id: id, type: type) { return found }
    }
    throw NSError(domain: "ExchangeMoreTitleTests", code: 1, userInfo: [NSLocalizedDescriptionKey: id])
  }

  private func settleTraits() async {
    await withCheckedContinuation { continuation in
      DispatchQueue.main.async { continuation.resume() }
    }
  }

  private func assertCompleteTitle(_ button: UIButton, expected: String, file: StaticString = #filePath, line: UInt = #line) throws {
    let label = try XCTUnwrap(button.titleLabel, file: file, line: line)
    let font = try XCTUnwrap(label.font, file: file, line: line)
    XCTAssertEqual(button.configuration?.title, expected, file: file, line: line)
    XCTAssertEqual(label.text, expected, file: file, line: line)
    XCTAssertGreaterThanOrEqual(button.bounds.height, 44, file: file, line: line)
    XCTAssertGreaterThanOrEqual(button.bounds.width, 44, file: file, line: line)
    let text = (expected as NSString).boundingRect(
      with: CGSize(width: label.bounds.width, height: .greatestFiniteMagnitude),
      options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: font], context: nil
    )
    XCTAssertGreaterThan(label.bounds.width, 0, file: file, line: line)
    XCTAssertLessThanOrEqual(ceil(text.height), ceil(label.bounds.height) + 1, file: file, line: line)
  }

  func testRepeatedSnapshotsKeepCompleteLocalizedTitleAndMenu() async throws {
    let fixture = fixture()
    defer { fixture.window.isHidden = true }
    let size = CGSize(width: 440, height: 956)
    fixture.layout(size)
    fixture.host.render(try snapshot(size))
    await settleTraits()
    fixture.layout(size)
    let button = try descendant(fixture.host.view, id: "ims-native-exchange-more-expanded", type: UIButton.self)
    let menu = try XCTUnwrap(button.menu)
    try assertCompleteTitle(button, expected: "更多")
    fixture.host.render(try snapshot(size, more: "更多操作"))
    fixture.layout(size)
    let updated = try descendant(fixture.host.view, id: "ims-native-exchange-more-expanded", type: UIButton.self)
    XCTAssertTrue(button === updated)
    XCTAssertTrue(menu === updated.menu)
    try assertCompleteTitle(updated, expected: "更多操作")
  }

  func testRetainedPortraitToolsFitLiveTextAndRestoreWithoutRendering() async throws {
    for size in [CGSize(width: 375, height: 667), CGSize(width: 402, height: 874), CGSize(width: 440, height: 956)] {
      let fixture = fixture()
      defer { fixture.window.isHidden = true }
      fixture.layout(size)
      fixture.host.render(try snapshot(size, detent: "collapsed"))
      await settleTraits()
      fixture.layout(size)
      let keys = ["filter", "offices", "cards"]
      let titles = ["筛选", "事务所", "名片"]
      let buttons = try keys.map { try descendant(fixture.host.view, id: "ims-native-exchange-\($0)", type: UIButton.self) }
      let fonts = try buttons.map { try XCTUnwrap($0.titleLabel?.font).pointSize }
      let field = try descendant(fixture.host.view, id: "ims-native-exchange-search-input", type: UISearchTextField.self)
      let table = try descendant(fixture.host.view, id: "ims-native-exchange-search-results", type: UITableView.self)
      let more = try descendant(fixture.host.view, id: "ims-native-exchange-more", type: UIButton.self)
      let menu = try XCTUnwrap(more.menu)
      for category in [UIContentSizeCategory.extraLarge, .large] {
        fixture.parent.traitOverrides.preferredContentSizeCategory = category
        await settleTraits()
        fixture.layout(size)
        for index in keys.indices {
          let button = try descendant(fixture.host.view, id: "ims-native-exchange-\(keys[index])", type: UIButton.self)
          XCTAssertTrue(button === buttons[index])
          try assertCompleteTitle(button, expected: titles[index])
          let pointSize = try XCTUnwrap(button.titleLabel?.font).pointSize
          if category == .extraLarge { XCTAssertGreaterThan(pointSize, fonts[index]) }
          else { XCTAssertEqual(pointSize, fonts[index], accuracy: 0.1) }
        }
        XCTAssertTrue(field === (try descendant(fixture.host.view, id: "ims-native-exchange-search-input", type: UISearchTextField.self)))
        XCTAssertTrue(table === (try descendant(fixture.host.view, id: "ims-native-exchange-search-results", type: UITableView.self)))
        XCTAssertTrue(menu === more.menu)
        XCTAssertEqual(field.text, "上海")
        XCTAssertEqual(table.numberOfRows(inSection: 0), 1)
      }
    }
  }

  func testExpandedInputSubmitSpacingAndEssentialRowsAcrossSearchStates() async throws {
    let fixture = fixture()
    defer { fixture.window.isHidden = true }
    let size = CGSize(width: 402, height: 874)
    fixture.layout(size)
    fixture.host.render(try snapshot(size))
    let field = try descendant(fixture.host.view, id: "ims-native-exchange-search-input", type: UISearchTextField.self)
    let submit = try descendant(fixture.host.view, id: "ims-native-exchange-submit", type: UIButton.self)
    let cancel = try descendant(fixture.host.view, id: "ims-native-exchange-cancel", type: UIButton.self)
    let reading = try descendant(fixture.host.view, id: "ims-native-exchange-reading-viewport", type: UIScrollView.self)
    for category in [UIContentSizeCategory.large, .extraLarge, .accessibilityExtraExtraExtraLarge] {
      fixture.parent.traitOverrides.preferredContentSizeCategory = category
      await settleTraits()
      for (busy, message, hasResults) in [(false, "", true), (true, "查找中", false), (false, "请稍后重试", false), (false, "没有匹配地点", false)] {
        fixture.host.render(try snapshot(size, busy: busy, message: message, hasResults: hasResults))
        fixture.layout(size)
        let inputFrame = field.convert(field.bounds, to: fixture.host.view)
        let submitFrame = submit.convert(submit.bounds, to: fixture.host.view)
        XCTAssertGreaterThanOrEqual(submitFrame.minY - inputFrame.maxY, 12 - 0.5)
        XCTAssertGreaterThanOrEqual(reading.bounds.height, 44 - 0.5)
        for control in [field, submit, cancel] as [UIView] {
          let frame = control.convert(control.bounds, to: fixture.host.view)
          XCTAssertGreaterThanOrEqual(frame.height, 44)
          XCTAssertGreaterThanOrEqual(frame.minY, 0)
          XCTAssertLessThanOrEqual(frame.maxY, fixture.host.view.bounds.maxY)
        }
        XCTAssertEqual(reading.contentOffset, .zero)
        XCTAssertTrue(field === (try descendant(fixture.host.view, id: "ims-native-exchange-search-input", type: UISearchTextField.self)))
        XCTAssertTrue(submit === (try descendant(fixture.host.view, id: "ims-native-exchange-submit", type: UIButton.self)))
        XCTAssertEqual(field.text, "上海")
      }
    }
  }

  func testLiveExtraLargeAndLandscapeRetainFullTitleScaledFontAndControls() async throws {
    let fixture = fixture()
    defer { fixture.window.isHidden = true }
    let portrait = CGSize(width: 440, height: 956)
    fixture.layout(portrait)
    fixture.host.render(try snapshot(portrait))
    await settleTraits()
    fixture.layout(portrait)
    let button = try descendant(fixture.host.view, id: "ims-native-exchange-more-expanded", type: UIButton.self)
    let field = try descendant(fixture.host.view, id: "ims-native-exchange-search-input", type: UISearchTextField.self)
    let table = try descendant(fixture.host.view, id: "ims-native-exchange-search-results", type: UITableView.self)
    let menu = try XCTUnwrap(button.menu)
    let originalFont = try XCTUnwrap(button.titleLabel?.font)
    fixture.parent.traitOverrides.preferredContentSizeCategory = .extraLarge
    await settleTraits()
    let landscape = CGSize(width: 956, height: 440)
    fixture.layout(landscape)
    fixture.host.render(try snapshot(landscape))
    fixture.layout(landscape)
    let reading = try descendant(fixture.host.view, id: "ims-native-exchange-reading-viewport", type: UIScrollView.self)
    reading.setContentOffset(CGPoint(x: 0, y: max(0, reading.contentSize.height - reading.bounds.height)), animated: false)
    fixture.layout(landscape)
    XCTAssertTrue(button === (try descendant(fixture.host.view, id: "ims-native-exchange-more-expanded", type: UIButton.self)))
    XCTAssertTrue(field === (try descendant(fixture.host.view, id: "ims-native-exchange-search-input", type: UISearchTextField.self)))
    XCTAssertTrue(table === (try descendant(fixture.host.view, id: "ims-native-exchange-search-results", type: UITableView.self)))
    XCTAssertTrue(menu === button.menu)
    XCTAssertEqual(field.text, "上海")
    XCTAssertEqual(table.numberOfRows(inSection: 0), 1)
    XCTAssertGreaterThan(try XCTUnwrap(button.titleLabel?.font).pointSize, originalFont.pointSize)
    try assertCompleteTitle(button, expected: "更多")
  }
}
