#if canImport(Tauri)
import SwiftRs
import Tauri
import UIKit
import WebKit

#if DEBUG
private func logNativeGlass(_ message: String) {
  NSLog("IMSWeb NativeGlass: %@", message)
}
#endif

let imsTabBarSelectedColor = UIColor(
  red: 1,
  green: 23.0 / 255.0,
  blue: 79.0 / 255.0,
  alpha: 1
)

struct NativeColor: Decodable {
  let red: Double
  let green: Double
  let blue: Double
  let alpha: Double

  var uiColor: UIColor {
    UIColor(
      red: CGFloat(min(max(red, 0), 1)),
      green: CGFloat(min(max(green, 0), 1)),
      blue: CGFloat(min(max(blue, 0), 1)),
      alpha: CGFloat(min(max(alpha, 0), 1))
    )
  }
}

private struct NativeTabItem: Decodable {
  let route: String?
  let lucideIcon: String?
  let action: String?
  let title: String
  let menu: NativeExchangeMenuLabels?
}

private let exchangeActionTabID = "ims:exchange"

private struct ConfigureArgs: Decodable {
  let dark: Bool
  let hidden: Bool?
  let interactionBlocked: Bool?
  let items: [NativeTabItem]
  let selectedColor: NativeColor?
  let selectedIndex: Int
  let currentRoute: String
  let routeKey: String?
  let accountBadge: String
}

private struct BackPolicyArgs: Decodable {
  let generation: UInt64
  let revision: UInt64
  let canBack: Bool
}

private struct UpdateArgs: Decodable {
  let dark: Bool
  let hidden: Bool?
  let interactionBlocked: Bool?
  let selectedColor: NativeColor?
  let selectedIndex: Int?
  let currentRoute: String?
  let routeKey: String?
  let accountBadge: String?
}

private final class NativeTabContentViewController: UIViewController {
  override func loadView() {
    let contentView = UIView()
    contentView.backgroundColor = .clear
    contentView.isOpaque = false
    contentView.isUserInteractionEnabled = false
    view = contentView
  }
}

private final class NativeTabBarOverlayView: UIView {
  weak var interactiveView: UIView?
  weak var exchangeButton: UIButton?
  weak var exchangeMenuView: UIView?

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard let hit = super.hitTest(point, with: event) else { return nil }
    if let exchangeButton, hit === exchangeButton || hit.isDescendant(of: exchangeButton) { return hit }
    if let exchangeMenuView, hit === exchangeMenuView || hit.isDescendant(of: exchangeMenuView) { return hit }
    if let interactiveView, hit === interactiveView || hit.isDescendant(of: interactiveView) { return hit }
    return nil
  }
}

@available(iOS 26.0, *)
private final class NativeExchangeGlassButton: UIButton {
  private let title: String
  private let glyph: UIImage
  private var closeLabel: String?

  init(title: String, glyph: UIImage) {
    self.title = title
    self.glyph = glyph
    super.init(frame: .zero)
    accessibilityIdentifier = "ims-native-exchange-button"
    accessibilityLabel = title
    isHidden = true
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    UIBezierPath(ovalIn: bounds).contains(point)
  }

  private var labelFont: UIFont {
    UIFontMetrics(forTextStyle: .caption2).scaledFont(
      for: .systemFont(ofSize: 11, weight: .semibold), compatibleWith: traitCollection
    )
  }

  var preferredDiameter: CGFloat {
    let titleWidth = (title as NSString).size(withAttributes: [.font: labelFont]).width
    return ceil(max(54, (titleWidth + 10) / 0.85, labelFont.lineHeight + 40))
  }

  func setCloseLabel(_ label: String?) {
    closeLabel = label
    accessibilityLabel = label ?? title
  }

  func applyAppearance(dark: Bool) {
    let ink = dark
      ? UIColor(red: 1, green: 0.74, blue: 0.85, alpha: 1)
      : UIColor(red: 0.57, green: 0.05, blue: 0.26, alpha: 1)
    let tint = dark
      ? UIColor(red: 0.32, green: 0.17, blue: 0.24, alpha: 1)
      : UIColor(red: 1, green: 0.89, blue: 0.93, alpha: 1)
    let reduceTransparency = UIAccessibility.isReduceTransparencyEnabled
    var config: UIButton.Configuration = reduceTransparency ? .filled() : .prominentGlass()
    config.cornerStyle = .capsule
    config.baseBackgroundColor = tint.withAlphaComponent(reduceTransparency ? 1 : 0.7)
    config.baseForegroundColor = ink
    config.image = closeLabel == nil
      ? glyph.withTintColor(ink, renderingMode: .alwaysOriginal)
      : UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold))
    config.imagePlacement = .top
    config.imagePadding = 2
    config.contentInsets = .zero
    var styledTitle = AttributedString(title)
    styledTitle.font = labelFont
    if closeLabel == nil { config.attributedTitle = styledTitle }
    config.titleLineBreakMode = .byClipping
    configuration = config
  }
}

private final class NativeGlassTabBarHostViewController: UIViewController {
  let systemTabController: UITabBarController
  var onLayout: (() -> Void)?
  var onExchange: (() -> Void)?
  var onExchangeQR: (() -> Void)?
  private let overlayView = NativeTabBarOverlayView()
  private let exchangeTitle: String?
  private let exchangeGlyph: UIImage?
  private let exchangeMenuLabels: NativeExchangeMenuLabels?
  // The host is available at the deployment target; the radial is iOS 26-only.
  private var exchangeMenuView: UIView?
  private weak var previousUpperSibling: UIView?
  private var exchangeButton: UIButton?
  private var usesExchangeCircle = false
  private var interactionBlocked = false

