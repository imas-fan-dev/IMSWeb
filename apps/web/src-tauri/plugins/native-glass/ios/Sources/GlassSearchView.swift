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
  let bottomClearance: Double
  let dark: Bool
  let detent: String
  let editing: Bool
  let query: String
  let busy: Bool
  let message: String
  let attribution: String
  let selected: String
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
  weak var panel: UIView?
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard let panel, !panel.isHidden, panel.alpha > 0, panel.frame.contains(point) else { return nil }
    return super.hitTest(point, with: event)
  }
}

@available(iOS 26.0, *)
final class NativeGlassSearchHost: UIViewController, UITextFieldDelegate, UITableViewDataSource, UITableViewDelegate {
  var onEvent: (([String: Any]) -> Void)?
  weak var webview: WKWebView?
  private(set) var snapshot: NativeSearchArgs?
  private let overlay = SearchOverlayView()
  private let glass = UIVisualEffectView(effect: UIGlassEffect(style: .regular))
  private let stack = UIStackView()
  private let handle = UIButton(type: .system)
  private let field = UISearchTextField()
  private let search = UIButton(type: .system)
  private let more = UIButton(type: .system)
  private let actions = UIStackView()
  private let tools = UIStackView()
  private let summary = UILabel()
  private let notice = UILabel()
  private let attribution = UILabel()
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
    overlay.panel = glass
    overlay.addSubview(glass)
    stack.axis = .vertical
    stack.spacing = 8
    stack.translatesAutoresizingMaskIntoConstraints = false
    glass.contentView.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: glass.contentView.leadingAnchor, constant: 12),
      stack.trailingAnchor.constraint(equalTo: glass.contentView.trailingAnchor, constant: -12),
      stack.topAnchor.constraint(equalTo: glass.contentView.topAnchor),
      stack.bottomAnchor.constraint(equalTo: glass.contentView.bottomAnchor, constant: -12)
    ])
    handle.setTitle("•••", for: .normal)
    handle.heightAnchor.constraint(equalToConstant: 44).isActive = true
    handle.addAction(UIAction { [weak self] _ in self?.setDetent(self?.detent == "collapsed" ? "medium" : "collapsed") }, for: .touchUpInside)
    handle.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(pan(_:))))
    stack.addArrangedSubview(handle)
    let row = UIStackView(arrangedSubviews: [search, field, more])
    row.spacing = 8
    row.heightAnchor.constraint(equalToConstant: 48).isActive = true
    field.delegate = self
    field.returnKeyType = .search
    field.accessibilityIdentifier = "ims-native-exchange-search-input"
    field.addTarget(self, action: #selector(inputChanged), for: .editingChanged)
    search.contentHorizontalAlignment = .leading
    search.addAction(UIAction { [weak self] _ in self?.beginEditing() }, for: .touchUpInside)
    more.widthAnchor.constraint(equalToConstant: 44).isActive = true
    more.showsMenuAsPrimaryAction = true
    stack.addArrangedSubview(row)
    actions.spacing = 8
    actions.distribution = .fillEqually
    tools.spacing = 8
    tools.distribution = .fillEqually
    stack.addArrangedSubview(actions)
    stack.addArrangedSubview(tools)
    summary.numberOfLines = 2
    summary.font = .preferredFont(forTextStyle: .body)
    summary.adjustsFontForContentSizeCategory = true
    stack.addArrangedSubview(summary)
    notice.numberOfLines = 0
    notice.font = .preferredFont(forTextStyle: .footnote)
    notice.adjustsFontForContentSizeCategory = true
    stack.addArrangedSubview(notice)
    results.dataSource = self
    results.delegate = self
    results.backgroundColor = .systemBackground
    results.rowHeight = UITableView.automaticDimension
    results.estimatedRowHeight = 72
    results.keyboardDismissMode = .onDrag
    results.accessibilityIdentifier = "ims-native-exchange-search-results"
    stack.addArrangedSubview(results)
    attribution.numberOfLines = 0
    attribution.font = .preferredFont(forTextStyle: .caption1)
    attribution.adjustsFontForContentSizeCategory = true
    stack.addArrangedSubview(attribution)
    view.keyboardLayoutGuide.followsUndockedKeyboard = true
  }

  private func label(_ key: String) -> String { snapshot?.labels[key] ?? "" }

  func render(_ args: NativeSearchArgs) {
    loadViewIfNeeded()
    let newSession = snapshot?.generation != args.generation
    snapshot = args
    overrideUserInterfaceStyle = args.dark ? .dark : .light
    if newSession || args.detent != lastCommandedDetent {
      detent = args.detent
      dragHeight = nil
    }
    lastCommandedDetent = args.detent
    // The text field keeps its identity. Web snapshots must not interrupt IME
    // composition or replace a user's newer unsubmitted text.
    if field.markedTextRange == nil && !field.isFirstResponder { field.text = args.query }
    field.placeholder = label("placeholder")
    field.accessibilityLabel = label("input")
    search.setTitle(label("search"), for: .normal)
    more.setTitle(label("more"), for: .normal)
    rebuildButtons()
    summary.text = args.selected
    notice.text = args.message
    attribution.text = args.attribution
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
    if newSession { UIAccessibility.post(notification: .layoutChanged, argument: more) }
  }

  private func button(_ title: String, action: @escaping () -> Void) -> UIButton {
    let control = UIButton(type: .system)
    var configuration = UIButton.Configuration.glass()
    configuration.title = title
    control.configuration = configuration
    control.titleLabel?.adjustsFontForContentSizeCategory = true
    control.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    control.addAction(UIAction { _ in action() }, for: .touchUpInside)
    return control
  }

  private func rebuildButtons() {
    for row in [actions, tools] {
      row.arrangedSubviews.forEach { row.removeArrangedSubview($0); $0.removeFromSuperview() }
    }
    let submit = button(label("submit")) { [weak self] in self?.submit() }
    submit.isEnabled = snapshot?.busy == false && (field.text?.trimmingCharacters(in: .whitespacesAndNewlines).count ?? 0) >= 2
    actions.addArrangedSubview(submit)
    actions.addArrangedSubview(button(label("cancel")) { [weak self] in self?.cancel() })
    actions.addArrangedSubview(button(label(detent == "large" ? "shrink" : "expand")) { [weak self] in self?.setDetent(self?.detent == "large" ? "medium" : "large") })
    for key in ["filter", "offices", "cards"] {
      tools.addArrangedSubview(button(label(key) + (key == "filter" && snapshot?.filterApplied == true ? " ·" : "")) { [weak self] in self?.tool(key) })
    }
    var menu = [UIAction(title: label("range") + ": \(snapshot?.pointCount ?? 0)", attributes: .disabled) { _ in }]
    for key in ["account", "refresh"] + (label("retry").isEmpty ? [] : ["retry"]) + (snapshot?.hasAttribution == true ? ["source"] : []) {
      menu.append(UIAction(title: label(key)) { [weak self] _ in self?.tool(key) })
    }
    if snapshot?.selected.isEmpty == false {
      menu.append(UIAction(title: label("clear")) { [weak self] _ in self?.emit("clear") })
    }
    more.menu = UIMenu(children: menu)
  }

  private func updateVisibility() {
    let collapsed = detent == "collapsed"
    search.isHidden = !collapsed
    field.isHidden = collapsed
    actions.isHidden = collapsed
    tools.isHidden = !collapsed
    results.isHidden = collapsed
    notice.isHidden = snapshot?.message.isEmpty != false
    summary.isHidden = !collapsed || snapshot?.selected.isEmpty != false
    attribution.isHidden = snapshot?.attribution.isEmpty != false
    handle.accessibilityLabel = label(collapsed ? "expand" : "collapse")
  }

  private func beginEditing() {
    setDetent("medium")
    field.becomeFirstResponder()
    emit("input", value: field.text ?? "")
  }

  private func tool(_ key: String) {
    field.resignFirstResponder()
    if ["filter", "offices", "cards", "source", "account"].contains(key) { glass.isHidden = true }
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
    UIAccessibility.post(notification: .layoutChanged, argument: search)
  }

  private func setDetent(_ value: String) {
    detent = value
    dragHeight = nil
    if value == "collapsed" { field.resignFirstResponder() }
    updateVisibility()
    view.setNeedsLayout()
    view.layoutIfNeeded()
    emit("detent", value: value)
  }

  @objc private func pan(_ gesture: UIPanGestureRecognizer) {
    switch gesture.state {
    case .began: dragStart = glass.frame.height
    case .changed:
      dragHeight = max(156, dragStart - gesture.translation(in: view).y)
      if dragHeight! > 200 { detent = "medium" }
      updateVisibility()
      view.setNeedsLayout()
      view.layoutIfNeeded()
    case .ended, .cancelled:
      let height = dragHeight ?? dragStart
      let available = availableHeight
      let collapsed = min(available, collapsedHeight)
      let medium = min(available, max(260, available * 0.5))
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
    let keyboardTop = view.keyboardLayoutGuide.layoutFrame.minY
    let bottom = min(host.maxY - (detent == "collapsed" ? CGFloat(args.bottomClearance) : 12), keyboardTop - 12)
    let available = max(120, bottom - host.minY - 12)
    availableHeight = available
    handle.isHidden = available < 280
    let short = host.height <= 500 && host.width >= 640
    let width = min(host.width - 24, short ? 360 : 560)
    if detent == "collapsed" {
      collapsedHeight = stack.systemLayoutSizeFitting(
        CGSize(width: width - 24, height: UIView.layoutFittingCompressedSize.height),
        withHorizontalFittingPriority: .required,
        verticalFittingPriority: .fittingSizeLevel
      ).height + 12
    }
    let medium = min(available, max(260, available * 0.5))
    let large = min(available, max(medium, available * 0.85))
    actions.arrangedSubviews.last?.isHidden = large <= medium
    let height = min(available, dragHeight ?? (detent == "collapsed" ? collapsedHeight : detent == "large" ? large : medium))
    glass.frame = CGRect(x: short ? host.minX + 12 : host.midX - width / 2, y: bottom - height, width: width, height: height)
    guard glass.frame != lastGeometry else { return }
    let now = CACurrentMediaTime()
    if dragHeight != nil && now - lastGeometryTime < 1.0 / 30.0 { return }
    lastGeometryTime = now
    lastGeometry = glass.frame
    let css = view.convert(glass.frame, to: webview)
    emit("geometry", frame: ["x": css.minX - inset.left, "y": css.minY - inset.top, "width": css.width, "height": css.height])
  }

  func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { snapshot?.results.count ?? 0 }
  func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let cell = UITableViewCell(style: .subtitle, reuseIdentifier: nil)
    guard let result = snapshot?.results[indexPath.row] else { return cell }
    var content = cell.defaultContentConfiguration()
    content.text = result.label
    content.secondaryText = result.address
    content.textProperties.numberOfLines = 0
    content.secondaryTextProperties.numberOfLines = 0
    cell.contentConfiguration = content
    cell.accessibilityIdentifier = "ims-native-search-result-\(result.id)"
    return cell
  }
  func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
    guard let result = snapshot?.results[indexPath.row] else { return }
    field.resignFirstResponder()
    emit("select", value: result.id)
    setDetent("collapsed")
    UIAccessibility.post(notification: .layoutChanged, argument: search)
  }

  private func emit(_ action: String, value: String? = nil, frame: [String: CGFloat]? = nil) {
    guard let args = snapshot else { return }
    var detail: [String: Any] = ["id": args.id, "generation": args.generation, "revision": args.revision, "action": action]
    if let value { detail["value"] = value }
    if let frame { detail["frame"] = frame }
    onEvent?(detail)
  }

  func clear() { view.endEditing(true); snapshot = nil; onEvent = nil; glass.removeFromSuperview() }
}
#endif
