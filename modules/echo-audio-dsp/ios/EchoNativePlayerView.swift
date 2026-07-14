import Combine
import ExpoModulesCore
import Foundation
import SwiftUI
import UIKit

private extension UIView {
  func findHostingViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController {
        return controller
      }
      responder = current.next
    }
    return nil
  }
}

private let echoInk = Color(red: 0.17, green: 0.10, blue: 0.09)
private let echoAccent = Color(red: 0.67, green: 0.12, blue: 0.14)
private let echoGold = Color(red: 0.82, green: 0.55, blue: 0.08)
private var echoWarmBackground: LinearGradient {
  LinearGradient(
    colors: [
      Color(red: 0.97, green: 0.79, blue: 0.73),
      Color(red: 0.99, green: 0.88, blue: 0.69),
      Color(red: 0.96, green: 0.82, blue: 0.80),
    ],
    startPoint: .topLeading,
    endPoint: .bottomTrailing
  )
}

private extension View {
  @ViewBuilder
  func echoGlass<S: Shape>(
    tint: Color? = nil,
    clear: Bool = true,
    interactive: Bool = true,
    in shape: S
  ) -> some View {
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      if clear {
        if interactive {
          glassEffect(.clear.tint(tint).interactive(), in: shape)
        } else {
          glassEffect(.clear.tint(tint), in: shape)
        }
      } else {
        if interactive {
          glassEffect(.regular.tint(tint).interactive(), in: shape)
        } else {
          glassEffect(.regular.tint(tint), in: shape)
        }
      }
    } else {
      echoLegacyGlass(tint: tint, clear: clear, in: shape)
    }
    #else
    echoLegacyGlass(tint: tint, clear: clear, in: shape)
    #endif
  }

  @ViewBuilder
  func echoLegacyGlass<S: Shape>(tint: Color? = nil, clear: Bool, in shape: S) -> some View {
    if clear {
      background(Color.white.opacity(0.11), in: shape)
        .overlay(shape.stroke(Color.white.opacity(0.52), lineWidth: 0.8))
    } else {
      background(tint ?? Color.clear, in: shape)
        .background(.ultraThinMaterial, in: shape)
        .overlay(shape.stroke(Color.white.opacity(0.48), lineWidth: 0.8))
    }
  }
}

@ViewBuilder
private func echoGlassGroup<Content: View>(
  spacing: CGFloat,
  @ViewBuilder content: () -> Content
) -> some View {
  #if compiler(>=6.2)
  if #available(iOS 26.0, *) {
    GlassEffectContainer(spacing: spacing) {
      content()
    }
  } else {
    content()
  }
  #else
  content()
  #endif
}

private let nativeEqFrequencies = ["31", "63", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"]

func normalizedNativeEqGains(_ gains: [Double]) -> [Double] {
  nativeEqFrequencies.indices.map { index in
    min(12, max(-12, index < gains.count ? gains[index] : 0))
  }
}

final class EchoNativeEqualizerModel: ObservableObject {
  @Published var gains = Array(repeating: 0.0, count: 10)
  @Published var language = "zh"
  @Published var preset = "flat"
}

final class EchoNativePlayerModel: ObservableObject {
  @Published var artist = ""
  @Published var artworkUrl = ""
  @Published var connectionLabel = "ECHO未连接"
  @Published var connectionOnline = false
  @Published var controlsEnabled = false
  @Published var durationMs = 0.0
  @Published var isPlaying = false
  @Published var language = "zh"
  @Published var modeLabel = "Controlling Mode"
  @Published var outputMode = "pc"
  @Published var positionMs = 0.0
  @Published var queueCount = 0
  @Published var repeatOne = false
  @Published var showArtworkGlow = true
  @Published var tags: [String] = []
  @Published var title = ""
  @Published var volume = 1.0
  let equalizer = EchoNativeEqualizerModel()
}

final class EchoNativeEqLauncherModel: ObservableObject {
  @Published var description = ""
  @Published var label = ""
  @Published var title = "EQ"
  let equalizer = EchoNativeEqualizerModel()
}

final class EchoNativeDockModel: ObservableObject {
  @Published var activePage = "control"
  @Published var language = "zh"
}

public final class EchoNativePlayerView: ExpoView {
  let model = EchoNativePlayerModel()
  let onAction = EventDispatcher()

  private lazy var hostingController = UIHostingController(
    rootView: EchoNativePlayerScreen(model: model) { [weak self] payload in
      self?.onAction(payload)
    }
  )

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    hostingController.view.backgroundColor = .clear
    hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hostingController.view.frame = bounds
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil, hostingController.view.superview == nil, let parent = findHostingViewController() {
      if !(parent is UINavigationController) && !(parent is UITabBarController) {
        parent.addChild(hostingController)
      }
      addSubview(hostingController.view)
      hostingController.didMove(toParent: parent)
      hostingController.view.frame = bounds
    } else if window == nil {
      hostingController.view.removeFromSuperview()
      hostingController.removeFromParent()
    }
  }
}

