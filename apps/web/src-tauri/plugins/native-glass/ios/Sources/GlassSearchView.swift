#if canImport(Tauri)
import UIKit
import WebKit

struct NativeSearchResult: Decodable {
  let id: String
  let label: String
  let address: String
}

struct NativeSearchFrame: Decodable {
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

struct NativeSearchArgs: Decodable {
  let id: String
  let generation: UInt64
  let revision: UInt64
  let host: NativeSearchFrame
  let navigationFrame: NativeSearchFrame?
  let bottomClearance: Double
  let dark: Bool
  let tint: NativeColor?
  let refreshing: Bool?
  let returnFocusMore: Bool?
  let detent: String
  let editing: Bool
  let query: String
  let busy: Bool
  let message: String
  let attribution: String
  let selected: String
  let selectedLabel: String?
  let selectedAddress: String?
  let filterApplied: Bool
  let pointCount: Int
  let hasAttribution: Bool
  let results: [NativeSearchResult]
  let labels: [String: String]
}

struct NativeRemoveSearchArgs: Decodable {
  let id: String
  let generation: UInt64
}

private final class SearchOverlayView: UIView {
  var surfaces: [UIView] = []
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    // The bottom union is camera occlusion, not an interactive rectangle.
    // In particular, the gap between capsule/tools and the locate segment
    // beneath refresh belong to the map or the independent control host.
    guard surfaces.contains(where: { surface in
      glassSurfaceContains(point, from: self, in: surface)
    }) else { return nil }
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }
}

/// UIKit owns highlight state; only the local press transform is customized.
private class SearchActionButton: UIButton {
  var pressContent: [UIView] { [imageView, titleLabel].compactMap { $0 } }
  override var isHighlighted: Bool {
    didSet { updatePress() }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    NotificationCenter.default.addObserver(self, selector: #selector(updatePress), name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  @objc private func updatePress() {
    let content = pressContent
    guard !UIAccessibility.isReduceMotionEnabled else {
      for view in content {
        view.layer.removeAllAnimations()
        view.transform = .identity
      }
      return
    }
    let scale: CGFloat = isHighlighted ? 0.94 : 1
    UIView.animate(withDuration: isHighlighted ? 0.1 : 0.2, delay: 0, options: [.allowUserInteraction, .beginFromCurrentState]) {
      for view in content { view.transform = CGAffineTransform(scaleX: scale, y: scale) }
    }
  }
}

/// The outer glass owns rounding. Text has a rectangular, fitted reading area
/// and one persistent action/accessibility target, without a UIButton capsule mask.
private final class SearchSummaryButton: SearchActionButton {
  let nameLabel = UILabel()
  let addressLabel = UILabel()
  private let textStack = UIStackView()
  override var pressContent: [UIView] { [textStack] }

  override init(frame: CGRect) {
    super.init(frame: frame)
    textStack.axis = .vertical
    textStack.spacing = 4
    textStack.isUserInteractionEnabled = false
    textStack.translatesAutoresizingMaskIntoConstraints = false
    for label in [nameLabel, addressLabel] {
      label.numberOfLines = 0
      label.lineBreakMode = .byWordWrapping
      label.adjustsFontForContentSizeCategory = true
      label.isAccessibilityElement = false
      label.setContentCompressionResistancePriority(.required, for: .vertical)
      textStack.addArrangedSubview(label)
    }
    nameLabel.font = .preferredFont(forTextStyle: .body)
    addressLabel.font = .preferredFont(forTextStyle: .subheadline)
    addressLabel.textColor = .secondaryLabel
    addSubview(textStack)
    NSLayoutConstraint.activate([
      textStack.leadingAnchor.constraint(equalTo: leadingAnchor),
      textStack.trailingAnchor.constraint(equalTo: trailingAnchor),
      textStack.topAnchor.constraint(equalTo: topAnchor, constant: 10),
      textStack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10)
    ])
    isAccessibilityElement = true
    accessibilityTraits = .button
    accessibilityIdentifier = "ims-native-exchange-selected-summary"
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  override var intrinsicContentSize: CGSize { CGSize(width: UIView.noIntrinsicMetric, height: 48) }
}

@available(iOS 26.0, *)
final class NativeGlassSearchHost: UIViewController, UITextFieldDelegate, UITableViewDataSource, UITableViewDelegate {
  var onEvent: (([String: Any]) -> Void)?
  var onSideLayout: ((CGRect?) -> Void)?
  var navigationRange: (() -> CGRect?)?
  var navigationDockingFrame: (() -> CGRect?)?
  var hasLocate = false {
    didSet { if hasLocate != oldValue { view.setNeedsLayout() } }
  }
  private(set) var locateFrame: CGRect?
  weak var webview: WKWebView?
  private(set) var snapshot: NativeSearchArgs?
  private let overlay = SearchOverlayView()
  private let glass = UIVisualEffectView(effect: {
    let effect = UIGlassEffect(style: .regular)
    effect.isInteractive = true
    return effect
  }())
  private let toolGlass = UIVisualEffectView(effect: {
    let effect = UIGlassEffect(style: .regular)
    effect.isInteractive = true
    return effect
  }())
  private let sideGlass = UIVisualEffectView(effect: {
    let effect = UIGlassEffect(style: .regular)
    effect.isInteractive = true
    return effect
  }())
  private let toolViewport = UIScrollView()
  private let browseHandle = SearchActionButton(type: .system)
  private let clearSelection = SearchActionButton(type: .system)
  private let expandedMore = SearchActionButton(type: .system)
  private let footer = UIStackView()
  private let stack = UIStackView()
  private let contentViewport = UIScrollView()
  private let readingViewport = UIScrollView()
  private let readingStack = UIStackView()
  private var expandedContentHeight: NSLayoutConstraint?
  private var readingContentHeight: NSLayoutConstraint?
  private let handle = UIButton(type: .system)
  private let field = UISearchTextField()
  private let search = SearchSummaryButton(frame: .zero)
  private let more = SearchActionButton(type: .system)
  private let refresh = SearchActionButton(type: .system)
  private let actions = UIStackView()
  private weak var inputRow: UIStackView?
  private let tools = UIStackView()
  private let notice = UILabel()
  private let readingHeader = UIStackView()
  private let readingTitle = UILabel()
  private let readingSubtitle = UILabel()
  private let selectedHeader = UIStackView()
  private let selectedName = UILabel()
  private let selectedAddress = UILabel()
  private var actionButtons: [String: UIButton] = [:]
  private var lastRefreshing = false
  private var lastReducedMotion: Bool?
  private var menuSignature: [String] = []
  private let results = UITableView(frame: .zero, style: .plain)
  private var detent = "collapsed"
  private var lastCommandedDetent = "collapsed"
  private var dragStart: CGFloat = 0
  private var dragHeight: CGFloat?
  private var lastCommandedEditing = false
  private var lastGeometry = CGRect.zero
  private var lastGeometryTime: CFTimeInterval = 0
  private var availableHeight: CGFloat = 600
  private var collapsedHeight: CGFloat = 164
  private var browseGlyph: UIImage?

