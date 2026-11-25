import UIKit

struct NativeExchangeMenuLabels: Decodable {
  let qr: String
  let nfc: String
  let group: String
  let close: String
}

@available(iOS 26.0, *)
private final class NativeExchangeMenuAction: UIButton {
  static let diameter: CGFloat = 52
  private static let captionGap: CGFloat = 6
  private let iconButton = UIButton(type: .system)
  private let caption = UILabel()
  private let symbol: UIImage?

  init(id: String, label: String, symbol: String, pointSize: CGFloat, enabled: Bool) {
    self.symbol = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: pointSize, weight: .medium))
    super.init(frame: .zero)
    accessibilityIdentifier = "ims-native-exchange-\(id)"
    accessibilityLabel = label
    isEnabled = enabled
    iconButton.isUserInteractionEnabled = false
    iconButton.isAccessibilityElement = false
    caption.isAccessibilityElement = false
    caption.text = label
    caption.textAlignment = .center
    caption.clipsToBounds = true
    addSubview(iconButton)
    addSubview(caption)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var isHighlighted: Bool {
    didSet { iconButton.isHighlighted = isHighlighted }
  }

  func measure(font: UIFont) -> CGSize {
    caption.font = font
    let textWidth = caption.intrinsicContentSize.width
    return CGSize(width: max(Self.diameter, ceil(textWidth) + 14),
      height: Self.diameter + Self.captionGap + ceil(font.lineHeight) + 6)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let diameter = Self.diameter
    iconButton.frame = CGRect(x: (bounds.width - diameter) / 2, y: 0, width: diameter, height: diameter)
    let width = ceil(caption.intrinsicContentSize.width) + 14
    let top = diameter + Self.captionGap
    caption.frame = CGRect(x: (bounds.width - width) / 2, y: top, width: width, height: bounds.height - top)
    caption.layer.cornerRadius = caption.bounds.height / 2
  }

  func applyAppearance(accent: UIColor, reduceTransparency: Bool) {
    var configuration: UIButton.Configuration = isEnabled
      ? (reduceTransparency ? .filled() : .glass()) : .plain()
    configuration.cornerStyle = .capsule
    configuration.baseBackgroundColor = .secondarySystemBackground
    configuration.contentInsets = .zero
    let ink: UIColor = isEnabled ? accent : .secondaryLabel
    configuration.image = symbol?.withTintColor(ink, renderingMode: .alwaysOriginal)
    iconButton.configuration = configuration
    iconButton.backgroundColor = isEnabled ? .clear : .secondarySystemBackground
    iconButton.layer.cornerRadius = Self.diameter / 2
    caption.textColor = ink
    caption.backgroundColor = isEnabled ? .systemBackground : .secondarySystemBackground
  }
}

@available(iOS 26.0, *)
final class NativeExchangeMenu: UIView {
  private let shade = UIView()
  private let dismissButton = UIControl()
  private let actions: [NativeExchangeMenuAction]
  private let offsets = [CGPoint(x: -96, y: -91), CGPoint(x: 0, y: -145), CGPoint(x: 96, y: -91)]
  private var animator: UIViewPropertyAnimator?
  private(set) var isOpen = false
  let closeLabel: String
  var onDismiss: (() -> Void)?
  var onQR: (() -> Void)?