public final class EchoNativeEqLauncherView: ExpoView {
  let model = EchoNativeEqLauncherModel()
  let onAction = EventDispatcher()

  private lazy var hostingController = UIHostingController(
    rootView: EchoNativeEqLauncherScreen(model: model) { [weak self] payload in
      self?.onAction(payload)
    }
  )

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    hostingController.view.backgroundColor = .clear
    hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hostingController.view.frame = bounds
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil, hostingController.view.superview == nil, let parent = findHostingViewController() {
      if !(parent is UINavigationController) && !(parent is UITabBarController) {
        parent.addChild(hostingController)
      }
      addSubview(hostingController.view)
      hostingController.didMove(toParent: parent)
      hostingController.view.frame = bounds
    } else if window == nil {
      hostingController.view.removeFromSuperview()
      hostingController.removeFromParent()
    }
  }
}

public final class EchoNativeDockView: ExpoView {
  let model = EchoNativeDockModel()
  let onAction = EventDispatcher()

  private lazy var hostingController = UIHostingController(
    rootView: EchoNativeDockScreen(model: model) { [weak self] payload in
      self?.onAction(payload)
    }
  )

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    hostingController.view.backgroundColor = .clear
    hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hostingController.view.frame = bounds
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil, hostingController.view.superview == nil, let parent = findHostingViewController() {
      if !(parent is UINavigationController) && !(parent is UITabBarController) {
        parent.addChild(hostingController)
      }
      addSubview(hostingController.view)
      hostingController.didMove(toParent: parent)
      hostingController.view.frame = bounds
    } else if window == nil {
      hostingController.view.removeFromSuperview()
      hostingController.removeFromParent()
    }
  }
}

private struct EchoNativeDockItem: Identifiable {
  let id: String
  let symbol: String
  let title: String
}

private struct EchoNativeDockScreen: View {
  @ObservedObject var model: EchoNativeDockModel
  let onAction: ([String: Any]) -> Void
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Namespace private var glassNamespace
  @State private var interactionPage: String?
  @State private var isInteracting = false

  private var items: [EchoNativeDockItem] {
    let english = model.language == "en"
    return [
      EchoNativeDockItem(id: "control", symbol: "headphones", title: english ? "Playback" : "播放"),
      EchoNativeDockItem(id: "library", symbol: "music.note.list", title: english ? "Library" : "曲库"),
      EchoNativeDockItem(id: "connect", symbol: "link", title: english ? "Connect" : "连接"),
      EchoNativeDockItem(id: "settings", symbol: "gearshape", title: english ? "Settings" : "设置"),
    ]
  }

