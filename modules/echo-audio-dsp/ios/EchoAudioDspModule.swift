import AVFoundation
import AVFAudio
import AudioToolbox
import ExpoModulesCore
import Foundation
import MediaPlayer
import UIKit

enum NowPlayingRemoteCommand: String {
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

final class NowPlayingController {
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
    let shouldActivateSession = !isActive
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
    if shouldActivateSession { activateAudioSession() }

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

struct DspPlaybackStatus {
  let channelCount: Int
  let currentTime: Double
  let deviceChannelCount: Int
  let deviceName: String
  let devicePortType: String
  let deviceSampleRate: Double
  let deviceUID: String
  let didJustFinish: Bool
  let duration: Double
  let engineRunning: Bool
  let fileLoaded: Bool
  let ioBufferDurationMs: Double
  let outputLatencyMs: Double
  let outputVolume: Double
  let peakDb: Double
  let playing: Bool
  let rmsDb: Double
  let sampleRate: Double
  let volume: Double
}

final class DspPlaybackEngine {
  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private let eq = AVAudioUnitEQ(numberOfBands: 10)
  private let dynamics = DspPlaybackEngine.makeDynamicsProcessor()
  private let meterLock = NSLock()
  private var audioFile: AVAudioFile?
  private var channelCount: Int = 0
  private var sampleRate: Double = 0
  private var durationSeconds: Double = 0
  private var scheduledStartFrame: AVAudioFramePosition = 0
  private var offsetSeconds: Double = 0
  private var playing = false
  private var finished = false
  private var configured = false
  private var meterInstalled = false
  private var meterPeakDb = -120.0
  private var meterRmsDb = -120.0
  private var scheduleGeneration: UInt64 = 0

  init() {
    configureEqBands(Array(repeating: 0, count: 10))
    configureDynamicsProcessor()
  }

  func playFile(uri: String, positionMs: Double, volume: Double, gains: [Double], loudnessEnabled: Bool) throws {
    scheduleGeneration &+= 1
    if engine.isRunning { engine.stop() }
    player.stop()
    player.reset()
    audioFile = nil
    resetMeter()
    channelCount = 0
    playing = false
    finished = false
    durationSeconds = 0
    sampleRate = 0
    guard let url = URL(string: uri), url.isFileURL else {
      throw DspError.invalidUri
    }

    try configureAudioSession()
    let file = try AVAudioFile(forReading: url)
    audioFile = file
    sampleRate = file.processingFormat.sampleRate
    channelCount = Int(file.processingFormat.channelCount)
    durationSeconds = sampleRate > 0 ? Double(file.length) / sampleRate : 0
    offsetSeconds = max(0, min(positionMs / 1000, durationSeconds))
    scheduledStartFrame = AVAudioFramePosition(offsetSeconds * sampleRate)
    finished = false

    configureGraph(format: file.processingFormat)
    configureEqBands(gains)
    dynamics?.bypass = !loudnessEnabled
    player.volume = Float(max(0, min(1, volume)))

    scheduleCurrentFile(shouldMarkFinished: true)
    guard !finished else { return }

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
    scheduleGeneration &+= 1
    player.stop()
    player.reset()
    if engine.isRunning { engine.stop() }
    audioFile = nil
    resetMeter()
    channelCount = 0
    sampleRate = 0
    durationSeconds = 0
    playing = false
    finished = false
    offsetSeconds = 0
    scheduledStartFrame = 0
  }

