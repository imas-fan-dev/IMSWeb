import UIKit

struct NativeSearchStatus: Decodable, Equatable {
  enum Kind: String, Decodable {
    case idle, loading, empty, error, notice
  }
  let kind: Kind
  let title: String
  let description: String
}

/// A reading-area placeholder, or a compact notice above retained results.
/// The orbit only runs while the owning search presentation is visible.
final class SearchStatusView: UIView {
  private let compact: Bool
  private let content = UIStackView()
  private let copy = UIStackView()
  private let mark = UIView()
  private let glyph = UIImageView()
  private let title = UILabel()
  private let detail = UILabel()
  private let track = CAShapeLayer()
  private let orbit = CAShapeLayer()
  private var status: NativeSearchStatus?
  private var active = false
  private let animationKey = "exchange-search-orbit"
  private var markSize: CGFloat { compact ? 32 : 64 }
  private var padding: CGFloat { compact ? 12 : 16 }

  init(compact: Bool) {
    self.compact = compact
    super.init(frame: .zero)
    isAccessibilityElement = true
    accessibilityTraits = .staticText
    accessibilityIdentifier = compact ? "ims-native-exchange-search-notice" : "ims-native-exchange-search-status"
    content.axis = compact ? .horizontal : .vertical
    content.alignment = .center
    content.spacing = compact ? 12 : 16
    content.translatesAutoresizingMaskIntoConstraints = false
    copy.axis = .vertical
    copy.spacing = 6
    for label in [title, detail] {
      label.numberOfLines = 0
      label.lineBreakMode = .byWordWrapping
      label.textAlignment = .center
      label.adjustsFontForContentSizeCategory = true
      label.isAccessibilityElement = false
      label.setContentCompressionResistancePriority(.required, for: .vertical)
      copy.addArrangedSubview(label)
    }
    detail.textColor = .secondaryLabel
    glyph.contentMode = .scaleAspectFit
    glyph.isAccessibilityElement = false
    glyph.translatesAutoresizingMaskIntoConstraints = false
    mark.addSubview(glyph)
    mark.layer.addSublayer(track)
    mark.layer.addSublayer(orbit)
    for layer in [track, orbit] {
      layer.fillColor = UIColor.clear.cgColor
      layer.lineWidth = 1.5
      layer.lineCap = .round
    }
    content.addArrangedSubview(mark)
    content.addArrangedSubview(copy)
    addSubview(content)
    let center = content.centerYAnchor.constraint(equalTo: centerYAnchor)
    center.priority = .defaultHigh
    let fittingBounds = [
      content.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: padding),
      content.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -padding),
      content.widthAnchor.constraint(equalTo: widthAnchor, constant: -padding * 2),
      content.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: padding),
      content.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -padding)
    ]
    // UIStackView gives hidden arranged views zero height. Keep their retained
    // content measurable without fighting that visibility constraint.
    for constraint in fittingBounds { constraint.priority = UILayoutPriority(999) }
    NSLayoutConstraint.activate(fittingBounds + [
      content.centerXAnchor.constraint(equalTo: centerXAnchor),
      center,
      mark.widthAnchor.constraint(equalToConstant: markSize),
      mark.heightAnchor.constraint(equalToConstant: markSize),
      glyph.centerXAnchor.constraint(equalTo: mark.centerXAnchor),
      glyph.centerYAnchor.constraint(equalTo: mark.centerYAnchor),
      glyph.widthAnchor.constraint(equalToConstant: compact ? 18 : 25),
      glyph.heightAnchor.constraint(equalTo: glyph.widthAnchor)
    ])
    if !compact { copy.widthAnchor.constraint(equalTo: content.widthAnchor).isActive = true }
    refitFonts()
    NotificationCenter.default.addObserver(self, selector: #selector(motionChanged), name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  func update(_ value: NativeSearchStatus?) {
    guard value != status else { return }
    let previous = status
    status = value
    let apply = {
      self.title.text = value?.title
      self.detail.text = value?.description
      self.detail.isHidden = value?.description.isEmpty != false
      let symbol: String
      switch value?.kind {
      case .error: symbol = "exclamationmark.circle"
      case .empty, .notice: symbol = "mappin.and.ellipse"
      default: symbol = "magnifyingglass"
      }
      self.glyph.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: self.compact ? 18 : 25, weight: .regular))
      self.accessibilityLabel = [value?.title, value?.description].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ". ")
      self.updateColors()
    }
    if previous != nil, window != nil, active, !UIAccessibility.isReduceMotionEnabled {
      UIView.transition(with: glyph, duration: 0.18, options: [.transitionCrossDissolve, .allowUserInteraction, .beginFromCurrentState], animations: apply)
    } else { apply() }
    updateMotion()
    setNeedsLayout()
  }

  func setActive(_ value: Bool) {
    active = value
    updateMotion()
  }

  func refitFonts() {
    title.font = UIFontMetrics(forTextStyle: compact ? .footnote : .subheadline).scaledFont(
      for: .systemFont(ofSize: compact ? 13 : 15, weight: .semibold), compatibleWith: traitCollection)
    detail.font = .preferredFont(forTextStyle: .footnote, compatibleWith: traitCollection)
  }

  func fittedHeight(width: CGFloat) -> CGFloat {
    let textWidth = max(1, width - padding * 2 - (compact ? markSize + content.spacing : 0))
    let textHeight = copy.systemLayoutSizeFitting(
      CGSize(width: textWidth, height: UIView.layoutFittingCompressedSize.height),
      withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
    return ceil((compact ? max(markSize, textHeight) : markSize + content.spacing + textHeight) + padding * 2)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    mark.layer.cornerRadius = markSize / 2
    for layer in [track, orbit] { layer.frame = mark.bounds }
    let radius = markSize / 2 - 1
    let center = CGPoint(x: markSize / 2, y: markSize / 2)
    track.path = UIBezierPath(arcCenter: center, radius: radius, startAngle: 0, endAngle: .pi * 2, clockwise: true).cgPath
    orbit.path = UIBezierPath(arcCenter: center, radius: radius, startAngle: -.pi / 2, endAngle: 0, clockwise: true).cgPath
    CATransaction.commit()
  }

  override func tintColorDidChange() {
    super.tintColorDidChange()
    updateColors()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    updateMotion()
  }

  private func updateColors() {
    let color: UIColor = status?.kind == .error ? .systemRed : tintColor
    mark.backgroundColor = color.withAlphaComponent(0.07)
    glyph.tintColor = color
    track.strokeColor = color.withAlphaComponent(0.12).cgColor
    orbit.strokeColor = color.withAlphaComponent(0.65).cgColor
  }

  @objc private func motionChanged() {
    if UIAccessibility.isReduceMotionEnabled { glyph.layer.removeAllAnimations() }
    updateMotion()
  }

  private func updateMotion() {
    let loading = status?.kind == .loading
    track.isHidden = !loading
    orbit.isHidden = !loading
    guard loading, active, window != nil, !UIAccessibility.isReduceMotionEnabled else {
      orbit.removeAnimation(forKey: animationKey)
      return
    }
    guard orbit.animation(forKey: animationKey) == nil else { return }
    let animation = CABasicAnimation(keyPath: "transform.rotation.z")
    animation.fromValue = 0
    animation.toValue = Double.pi * 2
    animation.duration = 1.6
    animation.repeatCount = .infinity
    orbit.add(animation, forKey: animationKey)
  }
}