  init(labels: NativeExchangeMenuLabels) {
    closeLabel = labels.close
    actions = [
      NativeExchangeMenuAction(id: "qr", label: labels.qr, symbol: "qrcode", pointSize: 22, enabled: true),
      NativeExchangeMenuAction(id: "nfc", label: labels.nfc, symbol: "wave.3.right", pointSize: 19, enabled: false),
      NativeExchangeMenuAction(id: "group", label: labels.group, symbol: "person.2", pointSize: 20, enabled: false),
    ]
    super.init(frame: .zero)
    isHidden = true
    accessibilityIdentifier = "ims-native-exchange-menu"
    shade.isUserInteractionEnabled = false
    addSubview(shade)
    dismissButton.isAccessibilityElement = false
    dismissButton.addAction(UIAction { [weak self] _ in
      guard let self, self.isOpen else { return }
      self.onDismiss?()
    }, for: .touchUpInside)
    addSubview(dismissButton)
    actions.forEach { addSubview($0) }
    actions[0].addAction(UIAction { [weak self] _ in
      guard let self, self.isOpen else { return }
      self.onQR?()
    }, for: .primaryActionTriggered)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func position(in bounds: CGRect, safeArea: CGRect, anchor: CGPoint) -> Bool {
    let font = UIFontMetrics(forTextStyle: .caption1).scaledFont(
      for: .systemFont(ofSize: 12, weight: .semibold), compatibleWith: traitCollection
    )
    let usable = safeArea.insetBy(dx: 8, dy: 8)
    let actionFrames = zip(actions, offsets).map { action, offset in
      let size = action.measure(font: font)
      return CGRect(x: anchor.x + offset.x - size.width / 2,
        y: anchor.y + offset.y - NativeExchangeMenuAction.diameter / 2,
        width: size.width, height: size.height)
    }
    // Keep the complete tap areas separate; use the sheet if long translations
    // or Large Text leave insufficient room for the arc.
    guard actionFrames.allSatisfy({ usable.contains($0) }),
      !actionFrames[0].insetBy(dx: -4, dy: 0).intersects(actionFrames[1]),
      !actionFrames[1].insetBy(dx: -4, dy: 0).intersects(actionFrames[2]),
      !actionFrames[0].intersects(actionFrames[2]) else { return false }
    frame = bounds
    shade.frame = self.bounds
    dismissButton.frame = self.bounds
    for (button, frame) in zip(actions, actionFrames) {
      // A transform may be in flight. Set bounds and center, not frame.
      button.bounds = CGRect(origin: .zero, size: frame.size)
      button.center = CGPoint(x: frame.midX, y: frame.midY)
      button.setNeedsLayout()
    }
    return true
  }

  func applyAppearance(dark: Bool) {
    let reduceTransparency = UIAccessibility.isReduceTransparencyEnabled
    // Mute the page and the tab capsule without blurring them out. Only the
    // buttons use Liquid Glass, so the surrounding interface stays recognizable.
    shade.backgroundColor = UIColor.systemBackground.withAlphaComponent(reduceTransparency ? 0.92 : (dark ? 0.48 : 0.54))
    let accent = dark ? UIColor(red: 1, green: 0.69, blue: 0.83, alpha: 1)
      : UIColor(red: 0.59, green: 0.06, blue: 0.30, alpha: 1)
    for action in actions {
      action.applyAppearance(accent: accent, reduceTransparency: reduceTransparency)
    }
  }

  func setOpen(_ open: Bool, animated: Bool, completion: (() -> Void)? = nil) {
    animator?.stopAnimation(true)
    animator = nil
    let wasHidden = isHidden
    isOpen = open
    accessibilityElementsHidden = !open
    if open { isHidden = false }
    if open && wasHidden { applyPresentation(false) }
    let finish = { [weak self] in
      self?.isHidden = !open
      self?.animator = nil
      completion?()
    }
    guard animated, !UIAccessibility.isReduceMotionEnabled else {
      UIView.performWithoutAnimation { applyPresentation(open) }
      finish()
      return
    }
    let animation = UIViewPropertyAnimator(duration: open ? 0.32 : 0.22, dampingRatio: open ? 0.82 : 1)
    animation.addAnimations { [weak self] in self?.shade.alpha = open ? 1 : 0 }
    for (index, button) in actions.enumerated() {
      let offset = offsets[index]
      animation.addAnimations({
        button.transform = Self.actionTransform(open, offset: offset)
        button.alpha = open ? 1 : 0
      }, delayFactor: open ? Double(index) * 0.10 : 0)
    }
    animation.addCompletion { position in
      if position == .end { finish() }
    }
    animator = animation
    animation.startAnimation()
  }

  private func applyPresentation(_ open: Bool) {
    shade.alpha = open ? 1 : 0
    for (button, offset) in zip(actions, offsets) {
      button.transform = Self.actionTransform(open, offset: offset)
      button.alpha = open ? 1 : 0
    }
  }

  private static func actionTransform(_ open: Bool, offset: CGPoint) -> CGAffineTransform {
    guard !open else { return .identity }
    return CGAffineTransform(translationX: -offset.x * 0.38, y: -offset.y * 0.48)
      .scaledBy(x: 0.66, y: 0.66)
  }

}