  var body: some View {
    Group {
      #if compiler(>=6.2)
      if #available(iOS 26.0, *) {
        GlassEffectContainer(spacing: 8) {
          dockContent
        }
        .glassEffect(.clear.interactive(), in: Capsule())
      } else {
        legacyDock
      }
      #else
      legacyDock
      #endif
    }
    .padding(4)
    .preferredColorScheme(model.activePage == "control" ? .light : .dark)
  }

  private var dockContent: some View {
    GeometryReader { geometry in
      HStack(spacing: 6) {
        ForEach(items) { item in
          let selected = item.id == (interactionPage ?? model.activePage)
          let lightBackground = model.activePage == "control"
          ZStack {
            selectionBackground(selected: selected)
            VStack(spacing: 2) {
              Image(systemName: item.symbol)
                .font(.system(size: 19, weight: selected ? .semibold : .medium))
                .symbolRenderingMode(.hierarchical)
              Text(item.title)
                .font(.system(size: 10, weight: .semibold))
                .lineLimit(1)
            }
            .foregroundColor(
              lightBackground
                ? echoInk.opacity(selected ? 1 : 0.48)
                : Color.white.opacity(selected ? 1 : 0.5)
            )
          }
          .frame(maxWidth: .infinity, minHeight: 54)
          .contentShape(Capsule())
          .scaleEffect(isInteracting && selected ? 1.1 : 1)
          .zIndex(selected ? 1 : 0)
          .accessibilityElement()
          .accessibilityLabel(item.title)
          .accessibilityAddTraits(item.id == model.activePage ? [.isButton, .isSelected] : [.isButton])
          .accessibilityAction {
            activatePage(item.id)
          }
        }
      }
      .padding(6)
      .contentShape(Capsule())
      .gesture(
        DragGesture(minimumDistance: 0)
          .onChanged { value in
            updateInteraction(at: value.location.x, width: geometry.size.width)
          }
          .onEnded { value in
            finishInteraction(at: value.location.x, width: geometry.size.width)
          }
      )
    }
    .frame(height: 66)
  }

  @ViewBuilder
  private func selectionBackground(selected: Bool) -> some View {
    if selected {
      #if compiler(>=6.2)
      if #available(iOS 26.0, *) {
        Color.clear
          .glassEffect(.regular.tint(Color.black.opacity(0.18)).interactive(), in: Capsule())
          .glassEffectID("dock-selection", in: glassNamespace)
      } else {
        legacySelection
      }
      #else
      legacySelection
      #endif
    }
  }

  private var legacySelection: some View {
    Color.black.opacity(0.09)
      .echoLegacyGlass(tint: Color.black.opacity(0.12), clear: false, in: Capsule())
  }

  private var legacyDock: some View {
    dockContent
      .echoLegacyGlass(clear: true, in: Capsule())
  }

  private func page(at locationX: CGFloat, width: CGFloat) -> String? {
    guard width > 0, !items.isEmpty else { return nil }
    let ratio = min(0.999, max(0, locationX / width))
    return items[min(items.count - 1, Int(ratio * CGFloat(items.count)))].id
  }

  private func updateInteraction(at locationX: CGFloat, width: CGFloat) {
    guard let nextPage = page(at: locationX, width: width) else { return }
    let changedPage = nextPage != interactionPage
    if reduceMotion {
      interactionPage = nextPage
      isInteracting = true
    } else {
      withAnimation(.easeOut(duration: 0.16)) {
        interactionPage = nextPage
        isInteracting = true
      }
    }
    if changedPage {
      UISelectionFeedbackGenerator().selectionChanged()
    }
  }

  private func finishInteraction(at locationX: CGFloat, width: CGFloat) {
    let nextPage = page(at: locationX, width: width) ?? interactionPage
    if reduceMotion {
      interactionPage = nil
      isInteracting = false
    } else {
      withAnimation(.easeOut(duration: 0.2)) {
        interactionPage = nil
        isInteracting = false
      }
    }
    if let nextPage {
      activatePage(nextPage)
    }
  }

  private func activatePage(_ page: String) {
    guard page != model.activePage else { return }
    model.activePage = page
    onAction(["action": "page", "page": page])
  }
}

