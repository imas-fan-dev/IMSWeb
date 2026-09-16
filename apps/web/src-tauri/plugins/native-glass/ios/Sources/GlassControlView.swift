#if canImport(Tauri)
import UIKit

/// `frame` uses CSS pixels with the origin at the top-left of the WebView
/// viewport. The layout code in `NativeGlassPlugin` turns that into UIKit
/// points before it reaches the renderer.
struct NativeGlassControlFrame: Decodable {
  let originX: Double
  let originY: Double
  let width: Double
  let height: Double

  private enum CodingKeys: String, CodingKey {
    case originX = "x"
    case originY = "y"
    case width
    case height
  }
}

struct NativeGlassControlMenuItem: Decodable {
  let id: String
  let icon: String
  let label: String
  let active: Bool?
  let badge: Bool?
}

/// One entry of the frozen `setControls` payload. Both union variants decode
/// into this shape; `kind` selects the renderer branch.
struct NativeGlassControlPayload: Decodable {
  let id: String
  let kind: String
  let icon: String
  let label: String
  let frame: NativeGlassControlFrame
  let cornerRadius: Double
  let active: Bool?
  let disabled: Bool?
  let expanded: Bool?
  let panelWidth: Double?
  let items: [NativeGlassControlMenuItem]?
}

struct NativeGlassControlsArgs: Decodable {
  let controls: [NativeGlassControlPayload]
  let dark: Bool
}

/// Internal menu metrics. Control size and corner radius always come from the
/// payload; these only describe the native list the payload cannot carry.
private let glassControlPanelGap: CGFloat = 8
private let glassControlPanelPadding: CGFloat = 4
private let glassControlRowHeight: CGFloat = 44
private let glassControlRowInset: CGFloat = 12
private let glassControlLabelGap: CGFloat = 8
private let glassControlBadgeSize: CGFloat = 6
private let glassControlIconLimit: CGFloat = 22
private let glassControlPressScale: CGFloat = 0.94

/// Transparent overlay that only claims touches inside a registered control.
/// Everything else falls through to the WKWebView underneath.
private final class GlassControlOverlayView: UIView {
  var interactiveViews: [UIView] = []

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard let hitView = super.hitTest(point, with: event), hitView !== self else {
      return nil
    }
    for interactiveView in interactiveViews
    where hitView === interactiveView || hitView.isDescendant(of: interactiveView) {
      return hitView
    }
    return nil
  }
}

/// One tappable native control. Glass-backed instances paint a `UIGlassEffect`
/// surface; menu rows skip it so the surrounding panel owns the glass.
@available(iOS 26.0, *)
private final class GlassControlButton: UIControl {
  private let glassBacked: Bool
  private let showsTitle: Bool
  private let glassEffect: UIGlassEffect?
  private let glassView: UIVisualEffectView?
  private let selectionView = UIView()
  private let iconView = UIImageView()
  private let titleLabel = UILabel()
  private let badgeView = UIView()
  private var isActive = false

  var cornerRadius: CGFloat = 8 {
    didSet { setNeedsLayout() }
  }

  var onActivate: (() -> Void)?

