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

private let imsTabBarSelectedColor = UIColor(
  red: 1,
  green: 23.0 / 255.0,
  blue: 79.0 / 255.0,
  alpha: 1
)

private struct NativeColor: Decodable {
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
  let route: String
  let lucideIcon: String
  let title: String
}

private struct ConfigureArgs: Decodable {
  let dark: Bool
  let hidden: Bool?
  let items: [NativeTabItem]
  let selectedColor: NativeColor?
  let selectedIndex: Int
}

private struct UpdateArgs: Decodable {
  let dark: Bool
  let hidden: Bool?
  let selectedColor: NativeColor?
  let selectedIndex: Int?
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

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard
      let hitView = super.hitTest(point, with: event),
      let interactiveView,
      hitView === interactiveView || hitView.isDescendant(of: interactiveView)
    else {
      return nil
    }
    return hitView
  }
}

private final class NativeGlassTabBarHostViewController: UIViewController {
  let systemTabController: UITabBarController
  private let overlayView = NativeTabBarOverlayView()

  init(tabBarController: UITabBarController) {
    self.systemTabController = tabBarController
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
  }
}

final class NativeGlassPlugin: Plugin, UITabBarControllerDelegate {
  private weak var webview: WKWebView?
  private var items: [NativeTabItem] = []
  private var selectedColor = imsTabBarSelectedColor
  private var selectedIndex = 0
  private var isSynchronizingSelection = false
  private var tabBarController: UITabBarController?
  private var tabBarHost: NativeGlassTabBarHostViewController?

  override func load(webview: WKWebView) {
    self.webview = webview
    webview.scrollView.bounces = false
    #if DEBUG
    logNativeGlass("plugin loaded")
    #endif
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
      if let selectedIndex = args.selectedIndex {
        self.selectTab(at: selectedIndex)
      }
      if let selectedColor = args.selectedColor {
        self.selectedColor = selectedColor.uiColor
      }
      self.applyAppearance(dark: args.dark)
      self.setBarHidden(args.hidden ?? false, animated: true)
      invoke.resolve(["supported": true])
    }
  }

  @objc public func destroy(_ invoke: Invoke) {
    DispatchQueue.main.async {
      self.removeBar(animated: true)
      invoke.resolve()
    }
  }

  @available(iOS 26.0, *)
  private func install(in hostController: UIViewController, args: ConfigureArgs) -> Bool {
    removeBar(animated: false)
    items = args.items
    selectedColor = args.selectedColor?.uiColor ?? imsTabBarSelectedColor
    guard let tabs = makeTabs() else {
      items = []
      return false
    }

    let tabController = UITabBarController()
    tabController.delegate = self
    tabController.mode = .tabBar
    tabController.tabs = tabs

    let tabBarHost = NativeGlassTabBarHostViewController(
      tabBarController: tabController
    )
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
    selectTab(at: args.selectedIndex)
    applyAppearance(dark: args.dark)
    setBarHidden(args.hidden ?? false, animated: false)
    return true
  }

  @available(iOS 26.0, *)
  private func makeTabs() -> [UITab]? {
    var tabs: [UITab] = []
    for item in items {
      guard let image = lucideImage(for: item.lucideIcon) else {
        return nil
      }
      tabs.append(
        UITab(
          title: item.title,
          image: image.withRenderingMode(.alwaysTemplate),
          identifier: item.route
        ) { _ in
          NativeTabContentViewController()
        }
      )
    }
    return tabs
  }

  private func lucideImage(for identifier: String) -> UIImage? {
    return UIImage(named: identifier)?.withRenderingMode(.alwaysTemplate)
  }

  @available(iOS 26.0, *)
  private func selectTab(at index: Int) {
    guard let tabBarController, !items.isEmpty else { return }
    selectedIndex = clampedIndex(index)
    guard tabBarController.tabs.indices.contains(selectedIndex) else { return }

    isSynchronizingSelection = true
    defer { isSynchronizingSelection = false }
    tabBarController.selectedTab = tabBarController.tabs[selectedIndex]
  }

  private func clampedIndex(_ index: Int) -> Int {
    guard !items.isEmpty else { return 0 }
    return min(max(index, 0), items.count - 1)
  }

  @available(iOS 26.0, *)
  private func applyAppearance(dark: Bool) {
    tabBarController?.overrideUserInterfaceStyle = dark ? .dark : .light
    tabBarController?.tabBar.tintColor = selectedColor
    tabBarController?.tabBar.unselectedItemTintColor = .secondaryLabel
  }

  @available(iOS 18.0, *)
  private func setBarHidden(_ hidden: Bool, animated: Bool) {
    tabBarController?.setTabBarHidden(hidden, animated: animated)
  }

  @available(iOS 18.0, *)
  func tabBarController(
    _ tabBarController: UITabBarController,
    didSelectTab selectedTab: UITab,
    previousTab: UITab?
  ) {
    guard !isSynchronizingSelection else { return }
    guard let index = items.firstIndex(where: { $0.route == selectedTab.identifier }) else {
      return
    }

    selectedIndex = index
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
    self.tabBarHost = nil
    self.tabBarController = nil
    tabBarController.delegate = nil
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
}

@_cdecl("init_plugin_native_glass")
func initPlugin() -> Plugin {
  return NativeGlassPlugin()
}
#endif