private struct EchoNativePlayerScreen: View {
  @ObservedObject var model: EchoNativePlayerModel
  let onAction: ([String: Any]) -> Void

  @State private var isSeeking = false
  @State private var isSettingVolume = false
  @State private var seekValue = 0.0
  @State private var showEqualizer = false
  @State private var volumeValue = 1.0

  var body: some View {
    GeometryReader { geometry in
      let compact = geometry.size.height < 600
      let spacing: CGFloat = compact ? 5 : 11
      let coverScale: CGFloat = compact ? 0.24 : 0.32
      let coverMinimum: CGFloat = compact ? 104 : 142
      let coverMaximum: CGFloat = compact ? 138 : 232
      let coverSize = min(
        geometry.size.width - 72,
        max(coverMinimum, min(coverMaximum, geometry.size.height * coverScale))
      )

      VStack(spacing: spacing) {
        statusHeader
        artwork(size: coverSize, compact: compact)
        trackDetails(compact: compact)
        progressControl
        transportControls(compact: compact)
        secondaryControls
        volumeControl
        outputControl
      }
      .padding(.horizontal, 16)
      .padding(.vertical, compact ? 8 : 12)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(echoWarmBackground)
    }
    .preferredColorScheme(.light)
    .sheet(isPresented: $showEqualizer) {
      EchoNativeEqualizerSheet(model: model.equalizer, onAction: onAction)
    }
    .onAppear {
      seekValue = model.positionMs
      volumeValue = model.volume
    }
    .onChange(of: model.positionMs) { value in
      if !isSeeking { seekValue = value }
    }
    .onChange(of: model.volume) { value in
      if !isSettingVolume { volumeValue = value }
    }
  }

