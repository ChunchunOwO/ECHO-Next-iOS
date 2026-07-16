import AVFoundation
import AVFAudio
import AudioToolbox
import ExpoModulesCore
import Foundation
import MediaPlayer
import UIKit

private enum NowPlayingRemoteCommand: String {
  case next
  case pause
  case play
  case previous
  case seek
  case toggle
}

private struct NowPlayingMetadata {
  let album: String
  let artist: String
  let duration: Double
  let isPlaying: Bool
  let position: Double
  let title: String
}

private final class NowPlayingController {
  typealias CommandHandler = (NowPlayingRemoteCommand, Double?) -> Void

  private let commandCenter = MPRemoteCommandCenter.shared()
  private let onCommand: CommandHandler
  private var artwork: MPMediaItemArtwork?
  private var artworkFetchTask: URLSessionDataTask?
  private var artworkURL = ""
  private var isActive = false
  private var metadata: NowPlayingMetadata?
  private var targetTokens: [(MPRemoteCommand, Any)] = []

  init(onCommand: @escaping CommandHandler) {
    self.onCommand = onCommand
    configureRemoteCommands()
  }

  deinit {
    artworkFetchTask?.cancel()
    targetTokens.forEach { command, token in
      command.removeTarget(token)
    }
  }

  func update(
    title: String,
    artist: String,
    album: String,
    artworkURL: String,
    duration: Double,
    position: Double,
    isPlaying: Bool
  ) {
    isActive = true
    setRemoteCommandsEnabled(true)
    metadata = NowPlayingMetadata(
      album: album,
      artist: artist,
      duration: max(0, duration),
      isPlaying: isPlaying,
      position: max(0, position),
      title: title
    )
    activateAudioSession()

    let nextArtworkURL = artworkURL.trimmingCharacters(in: .whitespacesAndNewlines)
    if nextArtworkURL != self.artworkURL {
      self.artworkURL = nextArtworkURL
      artwork = nil
      artworkFetchTask?.cancel()
      artworkFetchTask = nil
      loadArtwork(from: nextArtworkURL)
    }
    publish()
  }

  func clear() {
    isActive = false
    setRemoteCommandsEnabled(false)
    metadata = nil
    artwork = nil
    artworkURL = ""
    artworkFetchTask?.cancel()
    artworkFetchTask = nil
    DispatchQueue.main.async {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
  }

  private func configureRemoteCommands() {
    addTarget(commandCenter.playCommand, action: .play)
    addTarget(commandCenter.pauseCommand, action: .pause)
    addTarget(commandCenter.togglePlayPauseCommand, action: .toggle)
    addTarget(commandCenter.nextTrackCommand, action: .next)
    addTarget(commandCenter.previousTrackCommand, action: .previous)

    let seekToken = commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else {
        return .commandFailed
      }
      return self?.handle(.seek, position: event.positionTime) ?? .commandFailed
    }
    targetTokens.append((commandCenter.changePlaybackPositionCommand, seekToken))
    setRemoteCommandsEnabled(false)
  }

  private func addTarget(_ command: MPRemoteCommand, action: NowPlayingRemoteCommand) {
    let token = command.addTarget { [weak self] _ in
      self?.handle(action) ?? .commandFailed
    }
    targetTokens.append((command, token))
  }

  private func setRemoteCommandsEnabled(_ enabled: Bool) {
    commandCenter.playCommand.isEnabled = enabled
    commandCenter.pauseCommand.isEnabled = enabled
    commandCenter.togglePlayPauseCommand.isEnabled = enabled
    commandCenter.nextTrackCommand.isEnabled = enabled
    commandCenter.previousTrackCommand.isEnabled = enabled
    commandCenter.changePlaybackPositionCommand.isEnabled = enabled
  }

  private func handle(_ command: NowPlayingRemoteCommand, position: Double? = nil) -> MPRemoteCommandHandlerStatus {
    guard isActive else {
      return .commandFailed
    }
    let handler = onCommand
    DispatchQueue.main.async {
      handler(command, position)
    }
    return .success
  }

