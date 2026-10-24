#if canImport(Tauri)
import UIKit
import WebKit

struct NativeSearchResult: Decodable {
  let id: String
  let label: String
  let address: String
  let disabled: Bool?
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
  let activeTab: String?
  let hasMore: Bool?
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
  let status: NativeSearchStatus?
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
    // The gap beside the capsule and the locate segment beneath refresh belong
    // to the map or the independent control host.
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
  override var intrinsicContentSize: CGSize {
    CGSize(width: UIView.noIntrinsicMetric, height: max(44, nameLabel.font.lineHeight + 20))
  }
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
  private let moreGlass = UIVisualEffectView(effect: UIGlassEffect(style: .regular))
  private let sideGlass = UIVisualEffectView(effect: {
    let effect = UIGlassEffect(style: .regular)
    effect.isInteractive = true
    return effect
  }())
  private let browseHandle = SearchActionButton(type: .system)
  private let clearSelection = SearchActionButton(type: .system)
  private let expandedMore = SearchActionButton(type: .system)
  private let footer = UIStackView()
  private let stack = UIStackView()
  private let contentSurface = UIView()
  private let readingViewport = UIScrollView()
  private let readingStack = UIStackView()
  private let searchTabs = UISegmentedControl(items: ["事务所", "地点"])
  private let loadMoreResults = UIButton(type: .system)
  private var contentBottom: NSLayoutConstraint?
  private var readingContentHeight: NSLayoutConstraint?
  private let handle = UIButton(type: .system)
  private let field = UISearchTextField()
  private let search = SearchSummaryButton(frame: .zero)
  private let more = SearchActionButton(type: .system)
  private let refresh = SearchActionButton(type: .system)
  private let actions = UIStackView()
  private weak var inputRow: UIStackView?
  private var filterBadges: [UIView] = []
  private var inlineSubmit = false
  private var inlineSubmitWidth: NSLayoutConstraint?
  private let notice = SearchStatusView(compact: true)
  private let placeholder = SearchStatusView(compact: false)
  private var minimumResultsHeight: NSLayoutConstraint?
  private var noticeHeight: NSLayoutConstraint?
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
  private var collapsedHeight: CGFloat = 44
  private var browseGlyph: UIImage?
  private var settling = false
  private var settleAnimator: UIViewPropertyAnimator?
  private var browsingBottom: CGFloat?
  private var browsingBounds = CGRect.zero