  private var statusHeader: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(model.language == "en" ? "NOW PLAYING" : "正在播放")
          .font(.system(size: 10, weight: .bold))
          .foregroundColor(echoInk.opacity(0.48))
        Text(model.modeLabel)
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(echoInk)
      }
      Spacer()
      HStack(spacing: 6) {
        Circle()
          .fill(model.connectionOnline ? echoGold : echoAccent)
          .frame(width: 7, height: 7)
        Text(model.connectionLabel)
          .font(.system(size: 11, weight: .semibold))
          .lineLimit(1)
      }
      .foregroundColor(model.connectionOnline ? echoInk.opacity(0.74) : echoAccent)
      .padding(.horizontal, 10)
      .frame(height: 30)
      .echoGlass(tint: Color.white.opacity(0.12), interactive: false, in: Capsule())
    }
  }

  @ViewBuilder
  private func artwork(size: CGFloat, compact: Bool) -> some View {
    let cornerRadius: CGFloat = compact ? 20 : 28
    ZStack {
      if model.showArtworkGlow {
        RoundedRectangle(cornerRadius: 32, style: .continuous)
          .fill(echoGold.opacity(0.22))
          .frame(width: size * 0.94, height: size * 0.94)
          .blur(radius: 30)
      }
      EchoNativeArtwork(urlString: model.artworkUrl) {
        onAction(["action": "artworkError", "url": model.artworkUrl])
      }
      .frame(width: size, height: size)
      .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .stroke(Color.white.opacity(0.58), lineWidth: 1)
      }
    }
    .frame(height: size)
  }

  private func trackDetails(compact: Bool) -> some View {
    VStack(spacing: compact ? 4 : 7) {
      Text(model.title)
        .font(.system(size: compact ? 18 : 21, weight: .bold))
        .foregroundColor(echoInk)
        .lineLimit(compact ? 1 : 2)
        .minimumScaleFactor(0.8)
        .multilineTextAlignment(.center)
      if !model.artist.isEmpty {
        Text(model.artist)
          .font(.system(size: 12, weight: .medium))
          .foregroundColor(echoInk.opacity(0.58))
          .lineLimit(1)
      }
      if !model.tags.isEmpty {
        LazyVGrid(
          columns: [GridItem(.adaptive(minimum: compact ? 54 : 64), spacing: 5)],
          spacing: 5
        ) {
          ForEach(model.tags, id: \.self) { tag in
            Text(tag)
              .font(.system(size: 10, weight: .bold))
              .foregroundColor(echoInk.opacity(0.72))
              .lineLimit(1)
              .minimumScaleFactor(0.7)
              .padding(.horizontal, 6)
              .frame(maxWidth: .infinity, minHeight: 23)
              .overlay(Capsule().stroke(echoInk.opacity(0.15), lineWidth: 1))
          }
        }
      }
    }
  }

  private var progressControl: some View {
    VStack(spacing: 4) {
      Slider(
        value: $seekValue,
        in: 0...max(1, model.durationMs),
        onEditingChanged: { editing in
          isSeeking = editing
          if !editing {
            onAction(["action": "seek", "value": seekValue])
          }
        }
      )
      .tint(echoAccent)
      .disabled(!model.controlsEnabled || model.durationMs <= 0)
      .accessibilityLabel(model.language == "en" ? "Playback position" : "播放进度")
      .accessibilityValue("\(formatTime(seekValue)) / \(formatTime(model.durationMs))")
      HStack {
        Text(formatTime(seekValue))
        Spacer()
        Text(formatTime(model.durationMs))
      }
      .font(.system(size: 10, weight: .medium, design: .monospaced))
      .foregroundColor(echoInk.opacity(0.48))
    }
  }

  private func transportControls(compact: Bool) -> some View {
    echoGlassGroup(spacing: 10) {
      HStack(spacing: compact ? 24 : 34) {
        roundButton(
          symbol: "backward.end.fill",
          label: model.language == "en" ? "Previous" : "上一首",
          size: compact ? 48 : 54
        ) {
          onAction(["action": "previous"])
        }
        Button {
          onAction(["action": "playPause"])
        } label: {
          Image(systemName: model.isPlaying ? "pause.fill" : "play.fill")
            .font(.system(size: compact ? 26 : 30, weight: .bold))
            .foregroundColor(echoInk)
            .offset(x: model.isPlaying ? 0 : 2)
            .frame(width: compact ? 66 : 76, height: compact ? 66 : 76)
            .echoGlass(tint: Color.white.opacity(0.2), clear: false, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!model.controlsEnabled)
        .opacity(model.controlsEnabled ? 1 : 0.35)
        .accessibilityLabel(model.language == "en" ? (model.isPlaying ? "Pause" : "Play") : (model.isPlaying ? "暂停" : "播放"))
        roundButton(
          symbol: "forward.end.fill",
          label: model.language == "en" ? "Next" : "下一首",
          size: compact ? 48 : 54
        ) {
          onAction(["action": "next"])
        }
      }
    }
  }

  private var secondaryControls: some View {
    echoGlassGroup(spacing: 8) {
      HStack(spacing: 18) {
        iconButton(
          symbol: model.repeatOne ? "repeat.1" : "repeat",
          label: model.language == "en" ? "Repeat one" : "单曲循环",
          active: model.repeatOne
        ) {
          model.repeatOne.toggle()
          onAction(["action": "repeat"])
        }
        iconButton(symbol: "quote.bubble", label: model.language == "en" ? "Lyrics" : "歌词", active: false) {
          onAction(["action": "lyrics"])
        }
        ZStack(alignment: .topTrailing) {
          iconButton(symbol: "list.bullet", label: model.language == "en" ? "Queue" : "播放列表", active: false) {
            onAction(["action": "playlist"])
          }
          if model.queueCount > 0 {
            Text("\(model.queueCount)")
              .font(.system(size: 8, weight: .bold))
              .foregroundColor(.white)
              .padding(3)
              .background(echoAccent, in: Circle())
              .offset(x: 3, y: -3)
          }
        }
        Button {
          showEqualizer = true
        } label: {
          Text("EQ")
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(echoInk)
            .frame(width: 42, height: 42)
            .echoGlass(tint: Color.white.opacity(0.12), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(model.language == "en" ? "Equalizer" : "均衡器")
      }
    }
  }

  private var volumeControl: some View {
    HStack(spacing: 9) {
      Image(systemName: "speaker.wave.1.fill")
        .font(.system(size: 11, weight: .semibold))
        .foregroundColor(echoInk.opacity(0.52))
      Slider(
        value: $volumeValue,
        in: 0...1,
        onEditingChanged: { editing in
          isSettingVolume = editing
          onAction(["action": "volume", "value": volumeValue, "commit": !editing])
        }
      )
      .tint(echoAccent)
      .disabled(!model.controlsEnabled)
      .accessibilityLabel(model.language == "en" ? "Volume" : "音量")
      .accessibilityValue("\(Int((volumeValue * 100).rounded()))%")
      Text("\(Int((volumeValue * 100).rounded()))%")
        .font(.system(size: 10, weight: .bold, design: .monospaced))
        .foregroundColor(echoInk.opacity(0.58))
        .frame(width: 34, alignment: .trailing)
    }
    .onChange(of: volumeValue) { value in
      if isSettingVolume {
        onAction(["action": "volume", "value": value, "commit": false])
      }
    }
  }

  private var outputControl: some View {
    Picker("", selection: Binding(
      get: { model.outputMode },
      set: { value in
        model.outputMode = value
        onAction(["action": "output", "mode": value])
      }
    )) {
      Text(model.language == "en" ? "Local" : "本地").tag("local")
      Text(model.language == "en" ? "Control" : "控制").tag("pc")
      Text(model.language == "en" ? "Stream" : "串流").tag("phone")
    }
    .pickerStyle(.segmented)
    .tint(echoAccent)
    .accessibilityLabel(model.language == "en" ? "Playback output" : "播放输出")
  }

  private func roundButton(symbol: String, label: String, size: CGFloat, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: size * 0.34, weight: .bold))
        .foregroundColor(echoInk)
        .frame(width: size, height: size)
        .echoGlass(tint: Color.white.opacity(0.12), in: Circle())
    }
    .buttonStyle(.plain)
    .disabled(!model.controlsEnabled)
    .opacity(model.controlsEnabled ? 1 : 0.35)
    .accessibilityLabel(label)
  }

  private func iconButton(symbol: String, label: String, active: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 16, weight: .semibold))
        .foregroundColor(active ? echoAccent : echoInk)
        .frame(width: 42, height: 42)
        .echoGlass(
          tint: active ? Color.black.opacity(0.14) : Color.white.opacity(0.12),
          clear: !active,
          in: Circle()
        )
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
    .accessibilityValue(active ? (model.language == "en" ? "On" : "已开启") : (model.language == "en" ? "Off" : "已关闭"))
  }

  private func formatTime(_ milliseconds: Double) -> String {
    let seconds = max(0, Int(milliseconds / 1000))
    return String(format: "%d:%02d", seconds / 60, seconds % 60)
  }
}