  private func publish() {
    guard isActive, let metadata else {
      return
    }
    let duration = metadata.duration
    let position = duration > 0
      ? min(max(0, metadata.position), duration)
      : max(0, metadata.position)
    var nowPlayingInfo: [String: Any] = [
      MPMediaItemPropertyTitle: metadata.title,
      MPMediaItemPropertyPlaybackDuration: duration,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
      MPNowPlayingInfoPropertyPlaybackRate: metadata.isPlaying ? 1.0 : 0.0,
      MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
    ]
    if !metadata.artist.isEmpty {
      nowPlayingInfo[MPMediaItemPropertyArtist] = metadata.artist
    }
    if !metadata.album.isEmpty {
      nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = metadata.album
    }
    if let artwork {
      nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
    }
    DispatchQueue.main.async {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }
  }

  private func loadArtwork(from rawURL: String) {
    guard !rawURL.isEmpty, let url = URL(string: rawURL) else {
      return
    }
    if url.isFileURL {
      DispatchQueue.global(qos: .utility).async { [weak self] in
        guard let data = try? Data(contentsOf: url), let image = UIImage(data: data) else {
          return
        }
        self?.setArtwork(image, for: rawURL)
      }
      return
    }

    artworkFetchTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      guard let data, let image = UIImage(data: data) else {
        return
      }
      self?.setArtwork(image, for: rawURL)
    }
    artworkFetchTask?.resume()
  }

  private func setArtwork(_ image: UIImage, for url: String) {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.isActive, self.artworkURL == url else {
        return
      }
      self.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
      self.publish()
    }
  }

  private func activateAudioSession() {
    #if os(iOS) || os(tvOS)
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playback, mode: .default, options: [])
    try? session.setActive(true)
    #endif
  }
}

private final class DspPlaybackEngine {
  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private let eq = AVAudioUnitEQ(numberOfBands: 10)
  private let dynamics = DspPlaybackEngine.makeDynamicsProcessor()
  private var audioFile: AVAudioFile?
  private var sampleRate: Double = 44_100
  private var durationSeconds: Double = 0
  private var scheduledStartFrame: AVAudioFramePosition = 0
  private var offsetSeconds: Double = 0
  private var playing = false
  private var finished = false
  private var configured = false

  init() {
    configureEqBands(Array(repeating: 0, count: 10))
    configureDynamicsProcessor()
  }

  func playFile(uri: String, positionMs: Double, volume: Double, gains: [Double], loudnessEnabled: Bool) throws {
    guard let url = URL(string: uri), url.isFileURL else {
      throw DspError.invalidUri
    }

    try configureAudioSession()
    let file = try AVAudioFile(forReading: url)
    audioFile = file
    sampleRate = file.processingFormat.sampleRate
    durationSeconds = sampleRate > 0 ? Double(file.length) / sampleRate : 0
    offsetSeconds = max(0, min(positionMs / 1000, durationSeconds))
    scheduledStartFrame = AVAudioFramePosition(offsetSeconds * sampleRate)
    finished = false

    configureGraph(format: file.processingFormat)
    configureEqBands(gains)
    dynamics?.bypass = !loudnessEnabled
    player.volume = Float(max(0, min(1, volume)))

    player.stop()
    player.reset()
    scheduleCurrentFile(shouldMarkFinished: true)

    if !engine.isRunning {
      try engine.start()
    }
    player.play()
    playing = true
  }

  func pause() {
    guard playing else { return }
    offsetSeconds = currentTime()
    player.pause()
    playing = false
  }

  func resume() throws {
    guard audioFile != nil else { return }
    if finished {
      try seekTo(seconds: 0)
    }
    if !engine.isRunning {
      try engine.start()
    }
    player.play()
    playing = true
    finished = false
  }

  func stop() {
    player.stop()
    player.reset()
    playing = false
    finished = false
    offsetSeconds = 0
    scheduledStartFrame = 0
  }

  func seekTo(seconds: Double) throws {
    guard audioFile != nil else { return }
    let wasPlaying = playing
    offsetSeconds = max(0, min(seconds, durationSeconds))
    scheduledStartFrame = AVAudioFramePosition(offsetSeconds * sampleRate)
    finished = false
    player.stop()
    player.reset()
    scheduleCurrentFile(shouldMarkFinished: true)
    if wasPlaying {
      if !engine.isRunning {
        try engine.start()
      }
      player.play()
    }
    playing = wasPlaying
  }