  override func loadView() {
    overlay.backgroundColor = .clear
    overlay.isOpaque = false
    view = overlay
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    glass.layer.cornerRadius = 28
    glass.layer.cornerCurve = .circular
    glass.clipsToBounds = true
    glass.accessibilityIdentifier = "ims-native-exchange-search"
    overlay.addSubview(glass)
    for surface in [sideGlass, moreGlass] {
      surface.clipsToBounds = true
      surface.layer.cornerCurve = .circular
      overlay.addSubview(surface)
    }
    sideGlass.accessibilityIdentifier = "ims-native-exchange-side-controls"
    overlay.surfaces = [glass, moreGlass, sideGlass]
    moreGlass.accessibilityIdentifier = "ims-native-exchange-more-surface"
    stack.axis = .vertical
    stack.spacing = 4
    stack.isLayoutMarginsRelativeArrangement = true
    stack.translatesAutoresizingMaskIntoConstraints = false
    contentSurface.translatesAutoresizingMaskIntoConstraints = false
    glass.contentView.addSubview(contentSurface)
    contentSurface.addSubview(stack)
    contentBottom = stack.bottomAnchor.constraint(equalTo: contentSurface.bottomAnchor)
    // Visibility/trait changes can precede the manually fitted glass frame.
    // The next layout fits that frame without breaking essential row heights.
    contentBottom?.priority = UILayoutPriority(999)
    contentBottom?.isActive = true
    NSLayoutConstraint.activate([
      contentSurface.leadingAnchor.constraint(equalTo: glass.contentView.leadingAnchor),
      contentSurface.trailingAnchor.constraint(equalTo: glass.contentView.trailingAnchor),
      contentSurface.topAnchor.constraint(equalTo: glass.contentView.topAnchor),
      contentSurface.bottomAnchor.constraint(equalTo: glass.contentView.bottomAnchor),
      stack.leadingAnchor.constraint(equalTo: contentSurface.leadingAnchor, constant: 12),
      stack.trailingAnchor.constraint(equalTo: contentSurface.trailingAnchor, constant: -12),
      stack.topAnchor.constraint(equalTo: contentSurface.topAnchor)
    ])
    let grabber = UIView()
    handle.accessibilityIdentifier = "ims-native-exchange-search-handle"
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
    handle.addAction(UIAction { [weak self] _ in self?.setDetent(self?.detent == "collapsed" ? "large" : "collapsed") }, for: .touchUpInside)
    handle.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(pan(_:))))
    stack.addArrangedSubview(handle)
    let row = UIStackView(arrangedSubviews: [browseHandle, search, field, clearSelection])
    row.spacing = 4
    row.alignment = .center
    row.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    field.delegate = self
    field.returnKeyType = .search
    field.accessibilityIdentifier = "ims-native-exchange-search-input"
    field.addTarget(self, action: #selector(inputChanged), for: .editingChanged)
    search.contentHorizontalAlignment = .leading
    browseGlyph = systemGlyph("magnifyingglass")
    browseHandle.setImage(browseGlyph, for: .normal)
    search.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    fixedRowWidth(browseHandle)
    browseHandle.heightAnchor.constraint(equalToConstant: 44).isActive = true
    browseHandle.accessibilityIdentifier = "ims-native-exchange-search-drag"
    browseHandle.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(pan(_:))))
    browseHandle.addAction(UIAction { [weak self] _ in self?.beginEditing() }, for: .touchUpInside)
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
    more.accessibilityIdentifier = "ims-native-exchange-more"
    more.setImage(UIImage(systemName: "ellipsis"), for: .normal)
    more.tintColor = .secondaryLabel
    moreGlass.contentView.addSubview(more)
    sideGlass.contentView.addSubview(refresh)
    refresh.accessibilityIdentifier = "ims-native-exchange-refresh"
    refresh.addAction(UIAction { [weak self] _ in self?.tool("refresh") }, for: .touchUpInside)
    more.showsMenuAsPrimaryAction = true
    stack.addArrangedSubview(row)
    inputRow = row
    stack.setCustomSpacing(ExchangeSearchLayout.inputToSubmitSpacing, after: row)
    actions.spacing = 8
    actions.distribution = .fillEqually
    stack.addArrangedSubview(actions)
    // Retain the header/input/action objects across detents.
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
    footer.spacing = 8
    footer.distribution = .fillEqually
    for key in ["submit", "cancel", "detent", "collapse"] {
      let control = button("") { [weak self] in
        guard let self else { return }
        switch key {
        case "submit": self.submit()
        case "cancel": self.cancel()
        case "collapse": self.cancel()
        case "detent": self.setDetent("large")
        default: self.tool(key)
        }
      }
      actionButtons[key] = control
      control.accessibilityIdentifier = "ims-native-exchange-\(key)"
      switch key {
      case "submit": actions.addArrangedSubview(control)
      case "cancel":
        fixedRowWidth(control)
        control.configuration?.image = UIImage(systemName: "xmark")
        control.configuration?.title = nil
        row.addArrangedSubview(control)
      case "detent", "collapse": footer.addArrangedSubview(control)
      default: break
      }
    }
    if var configuration = actionButtons["submit"]?.configuration {
      configuration.cornerStyle = .capsule
      configuration.background.backgroundColor = view.tintColor
      actionButtons["submit"]?.configuration = configuration
    }
    inlineSubmitWidth = actionButtons["submit"]?.widthAnchor.constraint(equalToConstant: 44)
    inlineSubmitWidth?.priority = UILayoutPriority(999)
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
    for control in [more, expandedMore] {
      let badge = UIView()
      badge.isUserInteractionEnabled = false
      badge.isAccessibilityElement = false
      badge.layer.cornerRadius = 3
      badge.translatesAutoresizingMaskIntoConstraints = false
      control.addSubview(badge)
      NSLayoutConstraint.activate([
        badge.widthAnchor.constraint(equalToConstant: 6),
        badge.heightAnchor.constraint(equalToConstant: 6),
        badge.trailingAnchor.constraint(equalTo: control.trailingAnchor, constant: -7),
        badge.topAnchor.constraint(equalTo: control.topAnchor, constant: 7)
      ])
      filterBadges.append(badge)
    }
    noticeHeight = notice.heightAnchor.constraint(equalToConstant: 64)
    noticeHeight?.priority = UILayoutPriority(999)
    noticeHeight?.isActive = true
    searchTabs.accessibilityIdentifier = "ims-native-exchange-search-tabs"
    searchTabs.addAction(UIAction { [weak self] _ in
      guard let self else { return }
      self.emit("tab", value: self.searchTabs.selectedSegmentIndex == 0 ? "offices" : "places")
    }, for: .valueChanged)
    readingStack.addArrangedSubview(searchTabs)
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
    results.backgroundView = placeholder
    results.rowHeight = UITableView.automaticDimension
    results.estimatedRowHeight = 84
    results.separatorInset = UIEdgeInsets(top: 0, left: 49, bottom: 0, right: 0)
    results.keyboardDismissMode = .onDrag
    results.accessibilityIdentifier = "ims-native-exchange-search-results"
    minimumResultsHeight = results.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
    minimumResultsHeight?.priority = UILayoutPriority(999)
    minimumResultsHeight?.isActive = true
    readingStack.addArrangedSubview(results)
    loadMoreResults.addAction(UIAction { [weak self] _ in self?.emit("loadMore") }, for: .touchUpInside)
    loadMoreResults.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    readingStack.addArrangedSubview(loadMoreResults)
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
    notice.refitFonts()
    placeholder.refitFonts()
    refitReadingFonts()
    let buttons = Array(actionButtons.values) + [expandedMore]
    for control in buttons {
      let font = UIFont.preferredFont(
        forTextStyle: .subheadline,
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
      if control !== expandedMore {
        control.updateConfiguration()
        control.titleLabel?.font = font
      }
      control.subtitleLabel?.font = .preferredFont(forTextStyle: .subheadline, compatibleWith: traitCollection)
      control.subtitleLabel?.invalidateIntrinsicContentSize()
      control.titleLabel?.invalidateIntrinsicContentSize()
      control.invalidateIntrinsicContentSize()
      control.setNeedsLayout()
      control.layoutIfNeeded()
    }
    search.invalidateIntrinsicContentSize()
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
    if newSession || (settling && args.editing && !lastCommandedEditing) { interruptSettle() }
    snapshot = args
    overrideUserInterfaceStyle = args.dark ? .dark : .light
    view.tintColor = args.tint?.uiColor ?? imsTabBarSelectedColor
    if newSession || args.detent != lastCommandedDetent {
      detent = args.detent == "collapsed" ? "collapsed" : "large"
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
    searchTabs.selectedSegmentIndex = args.activeTab == "places" ? 1 : 0
    searchTabs.setTitle(label("officeTab"), forSegmentAt: 0)
    searchTabs.setTitle(label("placeTab"), forSegmentAt: 1)
    loadMoreResults.setTitle(label("loadMore"), for: .normal)
    loadMoreResults.isEnabled = !args.busy
    let selected = !args.selected.isEmpty
    let selectedTitle = args.selectedLabel ?? args.selected
    let selectedDetail = args.selectedAddress ?? ""
    search.nameLabel.text = selected ? selectedTitle : label("search")
    search.nameLabel.textColor = selected ? .label : .secondaryLabel
    search.addressLabel.text = selectedDetail
    // Full selected metadata remains available in the expanded reading surface
    // and accessibility label; the browsing pill keeps one readable line.
    search.addressLabel.isHidden = true
    search.nameLabel.numberOfLines = 1
    search.nameLabel.lineBreakMode = .byTruncatingTail
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
    for control in [more, expandedMore] {
      control.accessibilityValue = args.filterApplied ? label("filterApplied") : nil
    }
    for badge in filterBadges {
      badge.isHidden = !args.filterApplied
      badge.backgroundColor = view.tintColor
    }
    expandedMore.configuration?.title = label("more")
    expandedMore.setNeedsUpdateConfiguration()
    expandedMore.titleLabel?.invalidateIntrinsicContentSize()
    expandedMore.invalidateIntrinsicContentSize()
    expandedMore.setNeedsLayout()
    refresh.accessibilityLabel = label("refresh")
    updateRefresh(animated: !newSession && lastRefreshing != (args.refreshing == true))
    updateButtons()
    notice.update(args.status)
    placeholder.update(args.status)
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
    if UIAccessibility.isReduceMotionEnabled, let animator = settleAnimator {
      animator.stopAnimation(false)
      animator.finishAnimation(at: .end)
    }
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
      control.configuration?.title = key == "submit" && inlineSubmit ? nil : label(key == "detent" ? (detent == "large" ? "shrink" : "expand") : key)
    }
    guard let submit = actionButtons["submit"] else { return }
    submit.configuration?.baseForegroundColor = .white
    submit.configuration?.background.backgroundColor = view.tintColor
    submit.configuration?.showsActivityIndicator = snapshot?.busy == true && !UIAccessibility.isReduceMotionEnabled
    submit.isEnabled = snapshot?.busy == false && (field.text?.trimmingCharacters(in: .whitespacesAndNewlines).count ?? 0) >= 2
    submit.accessibilityLabel = label("submit")
    let signature = [String(snapshot?.pointCount ?? 0), String(snapshot?.hasAttribution == true), String(snapshot?.selected.isEmpty == false), String(snapshot?.filterApplied == true)] + ["filter", "offices", "cards", "range", "account", "retry", "source", "clear"].map { label($0) }
    guard signature != menuSignature else { return }
    menuSignature = signature
    let tools = [("filter", "line.3.horizontal.decrease"), ("offices", "building.2"), ("cards", "person.crop.rectangle")].map { key, symbol in
      UIAction(title: label(key), image: UIImage(systemName: symbol), state: key == "filter" && snapshot?.filterApplied == true ? .on : .off) { [weak self] _ in self?.tool(key) }
    }
    var menu: [UIMenuElement] = [UIMenu(options: .displayInline, children: tools)]
    for key in ["account"] + (label("retry").isEmpty ? [] : ["retry"]) + (snapshot?.hasAttribution == true ? ["source"] : []) {
      menu.append(UIAction(title: label(key)) { [weak self] _ in self?.tool(key) })
    }
    if snapshot?.selected.isEmpty == false {
      menu.append(UIAction(title: label("clear")) { [weak self] _ in self?.emit("clear") })
    }
    menu.append(UIAction(title: label("range") + ": \(snapshot?.pointCount ?? 0)", attributes: .disabled) { _ in })
    more.menu = UIMenu(children: menu)
    expandedMore.menu = more.menu
  }

  private func updateVisibility() {
    let collapsed = detent == "collapsed"
    stack.directionalLayoutMargins = .zero
    contentBottom?.constant = collapsed ? 0 : -12
    readingContentHeight?.isActive = !collapsed
    readingViewport.isHidden = collapsed
    searchTabs.isHidden = collapsed || snapshot?.activeTab == nil
    loadMoreResults.isHidden = collapsed || snapshot?.hasMore != true
    // Input and submit stay fixed. Only the reading viewport/result table scroll.
    search.isHidden = !collapsed
    browseHandle.isHidden = !collapsed
    clearSelection.isHidden = !collapsed || snapshot?.selected.isEmpty != false
    more.isHidden = !collapsed
    moreGlass.isHidden = !collapsed
    actionButtons["cancel"]?.isHidden = collapsed
    field.isHidden = collapsed
    actions.isHidden = collapsed || inlineSubmit
    footer.isHidden = collapsed
    footer.axis = traitCollection.preferredContentSizeCategory.isAccessibilityCategory ? .vertical : .horizontal
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
    let hasResults = snapshot?.results.isEmpty == false
    let hasStatus = snapshot?.status != nil
    notice.isHidden = collapsed || !hasResults || !hasStatus
    placeholder.isHidden = collapsed || hasResults || !hasStatus
    notice.setActive(!notice.isHidden)
    placeholder.setActive(!placeholder.isHidden)
    results.isScrollEnabled = hasResults
    handle.isHidden = collapsed
    handle.accessibilityLabel = label(collapsed ? "expand" : "collapse")
    let detentActions = ["collapsed", "large"].map { value in
      UIAccessibilityCustomAction(name: label(value == "collapsed" ? "collapse" : value == "large" ? "expand" : "shrink")) { [weak self] _ in
        self?.setDetent(value)
        return self != nil
      }
    }
    handle.accessibilityCustomActions = detentActions
    browseHandle.accessibilityCustomActions = detentActions
    sideGlass.isHidden = !collapsed || settling
    refresh.isHidden = !collapsed || settling
  }

  override func accessibilityPerformEscape() -> Bool {
    guard snapshot != nil else { return false }
    cancel()
    return true
  }

  private func beginEditing() {
    setDetent("large")
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
      notice.setActive(false)
      placeholder.setActive(false)
      for surface in [glass, sideGlass, moreGlass] { surface.isHidden = true }
      onSideLayout?(nil)
    }
    emit("tool", value: key)
  }

  @objc private func inputChanged() {
    guard field.markedTextRange == nil else { return }
    if let text = field.text, text.count > 120 { field.text = String(text.prefix(120)) }
    emit("input", value: field.text ?? "")
    actionButtons["submit"]?.isEnabled = (field.text?.trimmingCharacters(in: .whitespacesAndNewlines).count ?? 0) >= 2 && snapshot?.busy == false
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
    emit("cancel")
    setDetent("collapsed")
  }

  private func restoreFocus(_ target: UIView) {
    glass.layoutIfNeeded()
    UIAccessibility.post(notification: .layoutChanged, argument: target)
  }

  private func setDetent(_ value: String) {
    if value == "collapsed", detent != "collapsed" {
      settleCollapsed()
      return
    }
    view.layoutIfNeeded()
    interruptSettle()
    detent = value == "collapsed" ? value : "large"
    dragHeight = nil
    if value == "collapsed" { field.resignFirstResponder() }
    updateVisibility()
    actionButtons["detent"]?.configuration?.title = label(value == "large" ? "shrink" : "expand")
    view.setNeedsLayout()
    UIView.animate(withDuration: UIAccessibility.isReduceMotionEnabled ? 0 : 0.28, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
      self.view.layoutIfNeeded()
    }
    emit("detent", value: detent)
  }

  private func interruptSettle() {
    settleAnimator?.stopAnimation(true)
    settleAnimator = nil
    settling = false
    contentSurface.alpha = 1
    contentSurface.isUserInteractionEnabled = true
    contentSurface.accessibilityElementsHidden = false
  }

  private func settleCollapsed() {
    guard !settling else { return }
    field.resignFirstResponder()
    view.layoutIfNeeded()
    settling = true
    dragHeight = nil
    contentSurface.isUserInteractionEnabled = false
    contentSurface.accessibilityElementsHidden = true
    sideGlass.isHidden = true
    refresh.isHidden = true
    onSideLayout?(nil)
    // A zero-duration property animator uses UIKit's default duration rather
    // than completing immediately. Reduced Motion must bypass it entirely.
    if UIAccessibility.isReduceMotionEnabled {
      UIView.performWithoutAnimation {
        self.finishSettle(at: .end)
      }
      return
    }
    let animator = UIViewPropertyAnimator(duration: 0.28, curve: .easeInOut) { [weak self] in
      guard let self else { return }
      self.contentSurface.alpha = 0
      self.view.setNeedsLayout()
      self.view.layoutIfNeeded()
    }
    settleAnimator = animator
    animator.addCompletion { [weak self] position in
      self?.finishSettle(at: position)
    }
    animator.startAnimation()
  }

  private func finishSettle(at position: UIViewAnimatingPosition) {
    guard settling, position == .end else { return }
    settleAnimator = nil
    settling = false
    detent = "collapsed"
    contentSurface.alpha = 1
    contentSurface.isUserInteractionEnabled = true
    contentSurface.accessibilityElementsHidden = false
    updateVisibility()
    view.setNeedsLayout()
    view.layoutIfNeeded()
    emit("detent", value: "collapsed")
    restoreFocus(search)
  }

  @objc private func pan(_ gesture: UIPanGestureRecognizer) {
    switch gesture.state {
    case .began:
      interruptSettle()
      dragStart = detent == "collapsed" ? collapsedHeight : glass.frame.height
    case .changed:
      dragHeight = max(min(availableHeight, collapsedHeight), dragStart - gesture.translation(in: view).y)
      if dragHeight! > collapsedHeight + 24 { detent = "large" }
      updateVisibility()
      view.setNeedsLayout()
      view.layoutIfNeeded()
    case .ended, .cancelled:
      let dismiss = gesture.state == .ended && gesture.translation(in: view).y > 12
      lastGeometryTime = 0
      if dismiss { cancel() } else { setDetent("large") }
    default: break
    }
  }

  private func placeSubmitInline(_ compact: Bool) {
    guard inlineSubmit != compact, let row = inputRow, let submit = actionButtons["submit"], let cancel = actionButtons["cancel"] else { return }
    inlineSubmit = compact
    inlineSubmitWidth?.isActive = compact
    // Relink the trailing controls together. Inserting before the retained
    // cancel can leave UIKit's previous field→cancel spacing constraint active.
    row.removeArrangedSubview(cancel)
    cancel.removeFromSuperview()
    if compact {
      actions.removeArrangedSubview(submit)
      submit.removeFromSuperview()
      row.addArrangedSubview(submit)
    } else {
      row.removeArrangedSubview(submit)
      submit.removeFromSuperview()
      actions.addArrangedSubview(submit)
    }
    row.addArrangedSubview(cancel)
    submit.configuration?.title = compact ? nil : label("submit")
    submit.configuration?.image = compact ? UIImage(systemName: "magnifyingglass") : nil
    submit.invalidateIntrinsicContentSize()
    actions.isHidden = detent == "collapsed" || compact
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    guard let args = snapshot, let webview else { return }
    let inset = webview.scrollView.adjustedContentInset
    let cssHost = CGRect(x: args.host.x + Double(inset.left), y: args.host.y + Double(inset.top), width: args.host.width, height: args.host.height)
    let host = webview.convert(cssHost, to: view)
    let collapsed = detent == "collapsed" || settling
    let keyboardTop = view.keyboardLayoutGuide.layoutFrame.minY
    let domNavigation = args.navigationFrame.flatMap { frame -> CGRect? in
      let css = CGRect(x: frame.x, y: frame.y, width: frame.width, height: frame.height)
      guard ExchangeSearchLayout.validDOMNavigation(css, viewport: webview.bounds) else { return nil }
      return webview.convert(css.offsetBy(dx: inset.left, dy: inset.top), to: view)
    }
    var bottom = ExchangeSearchLayout.collapsedBottom(host: host, viewport: view.bounds, collapsed: collapsed, portrait: view.bounds.height > view.bounds.width, clearance: CGFloat(args.bottomClearance), keyboardTop: keyboardTop, navigation: navigationDockingFrame?() ?? domNavigation)
    if settling, browsingBounds == view.bounds, let browsingBottom { bottom = min(host.maxY, browsingBottom) }
    if detent == "collapsed" && !settling {
      browsingBottom = bottom
      browsingBounds = view.bounds
    }
    let safeTop = max(host.minY, view.safeAreaLayoutGuide.layoutFrame.minY)
    let short = host.height <= 500 && host.width >= 640
    let sideHeight: CGFloat = hasLocate ? 96 : 48
    // Portrait reserves the entire refresh/locate group. Landscape docks it
    // beside the bottom union, so the reading surface keeps its safe height.
    let topClearance: CGFloat = collapsed ? (short ? 8 : sideHeight + 12) : 0
    let available = ExchangeSearchLayout.expandedHeight(bottom: bottom - topClearance, safeTop: safeTop)
    availableHeight = available
    handle.isHidden = collapsed || available < 280
    let fallbackNavigation = ExchangeSearchLayout.navigationRange(bounds: view.bounds, leftMargin: view.layoutMargins.left, rightMargin: view.layoutMargins.right, safeLeft: view.safeAreaInsets.left, safeRight: view.safeAreaInsets.right)
    let horizontal = ExchangeSearchLayout.horizontalFrame(host: host, collapsed: collapsed, portrait: view.bounds.height > view.bounds.width, navigation: navigationRange?() ?? domNavigation ?? fallbackNavigation)
    let width = horizontal.width
    // A short keyboard viewport uses the same retained submit button beside
    // the field, keeping essential input controls above the reading scroller.
    placeSubmitInline(!collapsed && available < 260)
    let readingWidth = max(44, width - 24)
    noticeHeight?.constant = notice.fittedHeight(width: readingWidth)
    minimumResultsHeight?.constant = placeholder.isHidden ? 44 : placeholder.fittedHeight(width: readingWidth)
    let capsuleHeight = max(ExchangeSearchLayout.collapsedPillHeight, search.intrinsicContentSize.height)
    if collapsed {
      collapsedHeight = capsuleHeight
    }
    let minimumExpanded = minimumExpandedHeight(width: width)
    let medium = min(available, max(minimumExpanded, available * 0.5))
    let large = available
    actionButtons["detent"]?.isHidden = true
    let proposedHeight = dragHeight ?? (collapsed ? collapsedHeight : detent == "large" ? large : medium)
    let height = min(available, collapsed ? proposedHeight : max(minimumExpanded, proposedHeight))
    let x = horizontal.minX
    let union = CGRect(x: x, y: bottom - height, width: width, height: height)
    if collapsed {
      glass.frame = CGRect(x: x, y: union.minY, width: width - 56, height: height)
      moreGlass.frame = CGRect(x: union.maxX - 44, y: union.midY - 22, width: 44, height: 44)
      moreGlass.layer.cornerRadius = 22
      more.frame = moreGlass.bounds
      glass.layer.cornerRadius = min(34, height / 2)
    } else {
      glass.frame = union
    }
    // Reparenting the retained submit invalidates the row after this controller's
    // layout pass began. Resolve its new bounds in the fitted surface now.
    glass.setNeedsLayout()
    glass.layoutIfNeeded()
    let sideX = short ? host.maxX - 8 - 48 : union.maxX - 48
    let sideY = short ? max(safeTop + 8, bottom - sideHeight) : union.minY - 12 - sideHeight
    sideGlass.frame = CGRect(x: sideX, y: sideY, width: 48, height: sideHeight)
    sideGlass.layer.cornerRadius = 24
    refresh.frame = CGRect(x: 0, y: 0, width: 48, height: 48)
    sideGlass.isHidden = !collapsed || settling
    refresh.isHidden = !collapsed || settling
    let nextLocate = hasLocate && collapsed && !settling ? CGRect(x: sideX, y: sideY + 48, width: 48, height: 48) : nil
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
    cell.isUserInteractionEnabled = result.disabled != true
    cell.selectionStyle = result.disabled == true ? .none : .default
    if result.disabled == true { cell.accessibilityTraits.insert(.notEnabled) }
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
    guard result.disabled != true else { return }
    field.resignFirstResponder()
    emit("select", value: result.id)
    setDetent("collapsed")
  }

  private func emit(_ action: String, value: String? = nil, frame: [String: CGFloat]? = nil) {
    guard let args = snapshot else { return }
    var detail: [String: Any] = ["id": args.id, "generation": args.generation, "revision": args.revision, "action": action]
    if let value { detail["value"] = value }
    if let frame { detail["frame"] = frame }
    onEvent?(detail)
  }

  func clear() {
    interruptSettle()
    notice.setActive(false)
    placeholder.setActive(false)
    view.endEditing(true)
    snapshot = nil
    onEvent = nil
    onSideLayout?(nil)
    onSideLayout = nil
    for surface in [glass, sideGlass, moreGlass] { surface.removeFromSuperview() }
    overlay.surfaces = []
  }
}
#endif
