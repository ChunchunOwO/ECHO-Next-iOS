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
        dockContent
          .glassEffect(.regular.interactive(), in: Capsule())
      } else {
        materialDock
      }
      #else
      materialDock
      #endif
    }
    .padding(4)
    .preferredColorScheme(.dark)
  }

  private var dockContent: some View {
    HStack(spacing: 6) {
      ForEach(items) { item in
        let active = item.id == model.activePage
        Button {
          guard !active else { return }
          if reduceMotion {
            model.activePage = item.id
          } else {
            withAnimation(.easeOut(duration: 0.22)) {
              model.activePage = item.id
            }
          }
          onAction(["action": "page", "page": item.id])
        } label: {
          VStack(spacing: 2) {
            Image(systemName: item.symbol)
              .font(.system(size: 19, weight: active ? .semibold : .medium))
              .symbolRenderingMode(.hierarchical)
            Text(item.title)
              .font(.system(size: 10, weight: .semibold))
              .lineLimit(1)
          }
          .foregroundColor(active ? .white : .white.opacity(0.5))
          .frame(maxWidth: .infinity, minHeight: 54)
          .background(active ? Color.white.opacity(0.14) : Color.clear, in: Capsule())
          .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.title)
        .accessibilityAddTraits(active ? .isSelected : [])
      }
    }
    .padding(6)
  }

  private var materialDock: some View {
    dockContent
      .background(.ultraThinMaterial, in: Capsule())
      .overlay(Capsule().stroke(Color.white.opacity(0.14), lineWidth: 1))
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
      .background(Color(red: 0.063, green: 0.063, blue: 0.078))
    }
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
          .foregroundColor(.white.opacity(0.45))
        Text(model.modeLabel)
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(.white)
      }
      Spacer()
      HStack(spacing: 6) {
        Circle()
          .fill(model.connectionOnline ? Color.green : Color.red)
          .frame(width: 7, height: 7)
        Text(model.connectionLabel)
          .font(.system(size: 11, weight: .semibold))
          .lineLimit(1)
      }
      .foregroundColor(model.connectionOnline ? .white.opacity(0.76) : .red)
      .padding(.horizontal, 10)
      .frame(height: 30)
      .background(.ultraThinMaterial, in: Capsule())
    }
  }

  @ViewBuilder
  private func artwork(size: CGFloat, compact: Bool) -> some View {
    let cornerRadius: CGFloat = compact ? 20 : 28
    ZStack {
      if model.showArtworkGlow {
        RoundedRectangle(cornerRadius: 32, style: .continuous)
          .fill(Color.green.opacity(0.16))
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
          .stroke(Color.white.opacity(0.12), lineWidth: 1)
      }
    }
    .frame(height: size)
  }

  private func trackDetails(compact: Bool) -> some View {
    VStack(spacing: compact ? 4 : 7) {
      Text(model.title)
        .font(.system(size: compact ? 18 : 21, weight: .bold))
        .foregroundColor(.white)
        .lineLimit(compact ? 1 : 2)
        .minimumScaleFactor(0.8)
        .multilineTextAlignment(.center)
      if !model.artist.isEmpty {
        Text(model.artist)
          .font(.system(size: 12, weight: .medium))
          .foregroundColor(.white.opacity(0.52))
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
              .foregroundColor(.white.opacity(0.72))
              .lineLimit(1)
              .minimumScaleFactor(0.7)
              .padding(.horizontal, 6)
              .frame(maxWidth: .infinity, minHeight: 23)
              .overlay(Capsule().stroke(Color.white.opacity(0.14), lineWidth: 1))
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
      .tint(.white)
      .disabled(!model.controlsEnabled || model.durationMs <= 0)
      .accessibilityLabel(model.language == "en" ? "Playback position" : "播放进度")
      .accessibilityValue("\(formatTime(seekValue)) / \(formatTime(model.durationMs))")
      HStack {
        Text(formatTime(seekValue))
        Spacer()
        Text(formatTime(model.durationMs))
      }
      .font(.system(size: 10, weight: .medium, design: .monospaced))
      .foregroundColor(.white.opacity(0.46))
    }
  }

  private func transportControls(compact: Bool) -> some View {
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
          .foregroundColor(Color(red: 0.063, green: 0.063, blue: 0.078))
          .offset(x: model.isPlaying ? 0 : 2)
          .frame(width: compact ? 66 : 76, height: compact ? 66 : 76)
          .background(Color.white, in: Circle())
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

  private var secondaryControls: some View {
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
            .foregroundColor(.black)
            .padding(3)
            .background(Color.white, in: Circle())
            .offset(x: 3, y: -3)
        }
      }
      Button {
        showEqualizer = true
      } label: {
        Text("EQ")
          .font(.system(size: 12, weight: .bold))
          .foregroundColor(.white)
          .frame(width: 42, height: 42)
          .background(.ultraThinMaterial, in: Circle())
          .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 1))
      }
      .buttonStyle(.plain)
      .accessibilityLabel(model.language == "en" ? "Equalizer" : "均衡器")
    }
  }

  private var volumeControl: some View {
    HStack(spacing: 9) {
      Image(systemName: "speaker.wave.1.fill")
        .font(.system(size: 11, weight: .semibold))
        .foregroundColor(.white.opacity(0.48))
      Slider(
        value: $volumeValue,
        in: 0...1,
        onEditingChanged: { editing in
          isSettingVolume = editing
          onAction(["action": "volume", "value": volumeValue, "commit": !editing])
        }
      )
      .tint(.white.opacity(0.8))
      .disabled(!model.controlsEnabled)
      .accessibilityLabel(model.language == "en" ? "Volume" : "音量")
      .accessibilityValue("\(Int((volumeValue * 100).rounded()))%")
      Text("\(Int((volumeValue * 100).rounded()))%")
        .font(.system(size: 10, weight: .bold, design: .monospaced))
        .foregroundColor(.white.opacity(0.52))
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
    .accessibilityLabel(model.language == "en" ? "Playback output" : "播放输出")
  }

  private func roundButton(symbol: String, label: String, size: CGFloat, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: size * 0.34, weight: .bold))
        .foregroundColor(.white)
        .frame(width: size, height: size)
        .background(.ultraThinMaterial, in: Circle())
        .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 1))
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
        .foregroundColor(active ? .green : .white)
        .frame(width: 42, height: 42)
        .background(active ? Color.green.opacity(0.18) : Color.clear, in: Circle())
        .background(.ultraThinMaterial, in: Circle())
        .overlay(Circle().stroke(active ? Color.green.opacity(0.42) : Color.white.opacity(0.12), lineWidth: 1))
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
      Color.white.opacity(0.06)
      Image(systemName: "waveform")
        .font(.system(size: 34, weight: .medium))
        .foregroundColor(.white.opacity(0.24))
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
          .foregroundColor(.green)
        Image(systemName: "chevron.right")
          .font(.system(size: 12, weight: .bold))
          .foregroundColor(.white.opacity(0.5))
      }
      .padding(.horizontal, 12)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1))
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(model.title), \(model.label)")
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
            .foregroundColor(.white.opacity(0.5))
        }
        Spacer()
        Text(presetLabel(model.preset))
          .font(.system(size: 11, weight: .bold))
          .foregroundColor(.green)
          .padding(.horizontal, 10)
          .frame(height: 28)
          .overlay(Capsule().stroke(Color.green.opacity(0.4), lineWidth: 1))
        Button {
          dismiss()
        } label: {
          Image(systemName: "xmark")
            .font(.system(size: 13, weight: .bold))
            .frame(width: 34, height: 34)
            .background(.ultraThinMaterial, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(model.language == "en" ? "Close equalizer" : "关闭均衡器")
      }

      HStack(alignment: .firstTextBaseline) {
        Text(frequencyLabel(activeBand))
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(.white.opacity(0.58))
        Spacer()
        Text(String(format: "%+.1f dB", model.gains[activeBand]))
          .font(.system(size: 23, weight: .bold, design: .monospaced))
      }
      .padding(.bottom, 10)
      .overlay(alignment: .bottom) { Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1) }

      GeometryReader { geometry in
        let plotHeight = geometry.size.height - 24
        HStack(alignment: .top, spacing: 8) {
          VStack {
            ForEach([12, 6, 0, -6, -12], id: \.self) { gain in
              Text("\(gain > 0 ? "+" : "")\(gain)dB")
                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                .foregroundColor(.white.opacity(0.4))
              if gain != -12 { Spacer() }
            }
          }
          .frame(width: 40, height: plotHeight)

          ZStack(alignment: .top) {
            VStack(spacing: 0) {
              ForEach(0..<5, id: \.self) { index in
                Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1)
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
        HStack(spacing: 8) {
          ForEach(presetKeys, id: \.self) { key in
            Button {
              model.preset = key
              onAction(["action": "eqPreset", "preset": key])
            } label: {
              Text(presetLabel(key))
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(model.preset == key ? .white : .white.opacity(0.56))
                .padding(.horizontal, 13)
                .frame(height: 36)
                .background(model.preset == key ? Color.green.opacity(0.22) : Color.white.opacity(0.07), in: Capsule())
                .overlay(Capsule().stroke(model.preset == key ? Color.green.opacity(0.42) : Color.white.opacity(0.1), lineWidth: 1))
            }
            .buttonStyle(.plain)
          }
        }
      }
    }
    .padding(20)
    .foregroundColor(.white)
    .background(Color(red: 0.063, green: 0.063, blue: 0.078).ignoresSafeArea())
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
            .fill(Color.white.opacity(0.22))
            .frame(width: 2)
          Rectangle()
            .fill(Color.green)
            .frame(width: 2, height: max(2, abs(y - center)))
            .offset(y: min(y, center))
          Circle()
            .fill(Color.green)
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
        .foregroundColor(.white.opacity(0.52))
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
