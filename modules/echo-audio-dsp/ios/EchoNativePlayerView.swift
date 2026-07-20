import Combine
import ExpoModulesCore
import Foundation
import ImageIO
import SwiftUI
import UIKit

func setIfChanged<Root: AnyObject, Value: Equatable>(
  _ root: Root,
  _ keyPath: ReferenceWritableKeyPath<Root, Value>,
  _ value: Value
) {
  if root[keyPath: keyPath] != value {
    root[keyPath: keyPath] = value
  }
}

extension UIView {
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

private func echoAdaptiveColor(light: UIColor, dark: UIColor) -> Color {
  Color(uiColor: UIColor { traits in
    traits.userInterfaceStyle == .dark ? dark : light
  })
}

let echoInk = Color.primary
let echoAccent = Color(red: 0.67, green: 0.12, blue: 0.14)
let echoGold = Color(red: 0.82, green: 0.55, blue: 0.08)
let echoPageHeaderBackground = echoAdaptiveColor(
  light: UIColor(red: 0.97, green: 0.79, blue: 0.73, alpha: 1),
  dark: UIColor(red: 0.13, green: 0.09, blue: 0.13, alpha: 1)
)
var echoWarmBackground: LinearGradient {
  LinearGradient(
    colors: [
      echoAdaptiveColor(
        light: UIColor(red: 0.97, green: 0.79, blue: 0.73, alpha: 1),
        dark: UIColor(red: 0.13, green: 0.09, blue: 0.13, alpha: 1)
      ),
      echoAdaptiveColor(
        light: UIColor(red: 0.99, green: 0.88, blue: 0.69, alpha: 1),
        dark: UIColor(red: 0.20, green: 0.12, blue: 0.16, alpha: 1)
      ),
      echoAdaptiveColor(
        light: UIColor(red: 0.96, green: 0.82, blue: 0.80, alpha: 1),
        dark: UIColor(red: 0.10, green: 0.11, blue: 0.16, alpha: 1)
      ),
    ],
    startPoint: .topLeading,
    endPoint: .bottomTrailing
  )
}

extension View {
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

  @ViewBuilder
  func echoScrollClipDisabled() -> some View {
    if #available(iOS 17.0, *) {
      scrollClipDisabled()
    } else {
      self
    }
  }

  @ViewBuilder
  func echoCompactSheet(height: CGFloat) -> some View {
    if #available(iOS 16.4, *) {
      presentationDetents([.height(height)])
        .presentationDragIndicator(.visible)
        .presentationBackground(echoWarmBackground)
        .presentationCornerRadius(28)
    } else if #available(iOS 16.0, *) {
      presentationDetents([.height(height)])
        .presentationDragIndicator(.visible)
    } else {
      self
    }
  }

  @ViewBuilder
  func echoMediumSheet() -> some View {
    if #available(iOS 16.4, *) {
      presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(echoWarmBackground)
        .presentationCornerRadius(28)
    } else if #available(iOS 16.0, *) {
      presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    } else {
      self
    }
  }

  @ViewBuilder
  func echoBlurredSheet() -> some View {
    if #available(iOS 16.4, *) {
      presentationBackground(.regularMaterial)
    } else {
      background(.regularMaterial)
    }
  }
}

@ViewBuilder
func echoGlassGroup<Content: View>(
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

final class EchoNativeEqualizerModel: ObservableObject {
  @Published var gains = Array(repeating: 0.0, count: 10)
  @Published var language = "zh"
  @Published var preset = "flat"
}

final class EchoNativePlaybackClockModel: ObservableObject {
  @Published var positionMs = 0.0
}

struct EchoNativeQueueItem: Decodable, Identifiable {
  let artist: String
  let current: Bool
  let id: String
  let meta: String
  let source: String
  let title: String
  let trackId: String
}

struct EchoNativeQueuePayload: Decodable {
  let canEdit: Bool
  let clearLabel: String
  let emptyLabel: String
  let items: [EchoNativeQueueItem]
  let moveDownLabel: String
  let moveUpLabel: String
  let playlistId: String
  let removeLabel: String
  let source: String
  let subtitle: String
  let title: String
}

struct EchoNativeExternalSourceCandidate: Decodable, Identifiable {
  let albumArt: String?
  let artist: String?
  let availableLabel: String
  let hasArtist: Bool
  let hasArtwork: Bool
  let hasLyrics: Bool
  let id: String
  let source: String
  let sourceLabel: String
  let title: String
}

struct EchoNativeExternalSourcePickerPayload: Decodable, Identifiable {
  let artworkLabel: String
  let artistLabel: String
  let cancelLabel: String
  let candidates: [EchoNativeExternalSourceCandidate]
  let doneLabel: String
  let id: String
  let ignoreLabel: String
  let lyricsLabel: String
  let selectedLabel: String
  let subtitle: String
  let title: String
  let unavailableLabel: String
  let useSourceLabel: String
}

final class EchoNativePlayerModel: ObservableObject {
  let clock = EchoNativePlaybackClockModel()
  let equalizer = EchoNativeEqualizerModel()
  @Published var activePage = "control"
  @Published var activeLyricIndex = 0
  @Published var album = ""
  @Published var alertMessage = ""
  @Published var alertTitle = ""
  @Published var artist = ""
  @Published var artworkBackgroundEnabled = true
  @Published var artworkUrl = ""
  @Published var connectionLabel = "ECHO未连接"
  @Published var connectionOnline = false
  @Published var controlsEnabled = false
  @Published var darkModeEnabled = false
  @Published var durationMs = 0.0
  @Published var externalSourcePicker: EchoNativeExternalSourcePickerPayload?
  @Published var followSystemAppearance = true
  @Published var isFavorite = false
  @Published var isPlaying = false
  @Published var language = "zh"
  @Published var lyricLines: [EchoNativeMetadataService.LyricLine] = []
  @Published var lyricsVisible = false
  @Published var metadataLoading = false
  @Published var outputMode = "local"
  @Published var playbackMode = EchoNativePlaybackMode.normal
  @Published var playbackLoading = false
  @Published var queueCount = 0
  @Published var queuePayload: EchoNativeQueuePayload?
  @Published var showArtworkGlow = true
  @Published var tags: [String] = []
  @Published var title = ""
  @Published var volume = 1.0
  private var lastExternalSourcePickerJSON = ""
  private var lastQueuePayloadJSON = ""

  var positionMs: Double {
    get { clock.positionMs }
    set { clock.positionMs = newValue }
  }

  func updateQueue(payloadJSON: String) {
    guard payloadJSON != lastQueuePayloadJSON else { return }
    guard
      let data = payloadJSON.data(using: .utf8),
      let payload = try? JSONDecoder().decode(EchoNativeQueuePayload.self, from: data)
    else {
      return
    }
    lastQueuePayloadJSON = payloadJSON
    queuePayload = payload
  }

  func updateExternalSourcePicker(payloadJSON: String) {
    guard payloadJSON != lastExternalSourcePickerJSON else { return }
    lastExternalSourcePickerJSON = payloadJSON
    guard !payloadJSON.isEmpty else {
      externalSourcePicker = nil
      return
    }
    guard
      let data = payloadJSON.data(using: .utf8),
      let payload = try? JSONDecoder().decode(EchoNativeExternalSourcePickerPayload.self, from: data),
      !payload.candidates.isEmpty
    else {
      externalSourcePicker = nil
      return
    }
    if externalSourcePicker?.id != payload.id {
      externalSourcePicker = payload
    }
  }
}

public final class EchoNativeAppView: ExpoView {
  private let store = EchoNativeAppStore()
  private var appearanceCancellable: AnyCancellable?

  private lazy var hostingController = UIHostingController(
    rootView: EchoNativeAppScreen(
      playerModel: store.playerModel,
      pagesModel: store.pagesModel,
      onAction: store.handle
    )
  )

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    hostingController.view.backgroundColor = .clear
    hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    appearanceCancellable = store.playerModel.$followSystemAppearance
      .combineLatest(store.playerModel.$darkModeEnabled)
      .sink { [weak self] followsSystem, darkMode in
        let style: UIUserInterfaceStyle = followsSystem ? .unspecified : (darkMode ? .dark : .light)
        self?.hostingController.overrideUserInterfaceStyle = style
      }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hostingController.view.frame = bounds
  }

  func migrateLegacy(_ payloadJSON: String) {
    store.migrateLegacy(payloadJSON: payloadJSON)
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { store.start() }
    if window != nil, hostingController.view.superview == nil, let parent = findHostingViewController() {
      store.presenter = parent
      parent.addChild(hostingController)
      addSubview(hostingController.view)
      hostingController.didMove(toParent: parent)
      hostingController.view.frame = bounds
    } else if window == nil {
      store.presenter = nil
      hostingController.view.removeFromSuperview()
      hostingController.removeFromParent()
    }
  }
}