private struct EchoNativeArtwork: View {
  let urlString: String
  let onError: () -> Void

  var body: some View {
    if let url = URL(string: urlString), url.isFileURL, let image = UIImage(contentsOfFile: url.path) {
      Image(uiImage: image)
        .resizable()
        .scaledToFill()
    } else if let url = URL(string: urlString), !urlString.isEmpty {
      AsyncImage(url: url) { phase in
        switch phase {
        case .success(let image):
          image.resizable().scaledToFill()
        case .failure:
          placeholder.onAppear(perform: onError)
        default:
          placeholder
        }
      }
    } else {
      placeholder
    }
  }

  private var placeholder: some View {
    ZStack {
      LinearGradient(
        colors: [Color.white.opacity(0.32), echoGold.opacity(0.22)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      Image(systemName: "waveform")
        .font(.system(size: 34, weight: .medium))
        .foregroundColor(echoInk.opacity(0.3))
    }
  }
}

private struct EchoNativeEqLauncherScreen: View {
  @ObservedObject var model: EchoNativeEqLauncherModel
  let onAction: ([String: Any]) -> Void
  @State private var showEqualizer = false

  var body: some View {
    Button {
      showEqualizer = true
    } label: {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 4) {
          Text(model.title)
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(.white)
          Text(model.description)
            .font(.system(size: 11))
            .foregroundColor(.white.opacity(0.5))
            .lineLimit(2)
        }
        Spacer()
        Text(model.label)
          .font(.system(size: 11, weight: .bold))
          .foregroundColor(echoAccent)
        Image(systemName: "chevron.right")
          .font(.system(size: 12, weight: .bold))
          .foregroundColor(.white.opacity(0.5))
      }
      .padding(.horizontal, 12)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .echoGlass(
        tint: Color.black.opacity(0.12),
        clear: false,
        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
      )
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(model.title), \(model.label)")
    .preferredColorScheme(.dark)
    .sheet(isPresented: $showEqualizer) {
      EchoNativeEqualizerSheet(model: model.equalizer, onAction: onAction)
    }
  }
}

private struct EchoNativeEqualizerSheet: View {
  @ObservedObject var model: EchoNativeEqualizerModel
  let onAction: ([String: Any]) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var activeBand = 4