  override func loadView() {
    overlay.backgroundColor = .clear
    overlay.isOpaque = false
    view = overlay
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    glass.layer.cornerRadius = 28
    glass.clipsToBounds = true
    glass.accessibilityIdentifier = "ims-native-exchange-search"
    overlay.addSubview(glass)
    for surface in [toolGlass, sideGlass] {
      surface.clipsToBounds = true
      surface.layer.cornerCurve = .circular
      overlay.addSubview(surface)
    }
    toolGlass.accessibilityIdentifier = "ims-native-exchange-tools"
    sideGlass.accessibilityIdentifier = "ims-native-exchange-side-controls"
    overlay.surfaces = [glass, toolGlass, refresh]
    stack.axis = .vertical
    stack.spacing = 4
    stack.isLayoutMarginsRelativeArrangement = true
    stack.translatesAutoresizingMaskIntoConstraints = false
    contentViewport.translatesAutoresizingMaskIntoConstraints = false
    contentViewport.contentInsetAdjustmentBehavior = .never
    glass.contentView.addSubview(contentViewport)
    contentViewport.addSubview(stack)
    expandedContentHeight = stack.heightAnchor.constraint(equalTo: contentViewport.frameLayoutGuide.heightAnchor, constant: -12)
    expandedContentHeight?.priority = .defaultHigh
    NSLayoutConstraint.activate([
      contentViewport.leadingAnchor.constraint(equalTo: glass.contentView.leadingAnchor),
      contentViewport.trailingAnchor.constraint(equalTo: glass.contentView.trailingAnchor),
      contentViewport.topAnchor.constraint(equalTo: glass.contentView.topAnchor),
      contentViewport.bottomAnchor.constraint(equalTo: glass.contentView.bottomAnchor),
      stack.widthAnchor.constraint(equalTo: contentViewport.frameLayoutGuide.widthAnchor, constant: -24),
      stack.leadingAnchor.constraint(equalTo: contentViewport.contentLayoutGuide.leadingAnchor, constant: 12),
      stack.trailingAnchor.constraint(equalTo: contentViewport.contentLayoutGuide.trailingAnchor, constant: -12),
      stack.topAnchor.constraint(equalTo: contentViewport.contentLayoutGuide.topAnchor),
      stack.bottomAnchor.constraint(equalTo: contentViewport.contentLayoutGuide.bottomAnchor, constant: -12)
    ])
    let grabber = UIView()
    grabber.backgroundColor = .tertiaryLabel
    grabber.layer.cornerRadius = 2.5
    grabber.isUserInteractionEnabled = false
    grabber.translatesAutoresizingMaskIntoConstraints = false
    handle.addSubview(grabber)
    NSLayoutConstraint.activate([
      grabber.widthAnchor.constraint(equalToConstant: 32),
      grabber.heightAnchor.constraint(equalToConstant: 5),
      grabber.centerXAnchor.constraint(equalTo: handle.centerXAnchor),
      grabber.centerYAnchor.constraint(equalTo: handle.centerYAnchor)
    ])
    let handleHeight = handle.heightAnchor.constraint(equalToConstant: 44)
    handleHeight.priority = UILayoutPriority(999)
    handleHeight.isActive = true
    handle.addAction(UIAction { [weak self] _ in self?.setDetent(self?.detent == "collapsed" ? "medium" : "collapsed") }, for: .touchUpInside)
    handle.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(pan(_:))))
    stack.addArrangedSubview(handle)
    let row = UIStackView(arrangedSubviews: [browseHandle, search, field, clearSelection, more])
    row.spacing = 4
    row.alignment = .center
    row.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
    field.delegate = self
    field.returnKeyType = .search
    field.accessibilityIdentifier = "ims-native-exchange-search-input"
    field.addTarget(self, action: #selector(inputChanged), for: .editingChanged)
    search.contentHorizontalAlignment = .leading
    browseGlyph = systemGlyph("magnifyingglass")
    browseHandle.setImage(browseGlyph, for: .normal)
    search.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
    fixedRowWidth(browseHandle)
    browseHandle.heightAnchor.constraint(equalToConstant: 48).isActive = true
    browseHandle.accessibilityIdentifier = "ims-native-exchange-search-drag"
    browseHandle.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(pan(_:))))
    browseHandle.addAction(UIAction { [weak self] _ in self?.setDetent("medium") }, for: .touchUpInside)
    fixedRowWidth(clearSelection)
    clearSelection.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    clearSelection.setImage(UIImage(systemName: "xmark"), for: .normal)
    clearSelection.addAction(UIAction { [weak self] _ in self?.emit("clear") }, for: .touchUpInside)
    field.backgroundColor = .systemGray6
    field.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
    field.setContentHuggingPriority(.defaultLow, for: .horizontal)
    search.setContentHuggingPriority(.defaultLow, for: .horizontal)
    search.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    field.layer.cornerRadius = 24
    field.clipsToBounds = true
    field.font = .preferredFont(forTextStyle: .body)
    field.adjustsFontForContentSizeCategory = true
    search.titleLabel?.adjustsFontForContentSizeCategory = true
    search.titleLabel?.numberOfLines = 0
    search.addAction(UIAction { [weak self] _ in self?.beginEditing() }, for: .touchUpInside)
    fixedRowWidth(more)
    more.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    more.setImage(UIImage(systemName: "ellipsis"), for: .normal)
    more.tintColor = .secondaryLabel
    sideGlass.contentView.addSubview(refresh)
    refresh.accessibilityIdentifier = "ims-native-exchange-refresh"
    refresh.addAction(UIAction { [weak self] _ in self?.tool("refresh") }, for: .touchUpInside)
    more.showsMenuAsPrimaryAction = true
    stack.addArrangedSubview(row)
    inputRow = row
    stack.setCustomSpacing(ExchangeSearchLayout.inputToSubmitSpacing, after: row)
    actions.spacing = 8
    actions.distribution = .fillEqually
    tools.spacing = 8
    tools.distribution = .fillEqually
    stack.addArrangedSubview(actions)
    // The existing header/input/action objects stay in place at every detent.
    // Only reading content and secondary actions scroll beneath these rows.
    readingViewport.translatesAutoresizingMaskIntoConstraints = false
    readingViewport.contentInsetAdjustmentBehavior = .never
    readingViewport.accessibilityIdentifier = "ims-native-exchange-reading-viewport"
    readingStack.axis = .vertical
    readingStack.spacing = 4
    readingStack.translatesAutoresizingMaskIntoConstraints = false
    stack.addArrangedSubview(readingViewport)
    readingViewport.addSubview(readingStack)
    readingContentHeight = readingStack.heightAnchor.constraint(equalTo: readingViewport.frameLayoutGuide.heightAnchor)
    readingContentHeight?.priority = .defaultLow
    let minimumReadingHeight = readingViewport.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
    minimumReadingHeight.priority = UILayoutPriority(999)
    NSLayoutConstraint.activate([
      minimumReadingHeight,
      readingStack.widthAnchor.constraint(equalTo: readingViewport.frameLayoutGuide.widthAnchor),
      readingStack.leadingAnchor.constraint(equalTo: readingViewport.contentLayoutGuide.leadingAnchor),
      readingStack.trailingAnchor.constraint(equalTo: readingViewport.contentLayoutGuide.trailingAnchor),
      readingStack.topAnchor.constraint(equalTo: readingViewport.contentLayoutGuide.topAnchor),
      readingStack.bottomAnchor.constraint(equalTo: readingViewport.contentLayoutGuide.bottomAnchor)
    ])
    toolViewport.contentInsetAdjustmentBehavior = .never
    toolViewport.translatesAutoresizingMaskIntoConstraints = false
    tools.translatesAutoresizingMaskIntoConstraints = false
    toolGlass.contentView.addSubview(toolViewport)
    toolViewport.addSubview(tools)
    NSLayoutConstraint.activate([
      toolViewport.leadingAnchor.constraint(equalTo: toolGlass.contentView.leadingAnchor),
      toolViewport.trailingAnchor.constraint(equalTo: toolGlass.contentView.trailingAnchor),
      toolViewport.topAnchor.constraint(equalTo: toolGlass.contentView.topAnchor),
      toolViewport.bottomAnchor.constraint(equalTo: toolGlass.contentView.bottomAnchor),
      tools.widthAnchor.constraint(equalTo: toolViewport.frameLayoutGuide.widthAnchor, constant: -16),
      tools.leadingAnchor.constraint(equalTo: toolViewport.contentLayoutGuide.leadingAnchor, constant: 8),
      tools.trailingAnchor.constraint(equalTo: toolViewport.contentLayoutGuide.trailingAnchor, constant: -8),
      tools.topAnchor.constraint(equalTo: toolViewport.contentLayoutGuide.topAnchor),
      tools.bottomAnchor.constraint(equalTo: toolViewport.contentLayoutGuide.bottomAnchor)
    ])
    footer.spacing = 8
    footer.distribution = .fillEqually
    for key in ["submit", "cancel", "detent", "collapse", "filter", "offices", "cards"] {
      let control = button("") { [weak self] in
        guard let self else { return }
        switch key {
        case "submit": self.submit()
        case "cancel": self.cancel()
        case "collapse": self.cancel()
        case "detent": self.setDetent(self.detent == "large" ? "medium" : "large")
        default: self.tool(key)
        }
      }
      actionButtons[key] = control
      control.accessibilityIdentifier = "ims-native-exchange-\(key)"
      if let icon = ["filter": "list-filter", "offices": "building-2", "cards": "credit-card"][key] {
        control.configuration?.image = toolImage(icon)
        control.configuration?.imagePadding = 6
        control.configuration?.imageColorTransformer = UIConfigurationColorTransformer { _ in .secondaryLabel }
      }
      switch key {
      case "submit": actions.addArrangedSubview(control)
      case "cancel":
        fixedRowWidth(control)
        control.configuration?.image = UIImage(systemName: "xmark")
        control.configuration?.title = nil
        row.addArrangedSubview(control)
      case "detent", "collapse": footer.addArrangedSubview(control)
      default: tools.addArrangedSubview(control)
      }
    }
    if var configuration = actionButtons["submit"]?.configuration {
      configuration.cornerStyle = .capsule
      configuration.background.backgroundColor = view.tintColor
      actionButtons["submit"]?.configuration = configuration
    }
    expandedMore.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    expandedMore.accessibilityIdentifier = "ims-native-exchange-more-expanded"
    var moreStyle = UIButton.Configuration.plain()
    moreStyle.cornerStyle = .capsule
    moreStyle.baseForegroundColor = .label
    moreStyle.background.backgroundColor = .systemGray6
    moreStyle.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 4, bottom: 8, trailing: 4)
    moreStyle.titleLineBreakMode = .byWordWrapping
    moreStyle.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
      var outgoing = incoming
      outgoing.font = UIFont.preferredFont(forTextStyle: .subheadline)
      return outgoing
    }
    expandedMore.configuration = moreStyle
    expandedMore.titleLabel?.adjustsFontForContentSizeCategory = true
    expandedMore.titleLabel?.numberOfLines = 0
    expandedMore.showsMenuAsPrimaryAction = true
    footer.insertArrangedSubview(expandedMore, at: 1)
    notice.numberOfLines = 0
    notice.font = .preferredFont(forTextStyle: .footnote)
    notice.adjustsFontForContentSizeCategory = true
    readingStack.addArrangedSubview(notice)
    selectedHeader.axis = .vertical
    selectedHeader.spacing = 4
    for label in [selectedName, selectedAddress] {
      label.numberOfLines = 0
      label.lineBreakMode = .byWordWrapping
      label.adjustsFontForContentSizeCategory = true
      selectedHeader.addArrangedSubview(label)
    }
    selectedName.accessibilityTraits = .header
    selectedAddress.textColor = .secondaryLabel
    selectedHeader.accessibilityIdentifier = "ims-native-exchange-selected-reading"
    readingStack.addArrangedSubview(selectedHeader)
    readingHeader.axis = .vertical
    readingHeader.spacing = 4
    readingHeader.isLayoutMarginsRelativeArrangement = true
    readingHeader.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 8, leading: 4, bottom: 8, trailing: 4)
    for heading in [readingTitle, readingSubtitle] {
      heading.numberOfLines = 0
      heading.adjustsFontForContentSizeCategory = true
      readingHeader.addArrangedSubview(heading)
    }
    readingTitle.accessibilityTraits = .header
    readingSubtitle.textColor = .secondaryLabel
    refitReadingFonts()
    readingStack.addArrangedSubview(readingHeader)
    results.dataSource = self
    results.delegate = self
    results.backgroundColor = .systemBackground
    results.rowHeight = UITableView.automaticDimension
    results.estimatedRowHeight = 84
    results.separatorInset = UIEdgeInsets(top: 0, left: 49, bottom: 0, right: 0)
    results.keyboardDismissMode = .onDrag
    results.accessibilityIdentifier = "ims-native-exchange-search-results"
    let minimumResultsHeight = results.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
    minimumResultsHeight.priority = UILayoutPriority(999)
    minimumResultsHeight.isActive = true
    readingStack.addArrangedSubview(results)
    readingStack.addArrangedSubview(footer)
    for content in (stack.arrangedSubviews + readingStack.arrangedSubviews) where content !== results && content !== readingViewport {
      content.setContentCompressionResistancePriority(.required, for: .vertical)
    }
    NotificationCenter.default.addObserver(self, selector: #selector(motionChanged), name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
    view.keyboardLayoutGuide.followsUndockedKeyboard = true
    registerForTraitChanges([UITraitPreferredContentSizeCategory.self]) {
      (host: NativeGlassSearchHost, _: UITraitCollection) in
      // Descendant labels/configurations receive the trait after the host.
      DispatchQueue.main.async { [weak host] in host?.refitContentSize() }
    }
  }

  private func label(_ key: String) -> String { snapshot?.labels[key] ?? "" }

  private func fixedRowWidth(_ control: UIView) {
    let width = control.widthAnchor.constraint(equalToConstant: 44)
    width.priority = UILayoutPriority(999)
    width.isActive = true
  }

  private func scaledFont(_ size: CGFloat, weight: UIFont.Weight, style: UIFont.TextStyle) -> UIFont {
    UIFontMetrics(forTextStyle: style).scaledFont(for: .systemFont(ofSize: size, weight: weight), compatibleWith: traitCollection)
  }

  private func refitReadingFonts() {
    readingTitle.font = scaledFont(23, weight: .semibold, style: .title2)
    readingSubtitle.font = scaledFont(14, weight: .regular, style: .subheadline)
    for label in [search.nameLabel, selectedName] {
      label.font = .preferredFont(forTextStyle: .body, compatibleWith: traitCollection)
    }
    for label in [search.addressLabel, selectedAddress] {
      label.font = .preferredFont(forTextStyle: .subheadline, compatibleWith: traitCollection)
    }
  }

  private func minimumExpandedHeight(width: CGFloat) -> CGFloat {
    guard detent != "collapsed", let inputRow else { return 260 }
    func fittedHeight(_ content: UIView) -> CGFloat {
      content.systemLayoutSizeFitting(
        CGSize(width: max(44, width - 24), height: UIView.layoutFittingCompressedSize.height),
        withHorizontalFittingPriority: .required,
        verticalFittingPriority: .fittingSizeLevel
      ).height
    }
    // Essential rows remain outside reading scroll. Reserve its 44pt viewport
    // after fitting the retained controls at their current semantic font sizes.
    return ExchangeSearchLayout.expandedMinimumHeight(handle: handle.isHidden ? 0 : fittedHeight(handle), input: fittedHeight(inputRow), submit: fittedHeight(actions))
  }

  private func toolImage(_ name: String, side: CGFloat = 18) -> UIImage? {
    guard let source = UIImage(named: name) else { return nil }
    let size = CGSize(width: side, height: side)
    return UIGraphicsImageRenderer(size: size).image { _ in
      source.draw(in: CGRect(origin: .zero, size: size))
    }.withRenderingMode(.alwaysTemplate)
  }

  private func systemGlyph(_ name: String) -> UIImage? {
    guard let symbol = UIImage(systemName: name, withConfiguration: UIImage.SymbolConfiguration(pointSize: 21, weight: .regular)) else { return nil }
    // Render the glyph at point size so UIButton does not enlarge its ink.
    let side: CGFloat = 21
    let scale = side / max(symbol.size.width, symbol.size.height)
    let size = CGSize(width: symbol.size.width * scale, height: symbol.size.height * scale)
    return UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { _ in
      symbol.draw(in: CGRect(x: (side - size.width) / 2, y: (side - size.height) / 2, width: size.width, height: size.height))
    }.withRenderingMode(.alwaysTemplate)
  }

  private func refitContentSize() {
    guard snapshot != nil else { return }
    // Refresh the existing controls rather than rendering a snapshot: rendering
    // can change focus intent and must not replace a live composition or draft.
    field.font = .preferredFont(forTextStyle: .body, compatibleWith: traitCollection)
    notice.font = .preferredFont(forTextStyle: .footnote, compatibleWith: traitCollection)
    refitReadingFonts()
    let buttons = (actions.arrangedSubviews + footer.arrangedSubviews + tools.arrangedSubviews).compactMap { $0 as? UIButton }
    for control in buttons {
      let isTool = tools.arrangedSubviews.contains(control)
      let font = isTool ? scaledFont(16, weight: .medium, style: .subheadline) : UIFont.preferredFont(
        forTextStyle: control === search ? .body : .subheadline,
        compatibleWith: traitCollection
      )
      var configuration = control.configuration
      configuration?.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
        var outgoing = incoming
        outgoing.font = font
        return outgoing
      }
      control.configuration = configuration
      control.setNeedsUpdateConfiguration()
      // More's title and font share one configuration-owned layout. UIKit
      // applies its requested update during layout with the new traits.
      if !isTool && control !== expandedMore {
        control.updateConfiguration()
        control.titleLabel?.font = font
      }
      control.subtitleLabel?.font = .preferredFont(forTextStyle: .subheadline, compatibleWith: traitCollection)
      control.subtitleLabel?.invalidateIntrinsicContentSize()
      control.titleLabel?.invalidateIntrinsicContentSize()
      // Configured tool text has one font owner. Invalidate its fitting metrics
      // before the containing stack lays out at the new trait and axis.
      control.invalidateIntrinsicContentSize()
      control.setNeedsLayout()
      if !isTool { control.layoutIfNeeded() }
    }
    tools.invalidateIntrinsicContentSize()
    tools.setNeedsLayout()
    toolGlass.setNeedsLayout()
    field.invalidateIntrinsicContentSize()
    stack.arrangedSubviews.forEach { $0.invalidateIntrinsicContentSize() }
    readingStack.arrangedSubviews.forEach { $0.invalidateIntrinsicContentSize() }
    results.reloadData()
    stack.setNeedsLayout()
    glass.setNeedsLayout()
    lastGeometryTime = 0
    view.setNeedsLayout()
  }

  func render(_ args: NativeSearchArgs) {
    loadViewIfNeeded()
    let newSession = snapshot?.generation != args.generation
    snapshot = args
    overrideUserInterfaceStyle = args.dark ? .dark : .light
    view.tintColor = args.tint?.uiColor ?? imsTabBarSelectedColor
    if newSession || args.detent != lastCommandedDetent {
      detent = args.detent
      dragHeight = nil
    }
    lastCommandedDetent = args.detent
    // The text field keeps its identity. Web snapshots must not interrupt IME
    // composition or replace a user's newer unsubmitted text.
    if field.markedTextRange == nil && !field.isFirstResponder { field.text = args.query }
    field.placeholder = label("placeholder")
    readingTitle.text = label("resultsHeading")
    readingSubtitle.text = label("resultsSubtitle")
    field.accessibilityLabel = label("input")
    let selected = !args.selected.isEmpty
    let selectedTitle = args.selectedLabel ?? args.selected
    let selectedDetail = args.selectedAddress ?? ""
    search.nameLabel.text = selected ? selectedTitle : label("search")
    search.nameLabel.textColor = selected ? .label : .secondaryLabel
    search.addressLabel.text = selectedDetail
    search.addressLabel.isHidden = !selected || selectedDetail.isEmpty
    search.accessibilityLabel = selected ? [selectedTitle, selectedDetail].filter { !$0.isEmpty }.joined(separator: ", ") : label("search")
    selectedName.text = selectedTitle
    selectedAddress.text = selectedDetail
    selectedAddress.isHidden = selectedDetail.isEmpty
    browseHandle.tintColor = selected ? view.tintColor : .secondaryLabel
    browseHandle.setImage(selected ? systemGlyph("mappin") : browseGlyph, for: .normal)
    browseHandle.accessibilityLabel = label("expand")
    clearSelection.accessibilityLabel = label("clear")
    more.accessibilityLabel = label("more")
    expandedMore.accessibilityLabel = label("more")
    expandedMore.configuration?.title = label("more")
    expandedMore.setNeedsUpdateConfiguration()
    expandedMore.titleLabel?.invalidateIntrinsicContentSize()
    expandedMore.invalidateIntrinsicContentSize()
    expandedMore.setNeedsLayout()
    refresh.accessibilityLabel = label("refresh")
    updateRefresh(animated: !newSession && lastRefreshing != (args.refreshing == true))
    updateButtons()
    notice.text = args.message
    results.reloadData()
    updateVisibility()
    // A snapshot that repeats the prior command must not undo a newer local
    // focus change while its input/cancel event is still crossing the bridge.
    if newSession || args.editing != lastCommandedEditing {
      if args.editing { field.becomeFirstResponder() }
      else { field.resignFirstResponder() }
    }
    lastCommandedEditing = args.editing
    view.setNeedsLayout()
    view.layoutIfNeeded()
    if newSession { restoreFocus(args.returnFocusMore == true ? more : detent == "collapsed" ? search : field) }
  }

  @objc private func motionChanged() {
    refresh.layer.removeAllAnimations()
    updateRefresh(animated: false)
    actionButtons["submit"]?.configuration?.showsActivityIndicator = snapshot?.busy == true && !UIAccessibility.isReduceMotionEnabled
  }

  private func updateRefresh(animated: Bool) {
    let busy = snapshot?.refreshing == true
    refresh.isEnabled = !busy
    refresh.accessibilityValue = busy ? label("refreshing") : nil
    let reducedMotion = UIAccessibility.isReduceMotionEnabled
    guard refresh.configuration == nil || busy != lastRefreshing || reducedMotion != lastReducedMotion || refresh.configuration?.baseForegroundColor != view.tintColor else { return }
    lastRefreshing = busy
    lastReducedMotion = reducedMotion
    var configuration = UIButton.Configuration.plain()
    configuration.baseForegroundColor = view.tintColor
    configuration.image = toolImage(busy && UIAccessibility.isReduceMotionEnabled ? "loader-circle" : "refresh-cw", side: 22)
    configuration.showsActivityIndicator = busy && !UIAccessibility.isReduceMotionEnabled
    configuration.contentInsets = .zero
    if animated && !UIAccessibility.isReduceMotionEnabled {
      UIView.transition(with: refresh, duration: 0.14, options: [.transitionCrossDissolve, .allowUserInteraction, .beginFromCurrentState]) {
        self.refresh.configuration = configuration
      }
    } else {
      refresh.configuration = configuration
    }
  }

  private func button(_ title: String, action: @escaping () -> Void) -> UIButton {
    let control = SearchActionButton(type: .system)
    var configuration = UIButton.Configuration.plain()
    configuration.title = title
    configuration.baseForegroundColor = .label
    configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
      var outgoing = incoming
      outgoing.font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(for: .systemFont(ofSize: 16, weight: .medium))
      return outgoing
    }
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 4, bottom: 8, trailing: 4)
    configuration.titleLineBreakMode = .byWordWrapping
    control.configuration = configuration
    control.titleLabel?.adjustsFontForContentSizeCategory = true
    control.titleLabel?.numberOfLines = 0
    control.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    control.addAction(UIAction { _ in action() }, for: .touchUpInside)
    return control
  }

  private func updateButtons() {
    for (key, control) in actionButtons {
      if key == "cancel" { control.accessibilityLabel = label("cancel"); continue }
      control.configuration?.title = label(key == "detent" ? (detent == "large" ? "shrink" : "expand") : key) + (key == "filter" && snapshot?.filterApplied == true ? " ·" : "")
    }
    guard let submit = actionButtons["submit"] else { return }
    submit.configuration?.baseForegroundColor = .white
    submit.configuration?.background.backgroundColor = view.tintColor
    submit.configuration?.showsActivityIndicator = snapshot?.busy == true && !UIAccessibility.isReduceMotionEnabled
    submit.isEnabled = snapshot?.busy == false && (field.text?.trimmingCharacters(in: .whitespacesAndNewlines).count ?? 0) >= 2
    let signature = [String(snapshot?.pointCount ?? 0), String(snapshot?.hasAttribution == true), String(snapshot?.selected.isEmpty == false)] + ["range", "account", "retry", "source", "clear"].map { label($0) }
    guard signature != menuSignature else { return }
    menuSignature = signature
    var menu = [UIAction(title: label("range") + ": \(snapshot?.pointCount ?? 0)", attributes: .disabled) { _ in }]
    for key in ["account"] + (label("retry").isEmpty ? [] : ["retry"]) + (snapshot?.hasAttribution == true ? ["source"] : []) {
      menu.append(UIAction(title: label(key)) { [weak self] _ in self?.tool(key) })
    }
    if snapshot?.selected.isEmpty == false {
      menu.append(UIAction(title: label("clear")) { [weak self] _ in self?.emit("clear") })
    }
    more.menu = UIMenu(children: menu)
    expandedMore.menu = more.menu
  }

  private func updateVisibility() {
    let collapsed = detent == "collapsed"
    stack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: collapsed ? 8 : 0, leading: 0, bottom: 0, trailing: 0)
    expandedContentHeight?.isActive = !collapsed
    readingContentHeight?.isActive = !collapsed
    readingViewport.isHidden = collapsed
    // Normally only the result table scrolls. At extreme text sizes the outer
    // viewport also exposes any header/essential controls exceeding the host.
    contentViewport.isScrollEnabled = true
    search.isHidden = !collapsed
    browseHandle.isHidden = !collapsed
    clearSelection.isHidden = !collapsed || snapshot?.selected.isEmpty != false
    more.isHidden = !collapsed
    actionButtons["cancel"]?.isHidden = collapsed
    field.isHidden = collapsed
    actions.isHidden = collapsed
    footer.isHidden = collapsed
    footer.axis = traitCollection.preferredContentSizeCategory.isAccessibilityCategory ? .vertical : .horizontal
    toolGlass.isHidden = !collapsed
    results.isHidden = collapsed
    selectedHeader.isHidden = collapsed || snapshot?.selected.isEmpty != false
    readingHeader.isHidden = collapsed || snapshot?.results.isEmpty != false
    if collapsed {
      if glass.effect == nil {
        let effect = UIGlassEffect(style: .regular)
        effect.isInteractive = true
        glass.effect = effect
      }
      glass.contentView.backgroundColor = .clear
    } else {
      glass.effect = nil
      glass.contentView.backgroundColor = .systemBackground
    }
    glass.layer.cornerRadius = collapsed ? 34 : 31
    notice.isHidden = collapsed || snapshot?.message.isEmpty != false
    handle.isHidden = collapsed
    handle.accessibilityLabel = label(collapsed ? "expand" : "collapse")
    let detentActions = ["collapsed", "medium", "large"].map { value in
      UIAccessibilityCustomAction(name: label(value == "collapsed" ? "collapse" : value == "large" ? "expand" : "shrink")) { [weak self] _ in
        self?.setDetent(value)
        return self != nil
      }
    }
    handle.accessibilityCustomActions = detentActions
    browseHandle.accessibilityCustomActions = detentActions
    sideGlass.isHidden = false
  }

  override func accessibilityPerformEscape() -> Bool {
    guard snapshot != nil else { return false }
    cancel()
    return true
  }

  private func beginEditing() {
    setDetent("medium")
    field.becomeFirstResponder()
    emit("input", value: field.text ?? "")
  }

  private func tool(_ key: String) {
    if key == "refresh" {
      guard snapshot?.refreshing != true, refresh.isEnabled else { return }
      // Block a second native activation while the request event crosses IPC.
      // Only the next request snapshot determines the loading presentation.
      refresh.isEnabled = false
    }
    field.resignFirstResponder()
    if ["filter", "offices", "cards", "source", "account"].contains(key) {
      for surface in [glass, toolGlass, sideGlass] { surface.isHidden = true }
      onSideLayout?(nil)
    }
    emit("tool", value: key)
  }

  @objc private func inputChanged() {
    guard field.markedTextRange == nil else { return }
    if let text = field.text, text.count > 120 { field.text = String(text.prefix(120)) }
    emit("input", value: field.text ?? "")
    (actions.arrangedSubviews.first as? UIButton)?.isEnabled = (field.text?.trimmingCharacters(in: .whitespacesAndNewlines).count ?? 0) >= 2 && snapshot?.busy == false
  }

  func textFieldShouldReturn(_ textField: UITextField) -> Bool { submit(); return false }

  private func submit() {
    guard field.markedTextRange == nil, snapshot?.busy == false,
      (field.text?.trimmingCharacters(in: .whitespacesAndNewlines).count ?? 0) >= 2 else { return }
    field.resignFirstResponder()
    emit("submit", value: field.text ?? "")
  }

  private func cancel() {
    field.resignFirstResponder()
    setDetent("collapsed")
    emit("cancel")
    restoreFocus(search)
  }

  private func restoreFocus(_ target: UIView) {
    glass.layoutIfNeeded()
    contentViewport.scrollRectToVisible(target.convert(target.bounds, to: contentViewport), animated: false)
    UIAccessibility.post(notification: .layoutChanged, argument: target)
  }

  private func setDetent(_ value: String) {
    detent = value
    dragHeight = nil
    if value == "collapsed" { field.resignFirstResponder() }
    updateVisibility()
    actionButtons["detent"]?.configuration?.title = label(value == "large" ? "shrink" : "expand")
    view.setNeedsLayout()
    view.layoutIfNeeded()
    emit("detent", value: value)
  }

  @objc private func pan(_ gesture: UIPanGestureRecognizer) {
    switch gesture.state {
    case .began: dragStart = detent == "collapsed" ? collapsedHeight : glass.frame.height
    case .changed:
      dragHeight = max(min(availableHeight, collapsedHeight), dragStart - gesture.translation(in: view).y)
      if dragHeight! > collapsedHeight + 24 { detent = "medium" }
      updateVisibility()
      view.setNeedsLayout()
      view.layoutIfNeeded()
    case .ended, .cancelled:
      let height = dragHeight ?? dragStart
      let available = availableHeight
      let collapsed = min(available, collapsedHeight)
      let medium = min(available, max(minimumExpandedHeight(width: glass.bounds.width), available * 0.5))
      let large = min(available, max(medium, available * 0.85))
      let choices: [(String, CGFloat)] = [("collapsed", collapsed), ("medium", medium), ("large", large)]
      let nearest = choices.min { abs($0.1 - height) < abs($1.1 - height) }?.0 ?? "collapsed"
      lastGeometryTime = 0
      setDetent(nearest)
    default: break
    }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    guard let args = snapshot, let webview else { return }
    let inset = webview.scrollView.adjustedContentInset
    let cssHost = CGRect(x: args.host.x + Double(inset.left), y: args.host.y + Double(inset.top), width: args.host.width, height: args.host.height)
    let host = webview.convert(cssHost, to: view)
    let collapsed = detent == "collapsed"
    let keyboardTop = view.keyboardLayoutGuide.layoutFrame.minY
    let domNavigation = args.navigationFrame.flatMap { frame -> CGRect? in
      let css = CGRect(x: frame.x, y: frame.y, width: frame.width, height: frame.height)
      guard ExchangeSearchLayout.validDOMNavigation(css, viewport: webview.bounds) else { return nil }
      return webview.convert(css.offsetBy(dx: inset.left, dy: inset.top), to: view)
    }
    let bottom = ExchangeSearchLayout.collapsedBottom(host: host, viewport: view.bounds, collapsed: collapsed, portrait: view.bounds.height > view.bounds.width, clearance: CGFloat(args.bottomClearance), keyboardTop: keyboardTop, navigation: navigationDockingFrame?() ?? domNavigation)
    let safeTop = max(host.minY, view.safeAreaLayoutGuide.layoutFrame.minY)
    let short = host.height <= 500 && host.width >= 640
    let sideHeight: CGFloat = hasLocate ? 96 : 48
    // Portrait reserves the entire refresh/locate group. Landscape docks it
    // beside the bottom union, so the reading surface keeps its safe height.
    let topClearance: CGFloat = short ? 8 : sideHeight + 12
    let available = max(0, bottom - safeTop - topClearance)
    availableHeight = available
    handle.isHidden = collapsed || available < 280
    let fallbackNavigation = ExchangeSearchLayout.navigationRange(bounds: view.bounds, leftMargin: view.layoutMargins.left, rightMargin: view.layoutMargins.right, safeLeft: view.safeAreaInsets.left, safeRight: view.safeAreaInsets.right)
    let horizontal = ExchangeSearchLayout.horizontalFrame(host: host, collapsed: collapsed, portrait: view.bounds.height > view.bounds.width, navigation: navigationRange?() ?? domNavigation ?? fallbackNavigation)
    let width = horizontal.width
    glass.bounds.size.width = width
    toolGlass.bounds.size.width = width
    glass.layoutIfNeeded()
    toolGlass.layoutIfNeeded()
    // Fit the existing buttons at actual point sizes before measuring height.
    let toolWidth = (width - 16 - 16) / 3
    let toolButtons = tools.arrangedSubviews.compactMap { $0 as? UIButton }
    let vertical = traitCollection.preferredContentSizeCategory.isAccessibilityCategory || toolButtons.contains { control in
      let titleWidth = ((control.configuration?.title ?? "") as NSString).size(withAttributes: [.font: scaledFont(16, weight: .medium, style: .subheadline)]).width
      return titleWidth + 18 + 6 + 8 > toolWidth
    }
    for control in toolButtons {
      guard var configuration = control.configuration else { continue }
      let placement: NSDirectionalRectEdge = .leading
      if configuration.imagePlacement != placement {
        configuration.imagePlacement = placement
        control.configuration = configuration
        control.invalidateIntrinsicContentSize()
      }
    }
    let axis: NSLayoutConstraint.Axis = vertical ? .vertical : .horizontal
    if tools.axis != axis { tools.axis = axis }
    let spacing: CGFloat = vertical ? 0 : 8
    if tools.spacing != spacing { tools.spacing = spacing }
    // Apply pending configuration updates within the retained tool hierarchy
    // after choosing its axis, before asking it for the new fitting height.
    toolGlass.layoutIfNeeded()
    let fittedTools = tools.systemLayoutSizeFitting(
      CGSize(width: width - 16, height: UIView.layoutFittingCompressedSize.height),
      withHorizontalFittingPriority: .required,
      verticalFittingPriority: .fittingSizeLevel
    ).height
    var capsuleHeight: CGFloat = 68
    if collapsed {
      capsuleHeight = max(snapshot?.selected.isEmpty == false ? 74 : 68, stack.systemLayoutSizeFitting(
        CGSize(width: width - 24, height: UIView.layoutFittingCompressedSize.height),
        withHorizontalFittingPriority: .required,
        verticalFittingPriority: .fittingSizeLevel
      ).height + 12)
      collapsedHeight = capsuleHeight + 12 + max(44, fittedTools)
    }
    let minimumExpanded = minimumExpandedHeight(width: width)
    let medium = min(available, max(minimumExpanded, available * 0.5))
    let large = min(available, max(medium, available * 0.85))
    actionButtons["detent"]?.isHidden = large <= medium
    let proposedHeight = dragHeight ?? (detent == "collapsed" ? collapsedHeight : detent == "large" ? large : medium)
    let height = min(available, collapsed ? proposedHeight : max(minimumExpanded, proposedHeight))
    let x = horizontal.minX
    let union = CGRect(x: x, y: bottom - height, width: width, height: height)
    if collapsed {
      // At large text sizes both surfaces scroll, retaining readable fonts and
      // all action targets within the available safe host.
      let toolHeight = min(max(44, fittedTools), max(44, height - 68 - 12))
      let fittedCapsule = max(0, height - toolHeight - 12)
      glass.frame = CGRect(x: x, y: union.minY, width: width, height: fittedCapsule)
      toolGlass.frame = CGRect(x: x, y: bottom - toolHeight, width: width, height: toolHeight)
      glass.layer.cornerRadius = min(34, fittedCapsule / 2)
      toolGlass.layer.cornerRadius = min(22, toolHeight / 2)
    } else {
      glass.frame = union
    }
    let sideX = short ? host.maxX - 8 - 48 : union.maxX - 48
    let sideY = short ? max(safeTop + 8, bottom - sideHeight) : union.minY - 12 - sideHeight
    sideGlass.frame = CGRect(x: sideX, y: sideY, width: 48, height: sideHeight)
    sideGlass.layer.cornerRadius = 24
    refresh.frame = CGRect(x: 0, y: 0, width: 48, height: 48)
    let nextLocate = hasLocate ? CGRect(x: sideX, y: sideY + 48, width: 48, height: 48) : nil
    if locateFrame != nextLocate {
      locateFrame = nextLocate
      onSideLayout?(nextLocate)
    }
    guard union != lastGeometry else { return }
    let now = CACurrentMediaTime()
    if dragHeight != nil && now - lastGeometryTime < 1.0 / 30.0 { return }
    lastGeometryTime = now
    lastGeometry = union
    let css = view.convert(union, to: webview)
    emit("geometry", frame: ["x": css.minX - inset.left, "y": css.minY - inset.top, "width": css.width, "height": css.height])
  }

  func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { snapshot?.results.count ?? 0 }
  func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let cell = UITableViewCell(style: .subtitle, reuseIdentifier: nil)
    guard let result = snapshot?.results[indexPath.row] else { return cell }
    var content = cell.defaultContentConfiguration()
    content.text = result.label
    content.secondaryText = result.address
    content.image = UIImage(systemName: "mappin", withConfiguration: UIImage.SymbolConfiguration(pointSize: 22, weight: .regular))
    content.imageProperties.tintColor = .secondaryLabel
    content.imageProperties.maximumSize = CGSize(width: 22, height: 22)
    content.textProperties.font = scaledFont(18, weight: .medium, style: .body)
    content.secondaryTextProperties.font = scaledFont(14, weight: .regular, style: .subheadline)
    content.secondaryTextProperties.color = .secondaryLabel
    content.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 16, leading: 0, bottom: 16, trailing: 0)
    content.textProperties.numberOfLines = 0
    content.secondaryTextProperties.numberOfLines = 0
    cell.contentConfiguration = content
    let direction = UIImageView(image: UIImage(systemName: "arrow.up.right", withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .regular)))
    direction.tintColor = .tertiaryLabel
    direction.isAccessibilityElement = false
    cell.accessoryView = direction
    cell.backgroundColor = .systemBackground
    cell.accessibilityIdentifier = "ims-native-search-result-\(result.id)"
    return cell
  }
  func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
    guard let result = snapshot?.results[indexPath.row] else { return }
    field.resignFirstResponder()
    emit("select", value: result.id)
    setDetent("collapsed")
    restoreFocus(search)
  }

  private func emit(_ action: String, value: String? = nil, frame: [String: CGFloat]? = nil) {
    guard let args = snapshot else { return }
    var detail: [String: Any] = ["id": args.id, "generation": args.generation, "revision": args.revision, "action": action]
    if let value { detail["value"] = value }
    if let frame { detail["frame"] = frame }
    onEvent?(detail)
  }

  func clear() {
    view.endEditing(true)
    snapshot = nil
    onEvent = nil
    onSideLayout?(nil)
    onSideLayout = nil
    for surface in [glass, toolGlass, sideGlass] { surface.removeFromSuperview() }
    overlay.surfaces = []
  }
}
#endif