  init(glassBacked: Bool, showsTitle: Bool) {
    self.glassBacked = glassBacked
    self.showsTitle = showsTitle
    let effect = glassBacked ? UIGlassEffect(style: .regular) : nil
    self.glassEffect = effect
    self.glassView = effect.map { UIVisualEffectView(effect: $0) }
    super.init(frame: .zero)

    if let glassView {
      glassView.isUserInteractionEnabled = false
      addSubview(glassView)
    }

    selectionView.isUserInteractionEnabled = false
    selectionView.isHidden = true
    selectionView.backgroundColor = UIColor.label.withAlphaComponent(0.08)
    addSubview(selectionView)

    iconView.contentMode = .scaleAspectFit
    iconView.isUserInteractionEnabled = false
    addSubview(iconView)

    if showsTitle {
      titleLabel.font = UIFont.preferredFont(forTextStyle: .subheadline)
      titleLabel.adjustsFontForContentSizeCategory = true
      titleLabel.lineBreakMode = .byTruncatingTail
      titleLabel.isUserInteractionEnabled = false
      addSubview(titleLabel)
    }

    badgeView.isUserInteractionEnabled = false
    badgeView.isHidden = true
    badgeView.backgroundColor = imsTabBarSelectedColor
    addSubview(badgeView)

    isAccessibilityElement = true
    accessibilityTraits = .button
    addTarget(self, action: #selector(handleActivate), for: .touchUpInside)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func configure(
    icon: String,
    title: String?,
    active: Bool,
    disabled: Bool,
    badge: Bool
  ) {
    isActive = active
    iconView.image = UIImage(named: icon)?.withRenderingMode(.alwaysTemplate)
    titleLabel.text = title
    iconView.tintColor = active ? imsTabBarSelectedColor : .label
    titleLabel.textColor = active ? imsTabBarSelectedColor : .label
    badgeView.isHidden = !badge
    isEnabled = !disabled
    alpha = disabled ? 0.4 : 1
    updateSelection()
    updateTraits(disabled: disabled)
    setNeedsLayout()
  }

  override var isHighlighted: Bool {
    didSet {
      updateSelection()
      let scale = isHighlighted ? glassControlPressScale : 1
      UIView.animate(
        withDuration: isHighlighted ? 0.1 : 0.2,
        delay: 0,
        options: [.allowUserInteraction, .beginFromCurrentState]
      ) {
        self.transform = CGAffineTransform(scaleX: scale, y: scale)
      }
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()

    if let glassView {
      glassView.frame = bounds
      glassView.layer.cornerRadius = cornerRadius
      glassView.layer.cornerCurve = .continuous
      glassView.clipsToBounds = true
    }

    selectionView.layer.cornerRadius = max(0, cornerRadius - glassControlPanelPadding)
    selectionView.layer.cornerCurve = .continuous

    let iconSide = min(bounds.height * 0.5, glassControlIconLimit)

    if showsTitle {
      selectionView.frame = bounds
      iconView.frame = CGRect(
        x: glassControlRowInset,
        y: (bounds.height - iconSide) / 2,
        width: iconSide,
        height: iconSide
      )
      let badgeSpace = badgeView.isHidden ? 0 : glassControlBadgeSize + glassControlLabelGap
      let labelX = iconView.frame.maxX + glassControlLabelGap
      titleLabel.frame = CGRect(
        x: labelX,
        y: 0,
        width: max(0, bounds.width - labelX - glassControlRowInset - badgeSpace),
        height: bounds.height
      )
      badgeView.frame = CGRect(
        x: bounds.width - glassControlRowInset - glassControlBadgeSize,
        y: (bounds.height - glassControlBadgeSize) / 2,
        width: glassControlBadgeSize,
        height: glassControlBadgeSize
      )
      badgeView.layer.cornerRadius = glassControlBadgeSize / 2
    } else {
      selectionView.frame = glassBacked ? .zero : bounds
      iconView.frame = CGRect(
        x: (bounds.width - iconSide) / 2,
        y: (bounds.height - iconSide) / 2,
        width: iconSide,
        height: iconSide
      )
      badgeView.frame = .zero
    }
  }

  private func updateSelection() {
    selectionView.isHidden = !(isActive || isHighlighted)
  }

  private func updateTraits(disabled: Bool) {
    var traits: UIAccessibilityTraits = [.button]
    if isActive {
      traits.insert(.selected)
    }
    if disabled {
      traits.insert(.notEnabled)
    }
    accessibilityTraits = traits
  }

  @objc private func handleActivate() {
    onActivate?()
  }
}

/// Builds the native control views for one `setControls` payload. Rendering is
/// a full replacement: the payload is the single source of truth, so the Web
/// and native sides can never diverge on state.
@available(iOS 26.0, *)
private final class GlassControlRenderer {
  private let overlay: GlassControlOverlayView
  var onEvent: ((String, String, String?) -> Void)?

  init(overlay: GlassControlOverlayView) {
    self.overlay = overlay
  }

  /// Returns `false` when a Lucide asset is missing. The caller then keeps the
  /// DOM twins visible instead of rendering a partial native control set.
  @discardableResult
  func render(
    _ controls: [NativeGlassControlPayload],
    dark: Bool,
    offset: CGPoint
  ) -> Bool {
    guard assetsAvailable(for: controls) else { return false }

    clear()
    overlay.overrideUserInterfaceStyle = dark ? .dark : .light

    var interactive: [UIView] = []
    for control in controls {
      if control.kind == "menu" {
        overlay.addSubview(makeMenu(control, offset: offset, interactive: &interactive))
      } else {
        let button = makeIconButton(control, offset: offset)
        overlay.addSubview(button)
        interactive.append(button)
      }
    }
    overlay.interactiveViews = interactive
    return true
  }

  func clear() {
    for subview in overlay.subviews {
      subview.removeFromSuperview()
    }
    overlay.interactiveViews = []
  }

  private func makeIconButton(
    _ control: NativeGlassControlPayload,
    offset: CGPoint
  ) -> GlassControlButton {
    let button = GlassControlButton(glassBacked: true, showsTitle: false)
    button.frame = rect(control.frame, offset: offset)
    button.cornerRadius = CGFloat(control.cornerRadius)
    button.accessibilityLabel = control.label
    button.configure(
      icon: control.icon,
      title: nil,
      active: control.active ?? false,
      disabled: control.disabled ?? false,
      badge: false
    )
    button.onActivate = { [weak self] in
      self?.onEvent?(control.id, "press", nil)
    }
    return button
  }

  private func makeMenu(
    _ control: NativeGlassControlPayload,
    offset: CGPoint,
    interactive: inout [UIView]
  ) -> UIView {
    let triggerFrame = rect(control.frame, offset: offset)
    let container = UIVisualEffectView(effect: UIGlassContainerEffect())

    let trigger = GlassControlButton(glassBacked: true, showsTitle: false)
    trigger.cornerRadius = CGFloat(control.cornerRadius)
    trigger.accessibilityLabel = control.label
    trigger.configure(
      icon: control.icon,
      title: nil,
      active: false,
      disabled: false,
      badge: false
    )
    trigger.onActivate = { [weak self] in
      self?.onEvent?(control.id, "press", nil)
    }

    let items = control.items ?? []

    if control.expanded == true {
      let panelHeight =
        glassControlPanelPadding * 2 + glassControlRowHeight * CGFloat(items.count)
      let panelWidth = CGFloat(control.panelWidth ?? 0)
      let panelFrame = CGRect(
        x: triggerFrame.minX - glassControlPanelGap - panelWidth,
        y: triggerFrame.maxY - panelHeight,
        width: panelWidth,
        height: panelHeight
      )
      let rootFrame = triggerFrame.union(panelFrame)
      container.frame = rootFrame
      trigger.frame = triggerFrame.offsetBy(dx: -rootFrame.minX, dy: -rootFrame.minY)
      let panel = makePanel(
        control,
        items: items,
        frame: panelFrame.offsetBy(dx: -rootFrame.minX, dy: -rootFrame.minY)
      )
      container.contentView.addSubview(trigger)
      container.contentView.addSubview(panel)
      interactive.append(trigger)
      interactive.append(panel)
    } else {
      container.frame = triggerFrame
      trigger.frame = CGRect(origin: .zero, size: triggerFrame.size)
      container.contentView.addSubview(trigger)
      interactive.append(trigger)
    }

    return container
  }

  private func makePanel(
    _ control: NativeGlassControlPayload,
    items: [NativeGlassControlMenuItem],
    frame: CGRect
  ) -> UIVisualEffectView {
    let panel = UIVisualEffectView(effect: UIGlassEffect(style: .regular))
    panel.frame = frame
    panel.layer.cornerRadius = CGFloat(control.cornerRadius)
    panel.layer.cornerCurve = .continuous
    panel.clipsToBounds = true

    let rowWidth = max(0, frame.width - glassControlPanelPadding * 2)
    for (index, item) in items.enumerated() {
      let row = GlassControlButton(glassBacked: false, showsTitle: true)
      row.cornerRadius = max(0, CGFloat(control.cornerRadius) - glassControlPanelPadding)
      row.frame = CGRect(
        x: glassControlPanelPadding,
        y: glassControlPanelPadding + glassControlRowHeight * CGFloat(index),
        width: rowWidth,
        height: glassControlRowHeight
      )
      row.accessibilityLabel = item.label
      row.configure(
        icon: item.icon,
        title: item.label,
        active: item.active ?? false,
        disabled: false,
        badge: item.badge ?? false
      )
      row.onActivate = { [weak self] in
        self?.onEvent?(control.id, "menu-item", item.id)
      }
      panel.contentView.addSubview(row)
    }
    return panel
  }

  private func assetsAvailable(for controls: [NativeGlassControlPayload]) -> Bool {
    for control in controls {
      if UIImage(named: control.icon) == nil {
        return false
      }
      for item in control.items ?? [] where UIImage(named: item.icon) == nil {
        return false
      }
    }
    return true
  }

  private func rect(_ frame: NativeGlassControlFrame, offset: CGPoint) -> CGRect {
    CGRect(
      x: CGFloat(frame.originX) + offset.x,
      y: CGFloat(frame.originY) + offset.y,
      width: CGFloat(frame.width),
      height: CGFloat(frame.height)
    )
  }
}

/// Host for the transparent control overlay. It is added above the WKWebView
/// child, so UIKit composites the glass over the live map canvas.
@available(iOS 26.0, *)
final class NativeGlassControlHostViewController: UIViewController {
  private let overlay = GlassControlOverlayView()
  private lazy var renderer = GlassControlRenderer(overlay: overlay)

  var onEvent: ((String, String, String?) -> Void)?

  var overlayView: UIView {
    overlay
  }

  override func loadView() {
    overlay.backgroundColor = .clear
    overlay.isOpaque = false
    view = overlay
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    renderer.onEvent = { [weak self] id, action, itemId in
      self?.onEvent?(id, action, itemId)
    }
  }

  @discardableResult
  func render(
    controls: [NativeGlassControlPayload],
    dark: Bool,
    offset: CGPoint
  ) -> Bool {
    renderer.render(controls, dark: dark, offset: offset)
  }

  func clear() {
    renderer.clear()
  }
}
#endif