  private var presetKeys: [String] { ["flat", "bass", "vocal", "clarity", "warm", "lateNight"] }

  var body: some View {
    VStack(spacing: 18) {
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text("EQ")
            .font(.system(size: 24, weight: .bold))
          Text(model.language == "en" ? "10-band equalizer" : "十段均衡器")
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(echoInk.opacity(0.52))
        }
        Spacer()
        Text(presetLabel(model.preset))
          .font(.system(size: 11, weight: .bold))
          .foregroundColor(echoAccent)
          .padding(.horizontal, 10)
          .frame(height: 28)
          .overlay(Capsule().stroke(echoAccent.opacity(0.36), lineWidth: 1))
        Button {
          dismiss()
        } label: {
          Image(systemName: "xmark")
            .font(.system(size: 13, weight: .bold))
            .frame(width: 34, height: 34)
            .echoGlass(tint: Color.white.opacity(0.14), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(model.language == "en" ? "Close equalizer" : "关闭均衡器")
      }

      HStack(alignment: .firstTextBaseline) {
        Text(frequencyLabel(activeBand))
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(echoInk.opacity(0.58))
        Spacer()
        Text(String(format: "%+.1f dB", model.gains[activeBand]))
          .font(.system(size: 23, weight: .bold, design: .monospaced))
      }
      .padding(.bottom, 10)
      .overlay(alignment: .bottom) { Rectangle().fill(echoInk.opacity(0.1)).frame(height: 1) }

      GeometryReader { geometry in
        let plotHeight = geometry.size.height - 24
        HStack(alignment: .top, spacing: 8) {
          VStack {
            ForEach([12, 6, 0, -6, -12], id: \.self) { gain in
              Text("\(gain > 0 ? "+" : "")\(gain)dB")
                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                .foregroundColor(echoInk.opacity(0.42))
              if gain != -12 { Spacer() }
            }
          }
          .frame(width: 40, height: plotHeight)

          ZStack(alignment: .top) {
            VStack(spacing: 0) {
              ForEach(0..<5, id: \.self) { index in
                Rectangle().fill(echoInk.opacity(0.1)).frame(height: 1)
                if index < 4 { Spacer() }
              }
            }
            .frame(height: plotHeight)

            HStack(spacing: 2) {
              ForEach(nativeEqFrequencies.indices, id: \.self) { index in
                EchoNativeEqBand(
                  gain: model.gains[index],
                  label: nativeEqFrequencies[index],
                  plotHeight: plotHeight,
                  onChange: { gain in
                    activeBand = index
                    model.preset = "custom"
                    model.gains[index] = gain
                    onAction(["action": "eqChange", "index": index, "value": gain])
                  }
                )
                .onTapGesture { activeBand = index }
              }
            }
          }
        }
      }
      .frame(minHeight: 230)

      ScrollView(.horizontal, showsIndicators: false) {
        echoGlassGroup(spacing: 4) {
          HStack(spacing: 8) {
            ForEach(presetKeys, id: \.self) { key in
              Button {
                model.preset = key
                onAction(["action": "eqPreset", "preset": key])
              } label: {
                Text(presetLabel(key))
                  .font(.system(size: 12, weight: .bold))
                  .foregroundColor(model.preset == key ? echoAccent : echoInk.opacity(0.58))
                  .padding(.horizontal, 13)
                  .frame(height: 36)
                  .echoGlass(
                    tint: model.preset == key ? Color.black.opacity(0.12) : Color.white.opacity(0.1),
                    clear: model.preset != key,
                    in: Capsule()
                  )
              }
              .buttonStyle(.plain)
            }
          }
        }
      }
    }
    .padding(20)
    .foregroundColor(echoInk)
    .background(echoWarmBackground.ignoresSafeArea())
    .preferredColorScheme(.light)
  }