  init(tabBarController: UITabBarController, exchangeTitle: String?, exchangeGlyph: UIImage?,
    exchangeMenuLabels: NativeExchangeMenuLabels?) {
    self.systemTabController = tabBarController
    self.exchangeTitle = exchangeTitle
    self.exchangeGlyph = exchangeGlyph
    self.exchangeMenuLabels = exchangeMenuLabels
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func loadView() {
    overlayView.backgroundColor = .clear
    overlayView.isOpaque = false
    view = overlayView
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    addChild(systemTabController)
    view.addSubview(systemTabController.view)
    // This is the transparent content layer above WKWebView. The system-owned
    // tab bar keeps its default Liquid Glass appearance and interaction.
    systemTabController.view.backgroundColor = .clear
    systemTabController.view.isOpaque = false
    systemTabController.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      systemTabController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      systemTabController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      systemTabController.view.topAnchor.constraint(equalTo: view.topAnchor),
      systemTabController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    ])
    systemTabController.didMove(toParent: self)

    systemTabController.tabBar.accessibilityIdentifier = "ims-native-liquid-glass-tab-bar"
    overlayView.interactiveView = systemTabController.tabBar
    if #available(iOS 26.0, *), let exchangeTitle, let exchangeGlyph {
      let button = NativeExchangeGlassButton(title: exchangeTitle, glyph: exchangeGlyph)
      if let exchangeMenuLabels {
        let menu = NativeExchangeMenu(labels: exchangeMenuLabels)
        menu.onDismiss = { [weak self] in self?.dismissExchangeMenu(animated: true) }
        menu.onQR = { [weak self] in
          guard let self, !self.interactionBlocked else { return }
          self.dismissExchangeMenu(animated: false)
          self.onExchangeQR?()
        }
        view.addSubview(menu)
        overlayView.exchangeMenuView = menu
        exchangeMenuView = menu
      }
      button.addAction(UIAction { [weak self] _ in self?.toggleExchangeMenu() }, for: .primaryActionTriggered)
      view.addSubview(button)
      overlayView.exchangeButton = button
      exchangeButton = button
      registerForTraitChanges([UITraitPreferredContentSizeCategory.self, UITraitHorizontalSizeClass.self, UITraitVerticalSizeClass.self]) {
        (host: NativeGlassTabBarHostViewController, _: UITraitCollection) in
        host.updateExchangeAppearance()
        host.view.setNeedsLayout()
      }
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    if #available(iOS 26.0, *) { layoutExchangeButton() }
    onLayout?()
  }

  @available(iOS 26.0, *)
  func applyTheme(dark: Bool) {
    let style: UIUserInterfaceStyle = dark ? .dark : .light
    guard overrideUserInterfaceStyle != style else { return }
    overrideUserInterfaceStyle = style
    updateExchangeAppearance()
  }

  @available(iOS 26.0, *)
  func updateExchangeAppearance() {
    let dark = overrideUserInterfaceStyle == .dark
    (exchangeButton as? NativeExchangeGlassButton)?.applyAppearance(dark: dark)
    (exchangeMenuView as? NativeExchangeMenu)?.applyAppearance(dark: dark)
    if !usesExchangeCircle { updateExchangeSlot() }
  }

  func setExchangeInert(_ inert: Bool) {
    interactionBlocked = inert
    if inert { dismissExchangeMenu() }
    exchangeButton?.isHidden = inert || !usesExchangeCircle
    exchangeButton?.isEnabled = !inert
    if !inert { view.setNeedsLayout() }
  }

  var exchangeMenuVisible: Bool { exchangeMenuView?.isHidden == false }

  @available(iOS 26.0, *)
  private func positionExchangeMenu(_ menu: NativeExchangeMenu) -> Bool {
    guard usesExchangeCircle, !UIAccessibility.isVoiceOverRunning, let button = exchangeButton else { return false }
    return menu.position(in: view.bounds, safeArea: view.safeAreaLayoutGuide.layoutFrame, anchor: button.center)
  }

  @available(iOS 26.0, *)
  private func toggleExchangeMenu() {
    guard !interactionBlocked, !systemTabController.isTabBarHidden else { return }
    if let menu = exchangeMenuView as? NativeExchangeMenu, menu.isOpen {
      dismissExchangeMenu(animated: true)
      return
    }
    guard let menu = exchangeMenuView as? NativeExchangeMenu, positionExchangeMenu(menu), let parent = view.superview else {
      onExchange?()
      return
    }
    if !exchangeMenuVisible, let index = parent.subviews.firstIndex(of: view) {
      previousUpperSibling = parent.subviews.dropFirst(index + 1).first
    }
    parent.bringSubviewToFront(view)
    systemTabController.tabBar.accessibilityElementsHidden = true
    (exchangeButton as? NativeExchangeGlassButton)?.setCloseLabel(menu.closeLabel)
    updateExchangeAppearance()
    menu.setOpen(true, animated: true)
  }

  func dismissExchangeMenu(animated: Bool = false) {
    guard #available(iOS 26.0, *), let menu = exchangeMenuView as? NativeExchangeMenu, !menu.isHidden else { return }
    (exchangeButton as? NativeExchangeGlassButton)?.setCloseLabel(nil)
    updateExchangeAppearance()
    menu.setOpen(false, animated: animated) { [weak self] in
      guard let self else { return }
      if let sibling = self.previousUpperSibling, let parent = self.view.superview, sibling.superview === parent {
        parent.insertSubview(self.view, belowSubview: sibling)
      }
      self.previousUpperSibling = nil
      self.systemTabController.tabBar.accessibilityElementsHidden = self.interactionBlocked
    }
  }

  @available(iOS 26.0, *)
  private func updateExchangeSlot() {
    guard let exchangeTitle, let exchangeGlyph,
      let tab = systemTabController.tabs.first(where: { $0.identifier == exchangeActionTabID }) else { return }
    let tint = overrideUserInterfaceStyle == .dark
      ? UIColor(red: 1, green: 0.47, blue: 0.71, alpha: 1)
      : UIColor(red: 0.76, green: 0.14, blue: 0.42, alpha: 1)
    tab.title = usesExchangeCircle ? "" : exchangeTitle
    tab.image = usesExchangeCircle ? nil : exchangeGlyph.withTintColor(tint, renderingMode: .alwaysOriginal)
    tab.isEnabled = !usesExchangeCircle
  }

  @available(iOS 26.0, *)
  private func layoutExchangeButton() {
    guard let button = exchangeButton as? NativeExchangeGlassButton, !systemTabController.isTabBarHidden else { return }
    let diameter = button.preferredDiameter
    let range = navigationRange(in: view)
    let docking = navigationDockingFrame(in: view)
    // Keep the system action when the available slot is too small, or when
    // VoiceOver needs UIKit's tab order without an empty center stop.
    let fits = traitCollection.userInterfaceIdiom == .phone && traitCollection.verticalSizeClass == .regular
      && !UIAccessibility.isVoiceOverRunning
      && diameter <= min(64, (range?.width ?? 0) / 5 - 4)
      && (docking?.height ?? 0) >= diameter
    if fits != usesExchangeCircle {
      usesExchangeCircle = fits
      updateExchangeSlot()
    }
    if fits, let docking {
      // The public docking strip includes the home-indicator area and is not
      // the painted capsule. Keep the circle centered in its upper section.
      let centerY = docking.minY + min(31, docking.height / 2)
      button.frame = CGRect(x: docking.midX - diameter / 2, y: centerY - diameter / 2,
        width: diameter, height: diameter)
    }
    if let menu = exchangeMenuView as? NativeExchangeMenu, menu.isOpen, !positionExchangeMenu(menu) {
      dismissExchangeMenu()
    }
    button.isHidden = interactionBlocked || !usesExchangeCircle
  }

  override func viewLayoutMarginsDidChange() {
    super.viewLayoutMarginsDidChange()
    view.setNeedsLayout()
  }

  override func viewSafeAreaInsetsDidChange() {
    super.viewSafeAreaInsetsDidChange()
    view.setNeedsLayout()
  }

  func navigationRange(in target: UIView) -> CGRect? {
    guard let root = systemTabController.viewIfLoaded else { return nil }
    let margins = root.layoutMargins
    guard let range = ExchangeSearchLayout.navigationRange(bounds: root.bounds, leftMargin: margins.left, rightMargin: margins.right, safeLeft: root.safeAreaInsets.left, safeRight: root.safeAreaInsets.right) else { return nil }
    return root.convert(range, to: target)
  }

  func navigationDockingFrame(in target: UIView) -> CGRect? {
    guard #available(iOS 26.0, *), !systemTabController.isTabBarHidden else { return nil }
    let bar = systemTabController.tabBar
    guard !bar.isHidden, bar.alpha > 0, let window = bar.window, target.window === window else { return nil }
    // Public tab-strip bounds are a docking input, not an exact glass contour.
    let frame = bar.convert(bar.bounds, to: target)
    return ExchangeSearchLayout.validDOMNavigation(frame, viewport: target.bounds) ? frame : nil
  }
}