private struct EchoNativeAppScreen: View {
  @ObservedObject var playerModel: EchoNativePlayerModel
  @ObservedObject var pagesModel: EchoNativePagesModel
  let onAction: ([String: Any]) -> Void

  var body: some View {
    ZStack {
      echoWarmBackground.ignoresSafeArea()
      Group {
        #if compiler(>=6.0)
        if #available(iOS 18.0, *) {
          adaptiveTabView
        } else {
          legacyTabView
        }
        #else
        legacyTabView
        #endif
      }
      .tint(echoAccent)
    }
    .sheet(item: $playerModel.externalSourcePicker) { payload in
      EchoNativeExternalSourcePicker(payload: payload, onAction: onAction)
        .echoMediumSheet()
    }
    .alert(playerModel.alertTitle, isPresented: Binding(
      get: { !playerModel.alertMessage.isEmpty },
      set: { if !$0 { playerModel.alertMessage = "" } }
    )) {
      Button(playerModel.language == "en" ? "OK" : "好", role: .cancel) {
        playerModel.alertMessage = ""
      }
    } message: {
      Text(playerModel.alertMessage)
    }
  }

  private var selection: Binding<String> {
    Binding(
      get: { playerModel.activePage },
      set: { page in
        guard page != playerModel.activePage else { return }
        playerModel.activePage = page
        onAction(["action": "page", "page": page])
      }
    )
  }

  #if compiler(>=6.0)
  @available(iOS 18.0, *)
  private var adaptiveTabView: some View {
    TabView(selection: selection) {
      Tab(title("control"), systemImage: "headphones", value: "control") {
        themedTab(playerBackground: true) {
          EchoNativePlayerScreen(model: playerModel, onAction: onAction)
        }
      }
      Tab(title("library"), systemImage: "music.note.list", value: "library") {
        themedTab {
          EchoNativePagesScreen(model: pagesModel, page: "library", onAction: onAction)
        }
      }
      Tab(title("search"), systemImage: "magnifyingglass", value: "search", role: .search) {
        themedTab {
          EchoNativePagesScreen(model: pagesModel, page: "search", onAction: onAction)
        }
      }
      Tab(title("connect"), systemImage: "link", value: "connect") {
        themedTab {
          EchoNativePagesScreen(model: pagesModel, page: "connect", onAction: onAction)
        }
      }
      Tab(title("settings"), systemImage: "gearshape", value: "settings") {
        themedTab {
          EchoNativePagesScreen(model: pagesModel, page: "settings", onAction: onAction)
        }
      }
    }
    .tabViewStyle(.sidebarAdaptable)
    .background(Color.clear)
  }
  #endif

  private var legacyTabView: some View {
    TabView(selection: selection) {
      themedTab(playerBackground: true) {
        EchoNativePlayerScreen(model: playerModel, onAction: onAction)
      }
        .tag("control")
        .tabItem { Label(title("control"), systemImage: "headphones") }
      themedTab {
        EchoNativePagesScreen(model: pagesModel, page: "library", onAction: onAction)
      }
        .tag("library")
        .tabItem { Label(title("library"), systemImage: "music.note.list") }
      themedTab {
        EchoNativePagesScreen(model: pagesModel, page: "search", onAction: onAction)
      }
        .tag("search")
        .tabItem { Label(title("search"), systemImage: "magnifyingglass") }
      themedTab {
        EchoNativePagesScreen(model: pagesModel, page: "connect", onAction: onAction)
      }
        .tag("connect")
        .tabItem { Label(title("connect"), systemImage: "link") }
      themedTab {
        EchoNativePagesScreen(model: pagesModel, page: "settings", onAction: onAction)
      }
        .tag("settings")
        .tabItem { Label(title("settings"), systemImage: "gearshape") }
    }
    .background(Color.clear)
  }

  private func themedTab<Content: View>(
    playerBackground: Bool = false,
    @ViewBuilder content: () -> Content
  ) -> some View {
    ZStack {
      if playerBackground {
        EchoNativeArtworkBackdrop(
          enabled: playerModel.artworkBackgroundEnabled,
          identity: "\(playerModel.title)::\(playerModel.artist)",
          urlString: playerModel.artworkBackgroundEnabled ? playerModel.artworkUrl : ""
        ) {
          onAction(["action": "artworkError", "url": playerModel.artworkUrl])
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
      } else {
        echoWarmBackground.ignoresSafeArea()
      }

      content()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func title(_ page: String) -> String {
    let english = playerModel.language == "en"
    switch page {
    case "control": return english ? "Playback" : "播放"
    case "library": return english ? "Library" : "曲库"
    case "search": return english ? "Search" : "搜索"
    case "connect": return english ? "Connect" : "连接"
    default: return english ? "Settings" : "设置"
    }
  }
}

struct EchoNativePlayerScreen: View {
  @ObservedObject var model: EchoNativePlayerModel
  let onAction: ([String: Any]) -> Void
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var isSettingVolume = false
  @State private var lastLyricsInteraction = Date.distantPast
  @State private var showEqualizer = false
  @State private var showQueue = false
  @State private var volumeValue = 1.0

  var body: some View {
    GeometryReader { geometry in
      ZStack {
        if model.lyricsVisible {
          lyricsLayout(geometry: geometry)
            .transition(.opacity.combined(with: .scale(scale: 0.98)))
        } else {
          playerLayout(geometry: geometry)
            .transition(.opacity.combined(with: .scale(scale: 0.98)))
        }
      }
      .frame(width: geometry.size.width, height: geometry.size.height)
      .background(Color.clear)
    }
    .animation(reduceMotion ? nil : .easeInOut(duration: 0.32), value: model.lyricsVisible)
    .sheet(isPresented: $showEqualizer) {
      EchoNativeEqualizerSheet(model: model.equalizer, onAction: onAction)
    }
    .sheet(isPresented: $showQueue) {
      EchoNativeQueueSheet(model: model, onAction: onAction)
        .echoMediumSheet()
        .echoBlurredSheet()
    }
    .onAppear {
      volumeValue = model.volume
    }
    .onChange(of: model.volume) { value in
      if !isSettingVolume { volumeValue = value }
    }
  }

  private func playerLayout(geometry: GeometryProxy) -> some View {
    let compact = geometry.size.height < 680
    let coverScale: CGFloat = compact ? 0.34 : 0.40
    let coverMinimum: CGFloat = compact ? 138 : 210
    let coverMaximum: CGFloat = compact ? 200 : 310
    let coverSize = min(
      geometry.size.width - 48,
      max(coverMinimum, min(coverMaximum, geometry.size.height * coverScale))
    )

    return VStack(spacing: 0) {
      statusHeader
      artwork(size: coverSize, compact: compact)
        .padding(.top, compact ? 6 : 10)
      trackDetails(compact: compact)
        .padding(.top, compact ? 7 : 12)
      progressControl
        .padding(.top, compact ? 7 : 12)
      transportControls(compact: compact)
        .padding(.top, compact ? 5 : 8)
      secondaryControls(lyricsMode: false, compact: compact)
        .padding(.top, compact ? 4 : 8)
      volumeControl
        .padding(.top, compact ? 3 : 6)
      outputControl
        .padding(.top, compact ? 4 : 8)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, compact ? 6 : 12)
    .frame(maxWidth: 460)
    .frame(width: geometry.size.width, height: geometry.size.height, alignment: .center)
  }

  private func lyricsLayout(geometry: GeometryProxy) -> some View {
    let compact = geometry.size.height < 600

    return VStack(spacing: compact ? 7 : 11) {
      lyricsHeader(compact: compact)
      lyricsScroller(compact: compact)
      VStack(spacing: compact ? 6 : 9) {
        progressControl
        transportControls(compact: true)
        secondaryControls(lyricsMode: true, compact: compact)
        volumeControl
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, compact ? 8 : 12)
    .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
  }

  private func lyricsHeader(compact: Bool) -> some View {
    let artworkSize: CGFloat = compact ? 68 : 84

    return HStack(alignment: .top, spacing: 12) {
      VStack(spacing: 5) {
        ZStack {
          EchoNativeArtwork(urlString: model.artworkUrl) {
            onAction(["action": "artworkError", "url": model.artworkUrl])
          }
          if model.metadataLoading {
            EchoNativeArtworkLoadingBadge(language: model.language, compact: true)
              .transition(.opacity)
          }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: model.metadataLoading)
        .frame(width: artworkSize, height: artworkSize)
        .clipShape(RoundedRectangle(cornerRadius: compact ? 17 : 21, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: compact ? 17 : 21, style: .continuous)
            .stroke(Color.white.opacity(0.58), lineWidth: 1)
        }

        if showsConnectionStatus {
          connectionStatus(compact: true)
        }
      }
      .frame(width: artworkSize)

      VStack(alignment: .leading, spacing: compact ? 3 : 5) {
        Text(titleLabel)
          .font(.system(size: compact ? 17 : 20, weight: .bold))
          .foregroundColor(echoInk)
          .lineLimit(2)
          .minimumScaleFactor(0.82)
        Text(artistLabel)
          .font(.system(size: 11, weight: .medium))
          .foregroundColor(echoInk.opacity(0.56))
          .lineLimit(1)
        HStack(spacing: 5) {
          ForEach(Array(model.tags.prefix(compact ? 2 : 3)), id: \.self) { tag in
            Text(tag)
              .font(.system(size: 9, weight: .bold))
              .foregroundColor(echoInk.opacity(0.68))
              .lineLimit(1)
              .minimumScaleFactor(0.7)
              .padding(.horizontal, 6)
              .frame(height: 20)
              .overlay(Capsule().stroke(echoInk.opacity(0.14), lineWidth: 1))
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      Button {
        onAction(["action": "lyricsClose"])
      } label: {
        Image(systemName: "xmark")
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(echoInk)
          .frame(width: 36, height: 36)
          .echoGlass(tint: Color.white.opacity(0.12), in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(model.language == "en" ? "Close lyrics" : "关闭歌词")
    }
  }

  private func lyricsScroller(compact: Bool) -> some View {
    ScrollViewReader { proxy in
      ScrollView(.vertical, showsIndicators: false) {
        LazyVStack(alignment: .leading, spacing: compact ? 12 : 18) {
          ForEach(Array(model.lyricLines.enumerated()), id: \.offset) { index, line in
            let active = index == model.activeLyricIndex
            let distance = abs(index - model.activeLyricIndex)
            let timeMs = line.milliseconds
            Button {
              guard timeMs >= 0 else { return }
              onAction(["action": "seek", "value": timeMs])
            } label: {
              VStack(alignment: .leading, spacing: 3) {
                Text(line.text)
                  .font(.system(
                    size: active ? (compact ? 20 : 24) : (distance == 1 ? 18 : 16),
                    weight: active ? .bold : .semibold
                  ))
                  .foregroundColor(active ? echoInk : echoInk.opacity(distance == 1 ? 0.56 : 0.3))
                  .multilineTextAlignment(.leading)
                  .fixedSize(horizontal: false, vertical: true)
                  .shadow(color: active ? Color.white.opacity(0.7) : .clear, radius: 8)
                if timeMs >= 0 {
                  Text(formatTime(timeMs))
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .foregroundColor(echoInk.opacity(0.32))
                }
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(timeMs < 0)
            .id(index)
            .accessibilityLabel(lyricAccessibilityLabel(line: line, timeMs: timeMs))
          }
        }
        .padding(.vertical, compact ? 56 : 76)
      }
      .simultaneousGesture(
        DragGesture(minimumDistance: 4)
          .onChanged { _ in lastLyricsInteraction = Date() }
          .onEnded { _ in lastLyricsInteraction = Date() }
      )
      .onAppear {
        scrollToActiveLyric(proxy, index: model.activeLyricIndex, animated: false)
      }
      .onChange(of: model.activeLyricIndex) { index in
        guard Date().timeIntervalSince(lastLyricsInteraction) > 1.5 else { return }
        scrollToActiveLyric(proxy, index: index, animated: true)
      }
    }
    .frame(maxHeight: .infinity)
  }

  private func lyricAccessibilityLabel(line: EchoNativeMetadataService.LyricLine, timeMs: Double) -> String {
    guard timeMs >= 0 else { return line.text }
    return "\(formatTime(timeMs)), \(line.text)"
  }

  private func scrollToActiveLyric(_ proxy: ScrollViewProxy, index: Int, animated: Bool) {
    guard model.lyricLines.indices.contains(index) else { return }
    if animated && !reduceMotion {
      withAnimation(.easeOut(duration: 0.3)) {
        proxy.scrollTo(index, anchor: .center)
      }
    } else {
      proxy.scrollTo(index, anchor: .center)
    }
  }

  private var statusHeader: some View {
    VStack(spacing: 2) {
      Text(model.language == "en" ? "NOW PLAYING" : "正在播放")
        .font(.system(size: 10, weight: .bold))
        .foregroundColor(echoInk.opacity(0.48))
      Text(albumLabel)
        .font(.system(size: 13, weight: .semibold))
        .foregroundColor(echoInk)
        .lineLimit(1)
    }
    .multilineTextAlignment(.center)
    .frame(maxWidth: .infinity, alignment: .center)
  }

  @ViewBuilder
  private func artwork(size: CGFloat, compact: Bool) -> some View {
    let cornerRadius: CGFloat = compact ? 20 : 28
    VStack(spacing: compact ? 4 : 6) {
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
        if model.metadataLoading {
          EchoNativeArtworkLoadingBadge(language: model.language, compact: compact)
            .transition(.opacity)
        }
      }
      .frame(height: size)
      .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: model.metadataLoading)

      if showsConnectionStatus {
        connectionStatus(compact: compact)
      }
    }
    .frame(width: size)
  }

  private func connectionStatus(compact: Bool) -> some View {
    HStack(spacing: 5) {
      Circle()
        .fill(model.connectionOnline ? echoGold : echoAccent)
        .frame(width: compact ? 5 : 6, height: compact ? 5 : 6)
      Text(model.connectionLabel)
        .font(.system(size: compact ? 9 : 10, weight: .semibold))
        .foregroundColor(model.connectionOnline ? echoInk.opacity(0.66) : echoAccent)
        .lineLimit(1)
        .minimumScaleFactor(0.72)
    }
    .padding(.horizontal, compact ? 7 : 9)
    .frame(maxWidth: .infinity, minHeight: compact ? 22 : 25)
    .echoGlass(tint: Color.white.opacity(0.12), interactive: false, in: Capsule())
    .accessibilityLabel(model.connectionLabel)
  }

  private func trackDetails(compact: Bool) -> some View {
    VStack(spacing: compact ? 4 : 7) {
      Text(titleLabel)
        .font(.system(size: compact ? 18 : 21, weight: .bold))
        .foregroundColor(echoInk)
        .lineLimit(compact ? 1 : 2)
        .minimumScaleFactor(0.8)
        .multilineTextAlignment(.center)
      Text(artistLabel)
        .font(.system(size: 12, weight: .medium))
        .foregroundColor(echoInk.opacity(0.58))
        .lineLimit(1)
      if !model.tags.isEmpty {
        Text(model.tags.joined(separator: "  •  "))
          .font(.system(size: 10, weight: .semibold))
          .foregroundColor(echoInk.opacity(0.62))
          .lineLimit(1)
          .minimumScaleFactor(0.65)
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity, alignment: .center)
      }
    }
  }

  private var progressControl: some View {
    EchoNativeProgressControl(
      clock: model.clock,
      controlsEnabled: model.controlsEnabled,
      durationMs: model.durationMs,
      language: model.language
    ) { value in
      onAction(["action": "seek", "value": value])
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
          Group {
            if model.playbackLoading {
              ProgressView().controlSize(.regular)
            } else {
              Image(systemName: model.isPlaying ? "pause.fill" : "play.fill")
                .offset(x: model.isPlaying ? 0 : 2)
            }
          }
          .font(.system(size: compact ? 26 : 30, weight: .bold))
          .foregroundColor(echoInk)
          .frame(width: compact ? 66 : 76, height: compact ? 66 : 76)
          .echoGlass(tint: Color.white.opacity(0.2), clear: false, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!model.controlsEnabled || model.playbackLoading)
        .opacity(model.controlsEnabled && !model.playbackLoading ? 1 : 0.5)
        .accessibilityLabel(model.playbackLoading
          ? (model.language == "en" ? "Loading audio" : "正在加载音频")
          : (model.language == "en" ? (model.isPlaying ? "Pause" : "Play") : (model.isPlaying ? "暂停" : "播放")))
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

  private func secondaryControls(lyricsMode: Bool, compact: Bool) -> some View {
    echoGlassGroup(spacing: 8) {
      HStack(spacing: compact ? 4 : 10) {
        iconButton(
          symbol: playbackModeSymbol,
          label: model.language == "en" ? "Playback mode" : "播放模式",
          active: model.playbackMode != .normal,
          value: playbackModeLabel
        ) {
          onAction(["action": "playbackMode"])
        }
        iconButton(
          symbol: lyricsMode ? "quote.bubble.fill" : "quote.bubble",
          label: model.language == "en" ? (lyricsMode ? "Close lyrics" : "Lyrics") : (lyricsMode ? "关闭歌词" : "歌词"),
          active: lyricsMode
        ) {
          onAction(["action": lyricsMode ? "lyricsClose" : "lyrics"])
        }
        ZStack(alignment: .topTrailing) {
          iconButton(symbol: "list.bullet", label: model.language == "en" ? "Queue" : "播放列表", active: false) {
            showQueue = true
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
        iconButton(
          symbol: model.isFavorite ? "heart.fill" : "heart",
          label: model.language == "en" ? (model.isFavorite ? "Remove favorite" : "Favorite") : (model.isFavorite ? "取消收藏" : "收藏"),
          active: model.isFavorite
        ) {
          onAction(["action": "trackFavoriteCurrent"])
        }
        moreControls
      }
    }
  }

  private var playbackModeSymbol: String {
    switch model.playbackMode {
    case .normal: return "arrow.right.to.line"
    case .repeatAll: return "repeat"
    case .repeatOne: return "repeat.1"
    case .shuffle: return "shuffle"
    }
  }

  private var playbackModeLabel: String {
    let english = model.language == "en"
    switch model.playbackMode {
    case .normal: return english ? "Play once" : "正常播放"
    case .repeatAll: return english ? "Repeat all" : "列表循环"
    case .repeatOne: return english ? "Repeat one" : "单曲循环"
    case .shuffle: return english ? "Shuffle" : "随机播放"
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

  private var moreControls: some View {
    Menu {
      Button {
        showEqualizer = true
      } label: {
        Label(model.language == "en" ? "Equalizer" : "均衡器", systemImage: "slider.horizontal.3")
      }
      Button {
        onAction(["action": "externalMetadataRefresh"])
      } label: {
        Label(
          model.language == "en" ? "Refresh external metadata" : "重新获取外源数据",
          systemImage: "arrow.clockwise"
        )
      }
      .disabled(model.metadataLoading)
    } label: {
      Image(systemName: "ellipsis")
        .font(.system(size: 17, weight: .bold))
        .foregroundColor(echoInk)
        .frame(width: 44, height: 44)
        .echoGlass(tint: Color.white.opacity(0.12), in: Circle())
    }
    .accessibilityLabel(model.language == "en" ? "More playback controls" : "更多播放控制")
  }

  private var outputControl: some View {
    VStack(spacing: 7) {
      Picker("", selection: Binding(
        get: { outputSource },
        set: { onAction(["action": "outputSource", "mode": $0]) }
      )) {
        Text(model.language == "en" ? "Local" : "本地").tag("local")
        Text(model.language == "en" ? "Media" : "流媒体").tag("streaming")
        Text("ECHO").tag("echo")
        Text(model.language == "en" ? "Remote" : "远程").tag("remote")
      }
      .pickerStyle(.segmented)

      if outputSource == "echo" || outputSource == "remote" {
        Picker("", selection: Binding(
          get: { model.outputMode },
          set: { onAction(["action": "output", "mode": $0]) }
        )) {
          Text(model.language == "en" ? "Control" : "控制")
            .tag(outputSource == "echo" ? "pc" : "remoteControl")
          Text(model.language == "en" ? "Stream" : "串流")
            .tag(outputSource == "echo" ? "phone" : "remoteStream")
        }
        .pickerStyle(.segmented)
        .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .tint(echoAccent)
    .accessibilityLabel(model.language == "en" ? "Playback output" : "播放输出")
    .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: outputSource)
  }

  private var outputSource: String {
    switch model.outputMode {
    case "local": return "local"
    case "streaming": return "streaming"
    case "remoteControl", "remoteStream": return "remote"
    default: return "echo"
    }
  }

  private var showsConnectionStatus: Bool {
    outputSource == "echo" || outputSource == "remote"
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

  private func iconButton(
    symbol: String,
    label: String,
    active: Bool,
    value: String? = nil,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      ZStack {
        Image(systemName: symbol)
          .id(symbol)
          .transition(.asymmetric(
            insertion: .scale(scale: 0.62).combined(with: .opacity),
            removal: .scale(scale: 1.28).combined(with: .opacity)
          ))
      }
      .font(.system(size: 16, weight: .semibold))
      .foregroundColor(active ? echoAccent : echoInk)
      .frame(width: 44, height: 44)
      .echoGlass(
        tint: active ? Color.black.opacity(0.14) : Color.white.opacity(0.12),
        clear: !active,
        in: Circle()
      )
    }
    .buttonStyle(.plain)
    .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.7), value: symbol)
    .accessibilityLabel(label)
    .accessibilityValue(value ?? (active
      ? (model.language == "en" ? "On" : "已开启")
      : (model.language == "en" ? "Off" : "已关闭")))
  }

  private func formatTime(_ milliseconds: Double) -> String {
    let seconds = max(0, Int(milliseconds / 1000))
    return String(format: "%d:%02d", seconds / 60, seconds % 60)
  }

  private var artistLabel: String {
    let artist = model.artist.trimmingCharacters(in: .whitespacesAndNewlines)
    return artist.isEmpty ? (model.language == "en" ? "Unknown Artist" : "未知艺术家") : artist
  }

  private var albumLabel: String {
    let album = model.album.trimmingCharacters(in: .whitespacesAndNewlines)
    return album.isEmpty ? (model.language == "en" ? "Unknown Album" : "未知专辑") : album
  }

  private var titleLabel: String {
    let title = model.title.trimmingCharacters(in: .whitespacesAndNewlines)
    return title.isEmpty ? (model.language == "en" ? "No song is playing" : "没有正在播放的歌曲") : title
  }
}

private struct EchoNativeProgressControl: View {
  @ObservedObject var clock: EchoNativePlaybackClockModel
  let controlsEnabled: Bool
  let durationMs: Double
  let language: String
  let onSeek: (Double) -> Void
  @State private var isSeeking = false
  @State private var seekValue = 0.0

  var body: some View {
    VStack(spacing: 4) {
      Slider(
        value: $seekValue,
        in: 0...max(1, durationMs),
        onEditingChanged: { editing in
          isSeeking = editing
          if !editing { onSeek(seekValue) }
        }
      )
      .tint(echoAccent)
      .disabled(!controlsEnabled || durationMs <= 0)
      .accessibilityLabel(language == "en" ? "Playback position" : "播放进度")
      .accessibilityValue("\(formatTime(seekValue)) / \(formatTime(durationMs))")
      HStack {
        Text(formatTime(seekValue))
        Spacer()
        Text(formatTime(durationMs))
      }
      .font(.system(size: 10, weight: .medium, design: .monospaced))
      .foregroundColor(echoInk.opacity(0.48))
    }
    .onAppear { seekValue = min(clock.positionMs, max(0, durationMs)) }
    .onChange(of: clock.positionMs) { value in
      if !isSeeking { seekValue = min(value, max(0, durationMs)) }
    }
    .onChange(of: durationMs) { value in
      if !isSeeking { seekValue = min(clock.positionMs, max(0, value)) }
    }
  }

  private func formatTime(_ milliseconds: Double) -> String {
    let seconds = max(0, Int(milliseconds / 1000))
    return String(format: "%d:%02d", seconds / 60, seconds % 60)
  }
}

private struct EchoNativeArtworkLoadingBadge: View {
  let language: String
  let compact: Bool

  var body: some View {
    ProgressView()
      .progressViewStyle(.circular)
      .tint(echoInk)
      .scaleEffect(compact ? 0.82 : 1)
      .frame(width: compact ? 36 : 46, height: compact ? 36 : 46)
      .echoGlass(
        tint: Color.white.opacity(0.18),
        clear: false,
        interactive: false,
        in: Circle()
      )
      .shadow(color: Color.black.opacity(0.1), radius: 10, y: 4)
      .accessibilityLabel(language == "en" ? "Loading artwork and lyrics" : "正在加载封面和歌词")
  }
}

private struct EchoNativeArtworkBackdrop: View {
  let enabled: Bool
  let identity: String
  let urlString: String
  let onError: () -> Void
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.colorScheme) private var colorScheme
  @State private var stableIdentity = ""
  @State private var stableUrl = ""

  var body: some View {
    GeometryReader { geometry in
      ZStack {
        echoWarmBackground

        if !stableUrl.isEmpty {
          artworkLayer(url: stableUrl, size: geometry.size, showsPlaceholder: false)
            .transition(.opacity)
        }

        if !urlString.isEmpty && (urlString != stableUrl || identity != stableIdentity) {
          artworkLayer(
            url: urlString,
            size: geometry.size,
            showsPlaceholder: false,
            onLoad: {
              stableIdentity = identity
              stableUrl = urlString
            },
            onFailure: {
              if stableIdentity != identity {
                stableIdentity = identity
                stableUrl = ""
              }
              onError()
            }
          )
          .id("\(identity)::\(urlString)")
        }

        LinearGradient(
          colors: colorScheme == .dark
            ? [Color.black.opacity(0.3), Color.black.opacity(0.18), Color.black.opacity(0.24)]
            : [
              Color.white.opacity(0.18),
              Color(red: 0.98, green: 0.90, blue: 0.86).opacity(0.12),
              Color.white.opacity(0.1),
            ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      }
      .frame(width: geometry.size.width, height: geometry.size.height)
      .clipped()
    }
    .animation(reduceMotion ? nil : .easeInOut(duration: 0.5), value: stableUrl)
    .onChange(of: identity) { _ in
      if urlString.isEmpty {
        stableIdentity = identity
        stableUrl = ""
      }
    }
    .onChange(of: urlString) { value in
      if value.isEmpty && (!enabled || stableIdentity != identity) {
        stableIdentity = identity
        stableUrl = ""
      }
    }
    .onChange(of: enabled) { value in
      if !value {
        stableIdentity = identity
        stableUrl = ""
      }
    }
  }

  private func artworkLayer(
    url: String,
    size: CGSize,
    showsPlaceholder: Bool,
    onLoad: @escaping () -> Void = {},
    onFailure: @escaping () -> Void = {}
  ) -> some View {
    EchoNativeArtwork(
      urlString: url,
      squarePreview: false,
      showsPlaceholder: showsPlaceholder,
      onLoad: onLoad,
      onError: onFailure
    )
    .frame(width: size.width, height: size.height)
    .scaledToFill()
    .scaleEffect(1.06)
    .saturation(1.04)
    .blur(radius: 18, opaque: true)
    .clipped()
  }
}

private struct EchoNativeExternalSourcePicker: View {
  let payload: EchoNativeExternalSourcePickerPayload
  let onAction: ([String: Any]) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var selectedSources: [String: String] = [:]

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 6) {
          Text(payload.title)
            .font(.system(size: 24, weight: .bold, design: .rounded))
          Text(payload.subtitle)
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(echoInk.opacity(0.56))
        }
        Spacer(minLength: 8)
        Button {
          onAction(["action": "externalSourcePickerDismiss"])
          dismiss()
        } label: {
          Image(systemName: "xmark")
            .font(.system(size: 13, weight: .bold))
            .frame(width: 44, height: 44)
            .echoGlass(tint: Color.white.opacity(0.12), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(payload.cancelLabel)
      }

      ScrollView(showsIndicators: false) {
        LazyVStack(spacing: 0) {
          ForEach(Array(payload.candidates.enumerated()), id: \.element.id) { index, candidate in
          VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 13) {
              EchoNativeArtwork(urlString: candidate.albumArt ?? "", onError: {})
                .frame(width: 58, height: 58)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

              VStack(alignment: .leading, spacing: 5) {
                Text(candidate.title)
                  .font(.system(size: 15, weight: .bold))
                  .foregroundColor(echoInk)
                  .lineLimit(1)
                Text([candidate.artist ?? "", candidate.sourceLabel]
                  .filter { !$0.isEmpty }
                  .joined(separator: " · "))
                  .font(.system(size: 12, weight: .semibold))
                  .foregroundColor(echoInk.opacity(0.5))
                  .lineLimit(1)
              }
              Spacer(minLength: 8)
              Text(candidate.availableLabel)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(echoInk.opacity(0.46))
                .multilineTextAlignment(.trailing)
            }

            HStack(spacing: 8) {
              fieldButton(
                field: "lyrics",
                label: payload.lyricsLabel,
                available: candidate.hasLyrics,
                candidate: candidate
              )
              fieldButton(
                field: "artist",
                label: payload.artistLabel,
                available: candidate.hasArtist,
                candidate: candidate
              )
              fieldButton(
                field: "albumArt",
                label: payload.artworkLabel,
                available: candidate.hasArtwork,
                candidate: candidate
              )
            }
          }
          .padding(.vertical, 12)

          if index < payload.candidates.count - 1 {
            Divider().opacity(0.45)
          }
          }
        }
      }
      .frame(maxHeight: .infinity, alignment: .top)

      HStack(spacing: 10) {
        Button {
          onAction(["action": "externalSourcePickerIgnore"])
          dismiss()
        } label: {
          Text(payload.ignoreLabel)
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(echoInk.opacity(0.68))
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .echoGlass(tint: Color.white.opacity(0.1), clear: false, in: Capsule())
        }
        .buttonStyle(.plain)

        Button {
          onAction([
            "action": "externalFieldSourcesSelect",
            "selections": selectedSources,
          ])
          dismiss()
        } label: {
          Text(payload.doneLabel)
            .font(.system(size: 15, weight: .bold))
            .foregroundColor(Color.white)
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .echoGlass(tint: echoAccent.opacity(0.72), clear: false, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(!selectionComplete)
        .opacity(selectionComplete ? 1 : 0.38)
      }
    }
    .padding(22)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .foregroundColor(echoInk)
    .background(echoWarmBackground.ignoresSafeArea())
    .interactiveDismissDisabled()
    .onAppear {
      for field in requiredFields where selectedSources[field] == nil {
        selectedSources[field] = preferredCandidate(for: field)?.id
      }
    }
  }

  private var requiredFields: [String] {
    var fields: [String] = []
    if payload.candidates.contains(where: { $0.hasLyrics }) { fields.append("lyrics") }
    if payload.candidates.contains(where: { $0.hasArtist }) { fields.append("artist") }
    if payload.candidates.contains(where: { $0.hasArtwork }) { fields.append("albumArt") }
    return fields
  }

  private var selectionComplete: Bool {
    requiredFields.allSatisfy { selectedSources[$0] != nil }
  }

  private func preferredCandidate(for field: String) -> EchoNativeExternalSourceCandidate? {
    let sources = field == "lyrics"
      ? ["lrclib", "lrcapi", "netease"]
      : field == "albumArt" ? ["netease", "lrcapi", "lrclib"] : ["lrcapi", "netease", "lrclib"]
    let available: (EchoNativeExternalSourceCandidate) -> Bool = { candidate in
      field == "lyrics" ? candidate.hasLyrics : field == "artist" ? candidate.hasArtist : candidate.hasArtwork
    }
    for source in sources {
      if let candidate = payload.candidates.first(where: { $0.source == source && available($0) }) {
        return candidate
      }
    }
    return payload.candidates.first(where: available)
  }

  private func fieldButton(
    field: String,
    label: String,
    available: Bool,
    candidate: EchoNativeExternalSourceCandidate
  ) -> some View {
    let selected = selectedSources[field] == candidate.id
    return Button {
      selectedSources[field] = candidate.id
    } label: {
      VStack(spacing: 3) {
        Text(label)
          .font(.system(size: 12, weight: .bold))
        Text(available ? (selected ? payload.selectedLabel : payload.useSourceLabel) : payload.unavailableLabel)
          .font(.system(size: 9, weight: .semibold))
          .lineLimit(1)
          .minimumScaleFactor(0.75)
      }
      .foregroundColor(selected ? Color.white : echoInk.opacity(available ? 0.72 : 0.28))
      .frame(maxWidth: .infinity)
      .padding(.vertical, 8)
      .background(selected ? echoAccent : Color.clear, in: RoundedRectangle(cornerRadius: 12))
      .overlay(RoundedRectangle(cornerRadius: 12).stroke(echoInk.opacity(available ? 0.14 : 0.06), lineWidth: 0.8))
    }
    .buttonStyle(.plain)
    .disabled(!available)
    .accessibilityLabel("\(label), \(available ? payload.useSourceLabel : payload.unavailableLabel), \(candidate.sourceLabel)")
  }
}

private struct EchoNativeQueueSheet: View {
  @ObservedObject var model: EchoNativePlayerModel
  let onAction: ([String: Any]) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var showClearConfirmation = false

  var body: some View {
    VStack(spacing: 14) {
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text(model.queuePayload?.title ?? (model.language == "en" ? "Queue" : "播放列表"))
            .font(.system(size: 24, weight: .bold, design: .rounded))
          if let subtitle = model.queuePayload?.subtitle, !subtitle.isEmpty {
            Text(subtitle)
              .font(.system(size: 11, weight: .semibold))
              .foregroundColor(echoInk.opacity(0.5))
              .lineLimit(1)
          }
        }
        Spacer()
        if model.queuePayload?.canEdit == true, !(model.queuePayload?.items.isEmpty ?? true) {
          Button(model.queuePayload?.clearLabel ?? (model.language == "en" ? "Clear" : "清空")) {
            if model.queuePayload?.playlistId.isEmpty == false {
              showClearConfirmation = true
            } else {
              clearQueue()
            }
          }
          .font(.system(size: 12, weight: .bold))
          .foregroundColor(echoAccent)
          .padding(.horizontal, 12)
          .frame(minHeight: 44)
          .contentShape(Capsule())
          .echoGlass(tint: Color.white.opacity(0.1), in: Capsule())
          .buttonStyle(.plain)
        }
        Button {
          dismiss()
        } label: {
          Image(systemName: "xmark")
            .font(.system(size: 13, weight: .bold))
            .frame(width: 44, height: 44)
            .echoGlass(tint: Color.white.opacity(0.12), in: Circle())
        }
        .buttonStyle(.plain)
      }

      if let payload = model.queuePayload, !payload.items.isEmpty {
        ScrollView(.vertical, showsIndicators: true) {
          LazyVStack(spacing: 0) {
            ForEach(Array(payload.items.enumerated()), id: \.element.id) { index, item in
              HStack(spacing: 10) {
                Button {
                  dismiss()
                  onAction([
                    "action": "queuePlay",
                    "id": item.trackId,
                    "playlistId": payload.playlistId,
                    "source": item.source,
                  ])
                } label: {
                  HStack(spacing: 11) {
                    Group {
                      if item.current {
                        Image(systemName: "play.circle.fill")
                          .font(.system(size: 19, weight: .bold))
                      } else {
                        Text(String(format: "%02d", index + 1))
                          .font(.system(size: 11, weight: .bold, design: .monospaced))
                      }
                    }
                    .foregroundColor(item.current ? echoAccent : echoInk.opacity(0.36))
                    .frame(width: 26)
                    VStack(alignment: .leading, spacing: 3) {
                      Text(item.title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(item.current ? echoAccent : echoInk)
                        .lineLimit(1)
                      Text(item.meta.isEmpty ? item.artist : "\(item.artist) · \(item.meta)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(echoInk.opacity(0.48))
                        .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                  }
                  .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if payload.canEdit {
                  queueButton(
                    symbol: "chevron.up",
                    label: payload.moveUpLabel,
                    disabled: index == 0
                  ) {
                    onAction([
                      "action": "queueMove",
                      "id": item.trackId,
                      "index": index,
                      "playlistId": payload.playlistId,
                      "source": item.source,
                      "value": -1,
                    ])
                  }
                  queueButton(
                    symbol: "chevron.down",
                    label: payload.moveDownLabel,
                    disabled: index == payload.items.count - 1
                  ) {
                    onAction([
                      "action": "queueMove",
                      "id": item.trackId,
                      "index": index,
                      "playlistId": payload.playlistId,
                      "source": item.source,
                      "value": 1,
                    ])
                  }
                  queueButton(symbol: "xmark", label: payload.removeLabel) {
                    onAction([
                      "action": "queueRemove",
                      "id": item.trackId,
                      "index": index,
                      "playlistId": payload.playlistId,
                      "source": item.source,
                    ])
                  }
                }
              }
              .padding(.vertical, 11)
              .padding(.horizontal, 7)
              .background(item.current ? echoAccent.opacity(0.08) : Color.clear, in: RoundedRectangle(cornerRadius: 13))
              .overlay(alignment: .bottom) {
                Rectangle().fill(echoInk.opacity(0.08)).frame(height: 0.7)
              }
            }
          }
        }
        .frame(maxHeight: .infinity)
      } else {
        VStack(spacing: 12) {
          Image(systemName: "music.note.list")
            .font(.system(size: 28, weight: .medium))
          Text(model.queuePayload?.emptyLabel ?? (model.language == "en" ? "The queue is empty." : "当前播放列表暂无内容。"))
            .font(.system(size: 13, weight: .semibold))
        }
        .foregroundColor(echoInk.opacity(0.42))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .padding(20)
    .foregroundColor(echoInk)
    .background(Color.clear)
    .confirmationDialog(
      model.language == "en" ? "Clear this playlist?" : "清空这个歌单？",
      isPresented: $showClearConfirmation,
      titleVisibility: .visible
    ) {
      Button(model.queuePayload?.clearLabel ?? (model.language == "en" ? "Clear" : "清空"), role: .destructive) {
        clearQueue()
      }
      Button(model.language == "en" ? "Cancel" : "取消", role: .cancel) {}
    } message: {
      Text(model.language == "en" ? "This removes every track from the saved playlist." : "这会从已保存歌单中移除全部歌曲。")
    }
  }

  private func clearQueue() {
    onAction([
      "action": "queueClear",
      "playlistId": model.queuePayload?.playlistId ?? "",
      "source": model.queuePayload?.source ?? "echo",
    ])
  }

  private func queueButton(
    symbol: String,
    label: String,
    disabled: Bool = false,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 12, weight: .bold))
        .frame(width: 44, height: 44)
        .echoGlass(tint: Color.white.opacity(0.1), in: Circle())
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .opacity(disabled ? 0.3 : 1)
    .accessibilityLabel(label)
  }
}

struct EchoNativeArtwork: View {
  let urlString: String
  var squarePreview = true
  var showsPlaceholder = true
  var onLoad: () -> Void = {}
  let onError: () -> Void
  @StateObject private var localLoader = EchoNativeLocalArtworkLoader()

  @ViewBuilder
  var body: some View {
    if squarePreview {
      GeometryReader { geometry in
        artworkContent
          .frame(width: geometry.size.width, height: geometry.size.height)
          .clipped()
      }
      .aspectRatio(1, contentMode: .fit)
      .clipped()
    } else {
      artworkContent
    }
  }

  @ViewBuilder
  private var artworkContent: some View {
    if let url = URL(string: urlString), url.isFileURL {
      Group {
        if let image = localLoader.image {
          Image(uiImage: image).resizable().scaledToFill().onAppear(perform: onLoad)
        } else {
          fallback
        }
      }
      .onAppear { localLoader.load(url, maxPixelSize: localArtworkPixelSize) }
      .onChange(of: urlString) { _ in localLoader.load(url, maxPixelSize: localArtworkPixelSize) }
      .onChange(of: localLoader.failed) { failed in
        if failed { onError() }
      }
    } else if let url = URL(string: urlString), !urlString.isEmpty {
      AsyncImage(url: url) { phase in
        switch phase {
        case .success(let image):
          image.resizable().scaledToFill().onAppear(perform: onLoad)
        case .failure:
          fallback.onAppear(perform: onError)
        default:
          fallback
        }
      }
    } else {
      fallback
    }
  }

  private var localArtworkPixelSize: CGFloat { squarePreview ? 900 : 1_600 }

  @ViewBuilder
  private var fallback: some View {
    if showsPlaceholder { placeholder } else { Color.clear }
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

private final class EchoNativeLocalArtworkLoader: ObservableObject {
  private static let cache: NSCache<NSString, UIImage> = {
    let cache = NSCache<NSString, UIImage>()
    cache.countLimit = 60
    cache.totalCostLimit = 64 * 1024 * 1024
    return cache
  }()
  @Published var failed = false
  @Published var image: UIImage?
  private var requestedKey = ""

  func load(_ url: URL, maxPixelSize: CGFloat) {
    let path = url.path
    let pixelSize = max(1, Int(maxPixelSize.rounded()))
    let key = "\(path)::\(pixelSize)"
    guard key != requestedKey || image == nil else { return }
    requestedKey = key
    failed = false
    if let cached = Self.cache.object(forKey: key as NSString) {
      image = cached
      return
    }
    image = nil
    DispatchQueue.global(qos: .userInitiated).async {
      let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceThumbnailMaxPixelSize: pixelSize,
      ]
      let decoded = CGImageSourceCreateWithURL(url as CFURL, nil)
        .flatMap { CGImageSourceCreateThumbnailAtIndex($0, 0, options as CFDictionary) }
        .map { UIImage(cgImage: $0) }
      DispatchQueue.main.async { [weak self] in
        guard let self, self.requestedKey == key else { return }
        if let decoded {
          let cost = decoded.cgImage.map { $0.bytesPerRow * $0.height } ?? 0
          Self.cache.setObject(decoded, forKey: key as NSString, cost: cost)
          self.image = decoded
        } else {
          self.failed = true
        }
      }
    }
  }
}

struct EchoNativeEqualizerSheet: View {
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
            .frame(width: 44, height: 44)
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
                  onChange: { gain, commit in
                    activeBand = index
                    model.preset = "custom"
                    model.gains[index] = gain
                    onAction(["action": "eqChange", "commit": commit, "index": index, "value": gain])
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
  let onChange: (Double, Bool) -> Void

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
        .gesture(DragGesture(minimumDistance: 0)
          .onChanged { value in onChange(gain(at: value.location.y, height: geometry.size.height), false) }
          .onEnded { value in onChange(gain(at: value.location.y, height: geometry.size.height), true) }
        )
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
      onChange(min(12, max(-12, gain + delta)), true)
    }
  }

  private func gain(at y: CGFloat, height: CGFloat) -> Double {
    let ratio = min(1, max(0, y / max(1, height)))
    return ((12 - Double(ratio) * 24) * 2).rounded() / 2
  }
}