  private func frequencyLabel(_ index: Int) -> String {
    let label = nativeEqFrequencies[index]
    return label.hasSuffix("k") ? "\(label.dropLast()) kHz" : "\(label) Hz"
  }

  private func presetLabel(_ key: String) -> String {
    let english = ["flat": "Flat", "bass": "Bass", "vocal": "Vocal", "clarity": "Clarity", "warm": "Warm", "lateNight": "Late Night", "custom": "Custom"]
    let chinese = ["flat": "平直", "bass": "低频", "vocal": "人声", "clarity": "清晰", "warm": "暖声", "lateNight": "夜间", "custom": "手动"]
    return (model.language == "en" ? english : chinese)[key] ?? key
  }
}

private struct EchoNativeEqBand: View {
  let gain: Double
  let label: String
  let plotHeight: CGFloat
  let onChange: (Double) -> Void

  var body: some View {
    VStack(spacing: 7) {
      GeometryReader { geometry in
        let y = CGFloat((12 - gain) / 24) * geometry.size.height
        let center = geometry.size.height / 2
        ZStack(alignment: .top) {
          Rectangle()
            .fill(echoInk.opacity(0.2))
            .frame(width: 2)
          Rectangle()
            .fill(echoAccent)
            .frame(width: 2, height: max(2, abs(y - center)))
            .offset(y: min(y, center))
          Circle()
            .fill(echoAccent)
            .overlay(Circle().stroke(Color.white, lineWidth: 2))
            .frame(width: 12, height: 12)
            .offset(y: y - 6)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 0).onChanged { value in
          let ratio = min(1, max(0, value.location.y / geometry.size.height))
          let rawGain = 12 - Double(ratio) * 24
          onChange((rawGain * 2).rounded() / 2)
        })
      }
      .frame(height: plotHeight)
      Text(label)
        .font(.system(size: 9, weight: .bold, design: .monospaced))
        .foregroundColor(echoInk.opacity(0.54))
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity)
    .accessibilityElement()
    .accessibilityLabel("\(label) \(String(format: "%+.1f dB", gain))")
    .accessibilityAdjustableAction { direction in
      let delta = direction == .increment ? 0.5 : -0.5
      onChange(min(12, max(-12, gain + delta)))
    }
  }
}