final class NativeGlassPlugin: Plugin, UITabBarControllerDelegate, UIGestureRecognizerDelegate {
  private weak var webview: WKWebView?
  private var items: [NativeTabItem] = []
  private var selectedColor = imsTabBarSelectedColor
  private var currentRoute = ""
  private var routeKey: String?
  private var isSynchronizingSelection = false
  private var interactionBlocked = false
  private var tabBarController: UITabBarController?
  private var tabBarHost: NativeGlassTabBarHostViewController?
  // Stored as the base class so this iOS 15-compatible plugin type never
  // declares a stored property of an iOS 26-only subclass. Every read casts
  // inside an `#available(iOS 26.0, *)` scope.
  private var controlHost: UIViewController?
  private var searchHost: UIViewController?
  private var searchGeneration: UInt64 = 0
  private var navigationLayoutGeneration = UInt64(Date().timeIntervalSince1970 * 1000)
  private var navigationLayoutRevision: UInt64 = 0
  private var navigationLayoutSignature: String?
  private var backPolicyGeneration: UInt64 = 0
  private var backPolicyRevision: UInt64 = 0
  private var backCanNavigate = false
  private var backGestureId: UInt64 = 0
  private var backGestureActive = false
  private weak var backEdgeRecognizer: UIScreenEdgePanGestureRecognizer?