  func setVolume(_ volume: Double) {
    player.volume = Float(max(0, min(1, volume)))
  }

  func setEq(gains: [Double]) {
    configureEqBands(gains)
  }

  func setLoudness(_ enabled: Bool) {
    dynamics?.bypass = !enabled
  }

  func status() -> [String: Any] {
    [
      "currentTime": currentTime(),
      "didJustFinish": finished,
      "duration": durationSeconds,
      "playing": playing,
      "volume": Double(player.volume)
    ]
  }

  private func configureAudioSession() throws {
    #if os(iOS) || os(tvOS)
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playback, mode: .default, options: [])
    try session.setActive(true)
    #endif
  }

  private func configureGraph(format: AVAudioFormat) {
    if !configured {
      engine.attach(player)
      engine.attach(eq)
      if let dynamics {
        engine.attach(dynamics)
      }
      configured = true
    }

    engine.disconnectNodeOutput(player)
    engine.disconnectNodeOutput(eq)
    if let dynamics {
      engine.disconnectNodeOutput(dynamics)
    }
    engine.connect(player, to: eq, format: format)
    if let dynamics {
      engine.connect(eq, to: dynamics, format: format)
      engine.connect(dynamics, to: engine.mainMixerNode, format: format)
    } else {
      engine.connect(eq, to: engine.mainMixerNode, format: format)
    }
  }

  private func scheduleCurrentFile(shouldMarkFinished: Bool) {
    guard let audioFile else { return }
    let startFrame = max(0, min(scheduledStartFrame, audioFile.length))
    let remainingFrames = max(0, audioFile.length - startFrame)
    guard remainingFrames > 0 else {
      playing = false
      finished = shouldMarkFinished
      return
    }

    player.scheduleSegment(
      audioFile,
      startingFrame: startFrame,
      frameCount: AVAudioFrameCount(min(Int64(UInt32.max), remainingFrames)),
      at: nil
    ) { [weak self] in
      DispatchQueue.main.async {
        guard let self else { return }
        self.offsetSeconds = self.durationSeconds
        self.playing = false
        self.finished = shouldMarkFinished
      }
    }
  }

  private func currentTime() -> Double {
    guard playing,
          let nodeTime = player.lastRenderTime,
          let playerTime = player.playerTime(forNodeTime: nodeTime),
          sampleRate > 0
    else {
      return max(0, min(offsetSeconds, durationSeconds))
    }

    let frame = scheduledStartFrame + AVAudioFramePosition(playerTime.sampleTime)
    return max(0, min(Double(frame) / sampleRate, durationSeconds))
  }

  private func configureEqBands(_ gains: [Double]) {
    let frequencies: [Float] = [31, 63, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000]
    for (index, band) in eq.bands.enumerated() {
      band.filterType = .parametric
      band.frequency = frequencies[index]
      band.bandwidth = 1.1
      band.gain = Float(index < gains.count ? max(-12, min(12, gains[index])) : 0)
      band.bypass = false
    }
    eq.globalGain = 0
  }

  private static func makeDynamicsProcessor() -> AVAudioUnitEffect? {
    AVAudioUnitEffect(audioComponentDescription: AudioComponentDescription(
      componentType: kAudioUnitType_Effect,
      componentSubType: kAudioUnitSubType_DynamicsProcessor,
      componentManufacturer: kAudioUnitManufacturer_Apple,
      componentFlags: 0,
      componentFlagsMask: 0
    ))
  }

  private func configureDynamicsProcessor() {
    guard let dynamics else { return }
    dynamics.bypass = true
    setDynamicsParameter(DynamicsParameter.threshold, value: -18)
    setDynamicsParameter(DynamicsParameter.headRoom, value: 5)
    setDynamicsParameter(DynamicsParameter.expansionRatio, value: 1)
    setDynamicsParameter(DynamicsParameter.expansionThreshold, value: -48)
    setDynamicsParameter(DynamicsParameter.attackTime, value: 0.008)
    setDynamicsParameter(DynamicsParameter.releaseTime, value: 0.18)
    setDynamicsParameter(DynamicsParameter.masterGain, value: 2)
  }

  private func setDynamicsParameter(_ parameterID: AudioUnitParameterID, value: Float) {
    guard
      let dynamics,
      let parameter = dynamics.auAudioUnit.parameterTree?.parameter(withAddress: AUParameterAddress(parameterID))
    else {
      return
    }
    parameter.value = value
  }
}