  func seekTo(seconds: Double) throws {
    guard audioFile != nil else { return }
    scheduleGeneration &+= 1
    let wasPlaying = playing
    offsetSeconds = max(0, min(seconds, durationSeconds))
    scheduledStartFrame = AVAudioFramePosition(offsetSeconds * sampleRate)
    finished = false
    player.stop()
    player.reset()
    scheduleCurrentFile(shouldMarkFinished: true)
    if wasPlaying && !finished {
      if !engine.isRunning {
        try engine.start()
      }
      player.play()
    }
    playing = wasPlaying && !finished
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

  func playbackStatus() -> DspPlaybackStatus {
    let actuallyPlaying = playing && engine.isRunning && player.isPlaying
    let levels = meterLevels()
    #if os(iOS) || os(tvOS)
    let session = AVAudioSession.sharedInstance()
    let output = session.currentRoute.outputs.first
    let deviceSampleRate = session.sampleRate
    let deviceChannelCount = session.outputNumberOfChannels
    let deviceName = output?.portName ?? ""
    let devicePortType = output?.portType.rawValue ?? ""
    let deviceUID = output?.uid ?? ""
    let ioBufferDurationMs = session.ioBufferDuration * 1_000
    let outputLatencyMs = session.outputLatency * 1_000
    let outputVolume = Double(session.outputVolume)
    #else
    let deviceFormat = engine.outputNode.outputFormat(forBus: 0)
    let deviceSampleRate = deviceFormat.sampleRate
    let deviceChannelCount = Int(deviceFormat.channelCount)
    let deviceName = "System output"
    let devicePortType = "system"
    let deviceUID = "system"
    let ioBufferDurationMs = 0.0
    let outputLatencyMs = 0.0
    let outputVolume = Double(player.volume)
    #endif
    return DspPlaybackStatus(
      channelCount: channelCount,
      currentTime: currentTime(),
      deviceChannelCount: deviceChannelCount,
      deviceName: deviceName,
      devicePortType: devicePortType,
      deviceSampleRate: deviceSampleRate,
      deviceUID: deviceUID,
      didJustFinish: finished,
      duration: durationSeconds,
      engineRunning: engine.isRunning,
      fileLoaded: audioFile != nil,
      ioBufferDurationMs: ioBufferDurationMs,
      outputLatencyMs: outputLatencyMs,
      outputVolume: outputVolume,
      peakDb: actuallyPlaying ? levels.peak : -120,
      playing: actuallyPlaying,
      rmsDb: actuallyPlaying ? levels.rms : -120,
      sampleRate: sampleRate,
      volume: Double(player.volume)
    )
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
    if !meterInstalled {
      engine.mainMixerNode.installTap(onBus: 0, bufferSize: 1_024, format: nil) { [weak self] buffer, _ in
        self?.updateMeter(buffer)
      }
      meterInstalled = true
    }
  }

  private func updateMeter(_ buffer: AVAudioPCMBuffer) {
    guard let channels = buffer.floatChannelData else { return }
    let frames = Int(buffer.frameLength)
    let channelTotal = Int(buffer.format.channelCount)
    guard frames > 0, channelTotal > 0 else { return }
    let bufferTotal = buffer.format.isInterleaved ? 1 : channelTotal
    let samplesPerBuffer = buffer.format.isInterleaved ? frames * channelTotal : frames

    var peak: Float = 0
    var squareSum = 0.0
    var sampleTotal = 0
    for channel in 0..<bufferTotal {
      for sampleIndex in stride(from: 0, to: samplesPerBuffer, by: 4) {
        let sample = channels[channel][sampleIndex]
        peak = max(peak, abs(sample))
        squareSum += Double(sample * sample)
        sampleTotal += 1
      }
    }
    let peakDb = 20 * log10(max(Double(peak), 0.000_001))
    let rmsDb = 20 * log10(max(sqrt(squareSum / Double(max(1, sampleTotal))), 0.000_001))
    meterLock.lock()
    meterPeakDb = max(peakDb, meterPeakDb - 1.5)
    meterRmsDb = meterRmsDb <= -119 ? rmsDb : meterRmsDb * 0.7 + rmsDb * 0.3
    meterLock.unlock()
  }

  private func meterLevels() -> (peak: Double, rms: Double) {
    meterLock.lock()
    defer { meterLock.unlock() }
    return (meterPeakDb, meterRmsDb)
  }

  private func resetMeter() {
    meterLock.lock()
    meterPeakDb = -120
    meterRmsDb = -120
    meterLock.unlock()
  }

  private func scheduleCurrentFile(shouldMarkFinished: Bool) {
    guard let audioFile else { return }
    let generation = scheduleGeneration
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
      at: nil,
      completionCallbackType: .dataPlayedBack
    ) { [weak self] _ in
      DispatchQueue.main.async {
        guard let self, self.scheduleGeneration == generation else { return }
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
  public func definition() -> ModuleDefinition {
    Name("EchoAudioDsp")

    View(EchoNativeAppView.self) {
      Prop("migrationPayload") { (view: EchoNativeAppView, value: String) in
        view.migrateLegacy(value)
      }
    }
  }
}