  @objc public func setSearch(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(NativeSearchArgs.self)
    guard #available(iOS 26.0, *) else {
      invoke.resolve(["supported": false, "reason": "requires-ios-26"])
      return
    }
    DispatchQueue.main.async {
      guard args.generation >= self.searchGeneration else {
        invoke.resolve(["supported": false, "reason": "stale-search-generation"])
        return
      }
      self.searchGeneration = args.generation
      self.publishExchangeNavigationLayout(force: true)
      guard ["refresh-cw", "loader-circle"].allSatisfy({ UIImage(named: $0) != nil }) else {
        self.removeSearchHost()
        invoke.resolve(["supported": false, "reason": "missing-search-icon"])
        return
      }
      guard let parent = self.manager.viewController, let webview = self.webview,
        args.host.width > 24, args.host.height > 120,
        ["collapsed", "medium", "large"].contains(args.detent) else {
        self.removeSearchHost()
        invoke.resolve(["supported": false, "reason": "invalid-search-host"])
        return
      }
      let host: NativeGlassSearchHost
      if let existing = self.searchHost as? NativeGlassSearchHost { host = existing }
      else {
        host = NativeGlassSearchHost()
        parent.addChild(host)
        parent.view.addSubview(host.view)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
          host.view.leadingAnchor.constraint(equalTo: parent.view.leadingAnchor),
          host.view.trailingAnchor.constraint(equalTo: parent.view.trailingAnchor),
          host.view.topAnchor.constraint(equalTo: parent.view.topAnchor),
          host.view.bottomAnchor.constraint(equalTo: parent.view.bottomAnchor)
        ])
        host.didMove(toParent: parent)
        self.searchHost = host
      }
      host.webview = webview
      host.navigationRange = { [weak self, weak host] in
        guard let host else { return nil }
        return self?.tabBarHost?.navigationRange(in: host.view)
      }
      host.navigationDockingFrame = { [weak self, weak host] in
        guard let host else { return nil }
        return self?.tabBarHost?.navigationDockingFrame(in: host.view)
      }
      host.hasLocate = (self.controlHost as? NativeGlassControlHostViewController)?.hasLocate == true
      host.onSideLayout = { [weak self, weak host] frame, covered in
        guard let self, let host,
          let controls = self.controlHost as? NativeGlassControlHostViewController else { return }
        let converted = frame.map { host.view.convert($0, to: controls.overlayView) }
        controls.setSearchLocateFrame(converted, covered: covered)
      }
      host.onEvent = { [weak self] detail in
        guard let data = try? JSONSerialization.data(withJSONObject: detail),
          let literal = String(data: data, encoding: .utf8) else { return }
        self?.webview?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('ims:native-glass-search',{detail:\(literal)}))", completionHandler: nil)
      }
      parent.view.layoutIfNeeded()
      host.render(args)
      self.orderSearchAndControlHosts(in: parent)
      invoke.resolve(["supported": true])
    }
  }

  @objc public func removeSearch(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(NativeRemoveSearchArgs.self)
    DispatchQueue.main.async {
      if #available(iOS 26.0, *), let host = self.searchHost as? NativeGlassSearchHost,
        host.snapshot?.id == args.id, host.snapshot?.generation == args.generation {
        self.removeSearchHost()
      }
      if #available(iOS 26.0, *) { self.publishExchangeNavigationLayout(force: true) }
      invoke.resolve()
    }
  }

  @available(iOS 26.0, *)
  private func removeSearchHost() {
    guard let host = searchHost as? NativeGlassSearchHost else { return }
    searchHost = nil
    host.clear()
    detach(host)
  }

  override func load(webview: WKWebView) {
    self.webview = webview
    webview.scrollView.bounces = false
    // App stacks own page history. Replaying WebKit's back/forward list can
    // reach entries from another tab, so the system gesture stays disabled and
    // the App admits its own edge gesture instead.
    webview.allowsBackForwardNavigationGestures = false
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(exchangeAccessibilityDidChange(_:)),
      name: UIAccessibility.reduceTransparencyStatusDidChangeNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(exchangeAccessibilityDidChange(_:)),
      name: UIAccessibility.voiceOverStatusDidChangeNotification,
      object: nil
    )
    #if DEBUG
    logNativeGlass("plugin loaded")
    #endif
  }

  @objc public func setBackPolicy(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(BackPolicyArgs.self)
    DispatchQueue.main.async {
      guard args.generation >= self.backPolicyGeneration else {
        invoke.resolve(["supported": true, "applied": false, "reason": "stale-generation"])
        return
      }
      self.backPolicyGeneration = args.generation
      self.backPolicyRevision = args.revision
      self.backCanNavigate = args.canBack
      if args.canBack { self.installBackEdgeRecognizer() }
      invoke.resolve(["supported": true, "applied": true])
    }
  }

  private func installBackEdgeRecognizer() {
    guard backEdgeRecognizer == nil, let host = manager.viewController else { return }
    let recognizer = UIScreenEdgePanGestureRecognizer(
      target: self, action: #selector(handleBackEdge(_:)))
    recognizer.edges = .left
    recognizer.delegate = self
    recognizer.cancelsTouchesInView = false
    host.view.addGestureRecognizer(recognizer)
    backEdgeRecognizer = recognizer
    publishBackPolicy()
  }

  /// Republish after the host exists so a policy set before layout is not lost.
  private func publishBackPolicy() {
    guard let webview else { return }
    let detail: [String: Any] = [
      "generation": backPolicyGeneration,
      "revision": backPolicyRevision,
      "canBack": backCanNavigate,
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: detail),
      let literal = String(data: data, encoding: .utf8)
    else { return }
    webview.evaluateJavaScript(
      "window.dispatchEvent(new CustomEvent('ims:native-back-policy',{detail:\(literal)}))",
      completionHandler: nil)
  }

  func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === backEdgeRecognizer else { return true }
    return backCanNavigate && tabBarHost?.exchangeMenuVisible != true
  }

  @objc private func handleBackEdge(_ gesture: UIScreenEdgePanGestureRecognizer) {
    switch gesture.state {
    case .began:
      backGestureId &+= 1
      backGestureActive = true
      emitBack("begin", progress: 0)
    case .changed:
      guard backGestureActive else { return }
      let width = max(gesture.view?.bounds.width ?? 1, 1)
      let progress = min(max(gesture.translation(in: gesture.view).x / width, 0), 1)
      emitBack("progress", progress: Double(progress))
    case .ended:
      guard backGestureActive else { return }
      backGestureActive = false
      let width = max(gesture.view?.bounds.width ?? 1, 1)
      let progress = gesture.translation(in: gesture.view).x / width
      let velocity = gesture.velocity(in: gesture.view).x
      if progress > 0.35 || velocity > 500 {
        emitBack("commit", progress: 1)
      } else {
        emitBack("cancel", progress: 0)
      }
    default:
      guard backGestureActive else { return }
      backGestureActive = false
      emitBack("cancel", progress: 0)
    }
  }

  private func emitBack(_ phase: String, progress: Double) {
    guard let webview else { return }
    let detail: [String: Any] = [
      "generation": backPolicyGeneration,
      "revision": backPolicyRevision,
      "gestureId": backGestureId,
      "phase": phase,
      "progress": progress,
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: detail),
      let literal = String(data: data, encoding: .utf8)
    else { return }
    webview.evaluateJavaScript(
      "window.dispatchEvent(new CustomEvent('ims:native-back',{detail:\(literal)}))",
      completionHandler: nil)
  }

  @objc public func configure(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ConfigureArgs.self)
    guard !args.items.isEmpty else {
      invoke.reject("Native glass requires at least one tab")
      return
    }

    guard #available(iOS 26.0, *) else {
      #if DEBUG
      logNativeGlass("configure rejected: requires iOS 26")
      #endif
      invoke.resolve(["supported": false, "reason": "requires-ios-26"])
      return
    }

    DispatchQueue.main.async {
      guard let hostController = self.manager.viewController else {
        #if DEBUG
        logNativeGlass("configure rejected: host view controller is unavailable")
        #endif
        invoke.reject("Native glass host view controller is unavailable")
        return
      }

      if self.install(in: hostController, args: args) {
        #if DEBUG
        logNativeGlass("installed a system UITabBarController")
        #endif
        invoke.resolve(["supported": true])
      } else {
        #if DEBUG
        logNativeGlass("configure rejected: Lucide icon is unavailable")
        #endif
        invoke.resolve(["supported": false, "reason": "lucide-icon-unavailable"])
      }
    }
  }

  @objc public func update(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(UpdateArgs.self)

    guard #available(iOS 26.0, *) else {
      invoke.resolve(["supported": false, "reason": "requires-ios-26"])
      return
    }

    DispatchQueue.main.async {
      guard self.tabBarController != nil else {
        invoke.resolve(["supported": false, "reason": "native-glass-inactive"])
        return
      }
      if let routeKey = args.routeKey, routeKey != self.routeKey {
        self.routeKey = routeKey
        self.tabBarHost?.dismissExchangeMenu()
      }
      if let currentRoute = args.currentRoute, currentRoute != self.currentRoute {
        self.currentRoute = currentRoute
        self.tabBarHost?.dismissExchangeMenu()
      }
      if let selectedIndex = args.selectedIndex { self.selectTab(at: selectedIndex) }
      if let accountBadge = args.accountBadge { self.setAccountBadge(accountBadge) }
      if let selectedColor = args.selectedColor {
        self.selectedColor = selectedColor.uiColor
      }
      self.applyAppearance(dark: args.dark)
      self.setInteractionBlocked(args.interactionBlocked ?? false)
      // Yield to a modal immediately. The return uses UIKit's own transition.
      self.setBarHidden(args.hidden ?? false, animated: args.hidden != true && !UIAccessibility.isReduceMotionEnabled)
      self.publishExchangeNavigationLayout()
      invoke.resolve(["supported": true])
    }
  }

  @objc public func setControls(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(NativeGlassControlsArgs.self)

    guard #available(iOS 26.0, *) else {
      invoke.resolve(["supported": false, "reason": "requires-ios-26"])
      return
    }

    DispatchQueue.main.async {
      guard let hostController = self.manager.viewController else {
        invoke.resolve(["supported": false, "reason": "native-glass-unavailable"])
        return
      }

      // An empty set is the teardown path, not an unsupported platform: it
      // must still report success so the Web side clears `data-native-glass`.
      if args.controls.isEmpty {
        (self.controlHost as? NativeGlassControlHostViewController)?.clear()
        (self.searchHost as? NativeGlassSearchHost)?.hasLocate = false
        invoke.resolve(["supported": true])
        return
      }

      guard let webview = self.webview else {
        invoke.resolve(["supported": false, "reason": "native-glass-unavailable"])
        return
      }

      let host = self.installControlHost(in: hostController)
      host.onEvent = { [weak self] id, action, itemId in
        self?.dispatchControl(id: id, action: action, itemId: itemId)
      }
      // The host is installed with Auto Layout, so its frame is still `.zero`
      // until a layout pass runs. Measuring the offset from an unlaid frame
      // would place every control at the webview origin.
      host.view.layoutIfNeeded()
      let offset = self.controlOffset(in: host.overlayView, webview: webview)
      if host.render(controls: args.controls, dark: args.dark, offset: offset) {
        if let search = self.searchHost as? NativeGlassSearchHost {
          search.hasLocate = host.hasLocate
          search.view.setNeedsLayout()
          search.view.layoutIfNeeded()
          host.setSearchLocateFrame(
            search.locateFrame.map { search.view.convert($0, to: host.overlayView) },
            covered: search.locateCovered
          )
        }
        invoke.resolve(["supported": true])
      } else {
        // Any missing Lucide asset fails the whole set rather than drawing a
        // partial control surface. The DOM twins stay visible.
        host.clear()
        (self.searchHost as? NativeGlassSearchHost)?.hasLocate = false
        invoke.resolve(["supported": false, "reason": "lucide-icon-unavailable"])
      }
    }
  }

  @objc public func destroy(_ invoke: Invoke) {
    backCanNavigate = false
    if let recognizer = backEdgeRecognizer {
      recognizer.view?.removeGestureRecognizer(recognizer)
      backEdgeRecognizer = nil
    }
    DispatchQueue.main.async {
      self.removeBar(animated: true)
      if #available(iOS 26.0, *) {
        self.removeControlHost()
        self.removeSearchHost()
      }
      invoke.resolve()
    }
  }

  @available(iOS 26.0, *)
  private func install(in hostController: UIViewController, args: ConfigureArgs) -> Bool {
    removeBar(animated: false)
    items = args.items
    currentRoute = args.currentRoute
    routeKey = args.routeKey
    selectedColor = args.selectedColor?.uiColor ?? imsTabBarSelectedColor
    guard let tabs = makeTabs() else {
      items = []
      return false
    }

    let tabController = UITabBarController()
    tabController.delegate = self
    tabController.mode = .tabBar
    tabController.tabs = tabs
    // Apply visibility before attaching the host, including a launch into a modal.
    tabController.setTabBarHidden(args.hidden ?? false, animated: false)

    let exchangeItem = items.first(where: { $0.action == "exchange" })
    let tabBarHost = NativeGlassTabBarHostViewController(
      tabBarController: tabController,
      exchangeTitle: exchangeItem?.title,
      exchangeGlyph: Self.exchangeGlyph,
      exchangeMenuLabels: args.routeKey == nil ? nil : exchangeItem?.menu
    )
    tabBarHost.onExchange = { [weak self] in self?.dispatchExchange() }
    tabBarHost.onExchangeQR = { [weak self] in self?.dispatchExchangeQR() }
    hostController.addChild(tabBarHost)
    hostController.view.addSubview(tabBarHost.view)
    tabBarHost.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      tabBarHost.view.leadingAnchor.constraint(equalTo: hostController.view.leadingAnchor),
      tabBarHost.view.trailingAnchor.constraint(equalTo: hostController.view.trailingAnchor),
      tabBarHost.view.topAnchor.constraint(equalTo: hostController.view.topAnchor),
      tabBarHost.view.bottomAnchor.constraint(equalTo: hostController.view.bottomAnchor)
    ])
    tabBarHost.didMove(toParent: hostController)

    self.tabBarController = tabController
    self.tabBarHost = tabBarHost
    navigationLayoutGeneration += 1
    tabBarHost.onLayout = { [weak self] in
      guard let self else { return }
      self.searchHost?.view.setNeedsLayout()
      self.publishExchangeNavigationLayout()
    }
    selectTab(at: args.selectedIndex)
    setAccountBadge(args.accountBadge)
    applyAppearance(dark: args.dark)
    setInteractionBlocked(args.interactionBlocked ?? false)
    hostController.view.layoutIfNeeded()
    publishExchangeNavigationLayout()
    return true
  }

  @available(iOS 26.0, *)
  private func makeTabs() -> [UITab]? {
    var tabs: [UITab] = []
    for item in items {
      let identifier: String
      let image: UIImage?
      if item.action == "exchange" {
        identifier = exchangeActionTabID
        image = Self.exchangeGlyph
      } else if let route = item.route, let lucideIcon = item.lucideIcon {
        identifier = route
        image = lucideImage(for: lucideIcon)
      } else {
        return nil
      }
      guard let image else { return nil }
      tabs.append(UITab(title: item.title, image: image, identifier: identifier) { _ in
        NativeTabContentViewController()
      })
    }
    return tabs
  }

  // The DOM twin imports the same vector asset as a tintable mask.
  private static let exchangeGlyph = UIImage(named: "exchange-two-namecards")?
    .withRenderingMode(.alwaysTemplate)

  private func lucideImage(for identifier: String) -> UIImage? {
    return UIImage(named: identifier)?.withRenderingMode(.alwaysTemplate)
  }

  @available(iOS 26.0, *)
  private func selectTab(at index: Int) {
    guard let tabBarController else { return }
    let tab = tabBarController.tabs.indices.contains(index) ? tabBarController.tabs[index] : nil
    let selection = tab?.identifier == exchangeActionTabID ? nil : tab
    guard tabBarController.selectedTab !== selection else { return }
    isSynchronizingSelection = true
    defer { isSynchronizingSelection = false }
    tabBarController.selectedTab = selection
  }

  @available(iOS 26.0, *)
  private func setAccountBadge(_ value: String) {
    guard let account = tabBarController?.tabs.first(where: { $0.identifier == "/account/me" }) else { return }
    let badge = value.isEmpty ? nil : value
    if account.badgeValue != badge { account.badgeValue = badge }
  }

  @available(iOS 26.0, *)
  private func applyAppearance(dark: Bool) {
    guard let tabBarController else { return }
    tabBarHost?.applyTheme(dark: dark)
    tabBarController.tabBar.tintColor = selectedColor
    tabBarController.tabBar.unselectedItemTintColor = .secondaryLabel
  }

  @objc private func exchangeAccessibilityDidChange(_ notification: Notification) {
    DispatchQueue.main.async { [weak self] in
      guard #available(iOS 26.0, *), let host = self?.tabBarHost else { return }
      host.updateExchangeAppearance()
      host.view.setNeedsLayout()
    }
  }

  @available(iOS 18.0, *)
  private func setInteractionBlocked(_ blocked: Bool) {
    interactionBlocked = blocked
    updateBarInteraction()
  }

  @available(iOS 18.0, *)
  private func updateBarInteraction() {
    guard let tabBarController else { return }
    let inert = interactionBlocked || tabBarController.isTabBarHidden
    tabBarController.tabBar.isUserInteractionEnabled = !inert
    tabBarHost?.setExchangeInert(inert)
    tabBarController.tabBar.accessibilityElementsHidden = inert || tabBarHost?.exchangeMenuVisible == true
  }

  @available(iOS 18.0, *)
  private func setBarHidden(_ hidden: Bool, animated: Bool) {
    guard let tabBarController, tabBarController.isTabBarHidden != hidden else { return }
    tabBarController.setTabBarHidden(hidden, animated: animated)
    updateBarInteraction()
    searchHost?.view.setNeedsLayout()
  }

  @available(iOS 26.0, *)
  private func publishExchangeNavigationLayout(force: Bool = false, removedRoute: String? = nil) {
    guard let webview, webview.bounds.width > 0, webview.bounds.height > 0 else { return }
    let route = removedRoute ?? currentRoute
    let range = tabBarHost?.navigationRange(in: webview)
    let inset = webview.scrollView.adjustedContentInset
    let available = range != nil && tabBarController != nil
    let visible = available && tabBarController?.isTabBarHidden == false
    var detail: [String: Any] = [
      "layoutGeneration": navigationLayoutGeneration,
      "route": route, "available": available, "visible": visible,
      "viewport": ["width": webview.bounds.width, "height": webview.bounds.height],
      "provenance": "native-public-layout-calibrated"
    ]
    // UIKit exposes the docking tab-strip, not its painted glass body. Use
    // the conservative body floor rather than misreporting safe-area height.
    if available { detail["bodyHeight"] = 44 }
    if let range {
      detail["inline"] = ["x": range.minX - inset.left, "width": range.width]
    } else { detail["inline"] = NSNull() }
    guard let signatureData = try? JSONSerialization.data(withJSONObject: detail, options: [.sortedKeys]),
      let signature = String(data: signatureData, encoding: .utf8), force || signature != navigationLayoutSignature else { return }
    navigationLayoutSignature = signature
    navigationLayoutRevision += 1
    detail["revision"] = navigationLayoutRevision
    guard let data = try? JSONSerialization.data(withJSONObject: detail), let literal = String(data: data, encoding: .utf8) else { return }
    webview.evaluateJavaScript("window.dispatchEvent(new CustomEvent('ims:exchange-navigation-layout',{detail:\(literal)}))", completionHandler: nil)
  }

  @available(iOS 18.0, *)
  func tabBarController(
    _ tabBarController: UITabBarController,
    shouldSelectTab tab: UITab
  ) -> Bool {
    if isSynchronizingSelection { return tab.identifier != exchangeActionTabID }
    guard !interactionBlocked, !tabBarController.isTabBarHidden else { return false }
    if tab.identifier == exchangeActionTabID {
      dispatchExchange()
      return false
    }
    return true
  }

  @available(iOS 18.0, *)
  private func dispatchExchange() {
    // An action never acquires the selection lens or changes the routed page.
    guard !interactionBlocked, tabBarController?.isTabBarHidden == false else { return }
    webview?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('ims:native-tab-action',{detail:{action:'exchange'}}))", completionHandler: nil)
  }

  @available(iOS 26.0, *)
  private func dispatchExchangeQR() {
    guard !interactionBlocked, tabBarController?.isTabBarHidden == false,
      let routeKey, let data = try? JSONEncoder().encode(routeKey),
      let literal = String(data: data, encoding: .utf8) else { return }
    webview?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('ims:native-tab-action',{detail:{action:'exchange-qr',routeKey:\(literal)}}))", completionHandler: nil)
  }

  @available(iOS 18.0, *)
  func tabBarController(
    _ tabBarController: UITabBarController,
    didSelectTab selectedTab: UITab,
    previousTab: UITab?
  ) {
    guard !isSynchronizingSelection, !interactionBlocked, !tabBarController.isTabBarHidden,
      items.contains(where: { $0.route == selectedTab.identifier }) else { return }
    if #available(iOS 26.0, *), selectedTab.identifier != "/community/exchange",
      let host = searchHost as? NativeGlassSearchHost {
      searchGeneration = max(searchGeneration, (host.snapshot?.generation ?? searchGeneration) + 1)
      removeSearchHost()
    }
    dispatchRoute(selectedTab.identifier)
  }

  private func dispatchRoute(_ route: String) {
    guard
      let webview,
      let routeData = try? JSONEncoder().encode(route),
      let routeLiteral = String(data: routeData, encoding: .utf8)
    else { return }

    let script = "window.dispatchEvent(new CustomEvent('ims:native-tab-select',{detail:{route:\(routeLiteral)}}))"
    webview.evaluateJavaScript(script, completionHandler: nil)
  }

  private func removeBar(animated: Bool) {
    guard let tabBarHost, let tabBarController else { return }
    let removedRoute = currentRoute
    currentRoute = ""
    routeKey = nil
    self.tabBarHost = nil
    self.tabBarController = nil
    navigationLayoutGeneration += 1
    if #available(iOS 26.0, *) { publishExchangeNavigationLayout(force: true, removedRoute: removedRoute) }
    tabBarController.delegate = nil
    tabBarHost.setExchangeInert(true)
    items = []

    guard animated else {
      detach(tabBarHost)
      return
    }

    guard #available(iOS 18.0, *) else {
      detach(tabBarHost)
      return
    }

    tabBarController.setTabBarHidden(true, animated: true)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.24) {
      self.detach(tabBarHost)
    }
  }

  private func detach(_ tabBarHost: UIViewController) {
    guard tabBarHost.parent != nil else { return }
    tabBarHost.willMove(toParent: nil)
    tabBarHost.view.removeFromSuperview()
    tabBarHost.removeFromParent()
  }

  @available(iOS 26.0, *)
  private func installControlHost(
    in hostController: UIViewController
  ) -> NativeGlassControlHostViewController {
    if let existing = controlHost as? NativeGlassControlHostViewController {
      orderSearchAndControlHosts(in: hostController)
      return existing
    }

    let host = NativeGlassControlHostViewController()
    hostController.addChild(host)
    hostController.view.addSubview(host.view)
    host.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      host.view.leadingAnchor.constraint(equalTo: hostController.view.leadingAnchor),
      host.view.trailingAnchor.constraint(equalTo: hostController.view.trailingAnchor),
      host.view.topAnchor.constraint(equalTo: hostController.view.topAnchor),
      host.view.bottomAnchor.constraint(equalTo: hostController.view.bottomAnchor)
    ])
    host.didMove(toParent: hostController)
    controlHost = host
    orderSearchAndControlHosts(in: hostController)
    return host
  }

  /// The search host owns the shared material; locate ink must composite above
  /// that material after either installation order or modal reinstallation.
  private func orderSearchAndControlHosts(in parent: UIViewController) {
    if let search = searchHost, let controls = controlHost,
      search.view.superview === parent.view, controls.view.superview === parent.view {
      parent.view.insertSubview(controls.view, aboveSubview: search.view)
    }
    if let tabBarHost, tabBarHost.exchangeMenuVisible, tabBarHost.view.superview === parent.view {
      parent.view.bringSubviewToFront(tabBarHost.view)
    }
  }

  @available(iOS 26.0, *)
  private func removeControlHost() {
    guard let host = controlHost as? NativeGlassControlHostViewController else { return }
    controlHost = nil
    host.clear()
    host.willMove(toParent: nil)
    host.view.removeFromSuperview()
    host.removeFromParent()
  }

  /// Maps the WebView's CSS viewport origin into the overlay's coordinate
  /// space. The WKWebView fills the window, so its frame origin is usually
  /// already the CSS origin; the adjusted content inset covers a WebKit scroll
  /// view that insets itself for the safe area. `safeAreaInsets` alone would
  /// double-count when `viewport-fit=cover` lets the page place its own
  /// `env(safe-area-inset-*)` padding.
  private func controlOffset(in hostView: UIView, webview: WKWebView) -> CGPoint {
    let origin = webview.convert(CGPoint.zero, to: hostView)
    let inset = webview.scrollView.adjustedContentInset
    return CGPoint(x: origin.x + inset.left, y: origin.y + inset.top)
  }

  private func dispatchControl(id: String, action: String, itemId: String?) {
    guard let webview else { return }

    var detail: [String: String] = ["id": id, "action": action]
    if let itemId {
      detail["itemId"] = itemId
    }
    guard
      let detailData = try? JSONSerialization.data(
        withJSONObject: detail,
        options: [.sortedKeys]
      ),
      let detailLiteral = String(data: detailData, encoding: .utf8)
    else { return }

    let script =
      "window.dispatchEvent(new CustomEvent('ims:native-glass-control',{detail:\(detailLiteral)}))"
    webview.evaluateJavaScript(script, completionHandler: nil)
  }
}

@_cdecl("init_plugin_native_glass")
func initPlugin() -> Plugin {
  return NativeGlassPlugin()
}
#endif