private enum DynamicsParameter {
  static let threshold: AudioUnitParameterID = 0
  static let headRoom: AudioUnitParameterID = 1
  static let expansionRatio: AudioUnitParameterID = 2
  static let expansionThreshold: AudioUnitParameterID = 3
  static let attackTime: AudioUnitParameterID = 4
  static let releaseTime: AudioUnitParameterID = 5
  static let masterGain: AudioUnitParameterID = 6
}

private enum DspError: Error {
  case invalidUri
}

public final class EchoAudioDspModule: Module {
  private let playbackEngine = DspPlaybackEngine()
  private lazy var nowPlayingController = NowPlayingController { [weak self] command, position in
    var payload: [String: Any?] = ["action": command.rawValue]
    if let position {
      payload["positionSeconds"] = position
    }
    self?.sendEvent("onRemoteCommand", payload)
  }

  public func definition() -> ModuleDefinition {
    Name("EchoAudioDsp")
    Events("onRemoteCommand")

    View(EchoNativePlayerView.self) {
      Events("onAction")

      Prop("activeLyricIndex") { (view: EchoNativePlayerView, value: Int) in setIfChanged(view.model, \.activeLyricIndex, value) }
      Prop("activePage") { (view: EchoNativePlayerView, value: String) in setIfChanged(view.model, \.activePage, value) }
      Prop("artist") { (view: EchoNativePlayerView, value: String) in setIfChanged(view.model, \.artist, value) }
      Prop("artworkBackgroundEnabled") { (view: EchoNativePlayerView, value: Bool) in setIfChanged(view.model, \.artworkBackgroundEnabled, value) }
      Prop("artworkUrl") { (view: EchoNativePlayerView, value: String) in setIfChanged(view.model, \.artworkUrl, value) }
      Prop("connectionLabel") { (view: EchoNativePlayerView, value: String) in setIfChanged(view.model, \.connectionLabel, value) }
      Prop("connectionOnline") { (view: EchoNativePlayerView, value: Bool) in setIfChanged(view.model, \.connectionOnline, value) }
      Prop("controlsEnabled") { (view: EchoNativePlayerView, value: Bool) in setIfChanged(view.model, \.controlsEnabled, value) }
      Prop("durationMs") { (view: EchoNativePlayerView, value: Double) in setIfChanged(view.model, \.durationMs, value) }
      Prop("externalSourcePickerPayload") { (view: EchoNativePlayerView, value: String) in
        view.model.updateExternalSourcePicker(payloadJSON: value)
      }
      Prop("isFavorite") { (view: EchoNativePlayerView, value: Bool) in setIfChanged(view.model, \.isFavorite, value) }
      Prop("eqGains") { (view: EchoNativePlayerView, value: [Double]) in
        let gains = normalizedNativeEqGains(value)
        setIfChanged(view.model.equalizer, \.gains, gains)
        setIfChanged(view.pagesModel.equalizer, \.gains, gains)
      }
      Prop("eqPreset") { (view: EchoNativePlayerView, value: String) in
        setIfChanged(view.model.equalizer, \.preset, value)
        setIfChanged(view.pagesModel.equalizer, \.preset, value)
      }
      Prop("isPlaying") { (view: EchoNativePlayerView, value: Bool) in setIfChanged(view.model, \.isPlaying, value) }
      Prop("language") { (view: EchoNativePlayerView, value: String) in
        setIfChanged(view.model, \.language, value)
        setIfChanged(view.model.equalizer, \.language, value)
        setIfChanged(view.pagesModel.equalizer, \.language, value)
      }
      Prop("lyricTexts") { (view: EchoNativePlayerView, value: [String]) in setIfChanged(view.model, \.lyricTexts, value) }
      Prop("lyricTimesMs") { (view: EchoNativePlayerView, value: [Double]) in setIfChanged(view.model, \.lyricTimesMs, value) }
      Prop("lyricsVisible") { (view: EchoNativePlayerView, value: Bool) in setIfChanged(view.model, \.lyricsVisible, value) }
      Prop("metadataLoading") { (view: EchoNativePlayerView, value: Bool) in setIfChanged(view.model, \.metadataLoading, value) }
      Prop("modeLabel") { (view: EchoNativePlayerView, value: String) in setIfChanged(view.model, \.modeLabel, value) }
      Prop("outputMode") { (view: EchoNativePlayerView, value: String) in setIfChanged(view.model, \.outputMode, value) }
      Prop("pagePayload") { (view: EchoNativePlayerView, value: String) in view.pagesModel.update(payloadJSON: value) }
      Prop("positionMs") { (view: EchoNativePlayerView, value: Double) in setIfChanged(view.model, \.positionMs, value) }
      Prop("queueCount") { (view: EchoNativePlayerView, value: Int) in setIfChanged(view.model, \.queueCount, value) }
      Prop("queuePayload") { (view: EchoNativePlayerView, value: String) in view.model.updateQueue(payloadJSON: value) }
      Prop("repeatOne") { (view: EchoNativePlayerView, value: Bool) in setIfChanged(view.model, \.repeatOne, value) }
      Prop("showArtworkGlow") { (view: EchoNativePlayerView, value: Bool) in setIfChanged(view.model, \.showArtworkGlow, value) }
      Prop("tags") { (view: EchoNativePlayerView, value: [String]) in setIfChanged(view.model, \.tags, value) }
      Prop("title") { (view: EchoNativePlayerView, value: String) in setIfChanged(view.model, \.title, value) }
      Prop("volume") { (view: EchoNativePlayerView, value: Double) in setIfChanged(view.model, \.volume, value) }
    }

    View(EchoNativeEqLauncherView.self) {
      Events("onAction")

      Prop("description") { (view: EchoNativeEqLauncherView, value: String) in setIfChanged(view.model, \.description, value) }
      Prop("eqGains") { (view: EchoNativeEqLauncherView, value: [Double]) in
        setIfChanged(view.model.equalizer, \.gains, normalizedNativeEqGains(value))
      }
      Prop("eqPreset") { (view: EchoNativeEqLauncherView, value: String) in setIfChanged(view.model.equalizer, \.preset, value) }
      Prop("label") { (view: EchoNativeEqLauncherView, value: String) in setIfChanged(view.model, \.label, value) }
      Prop("language") { (view: EchoNativeEqLauncherView, value: String) in setIfChanged(view.model.equalizer, \.language, value) }
      Prop("title") { (view: EchoNativeEqLauncherView, value: String) in setIfChanged(view.model, \.title, value) }
    }

    AsyncFunction("playFile") { (uri: String, positionMs: Double, volume: Double, gains: [Double], loudnessEnabled: Bool) in
      try self.playbackEngine.playFile(
        uri: uri,
        positionMs: positionMs,
        volume: volume,
        gains: gains,
        loudnessEnabled: loudnessEnabled
      )
    }

    AsyncFunction("pause") {
      self.playbackEngine.pause()
    }

    AsyncFunction("resume") {
      try self.playbackEngine.resume()
    }

    AsyncFunction("stop") {
      self.playbackEngine.stop()
    }

    AsyncFunction("seekTo") { (seconds: Double) in
      try self.playbackEngine.seekTo(seconds: seconds)
    }

    AsyncFunction("setVolume") { (volume: Double) in
      self.playbackEngine.setVolume(volume)
    }

    AsyncFunction("setEq") { (gains: [Double]) in
      self.playbackEngine.setEq(gains: gains)
    }

    AsyncFunction("setLoudness") { (enabled: Bool) in
      self.playbackEngine.setLoudness(enabled)
    }

    AsyncFunction("updateNowPlaying") { (
      title: String,
      artist: String,
      album: String,
      artworkURL: String,
      duration: Double,
      position: Double,
      isPlaying: Bool
    ) in
      self.nowPlayingController.update(
        title: title,
        artist: artist,
        album: album,
        artworkURL: artworkURL,
        duration: duration,
        position: position,
        isPlaying: isPlaying
      )
    }

    AsyncFunction("clearNowPlaying") {
      self.nowPlayingController.clear()
    }

    AsyncFunction("getStatus") { () -> [String: Any] in
      self.playbackEngine.status()
    }

    OnDestroy {
      self.playbackEngine.stop()
      self.nowPlayingController.clear()
    }
  }
}
