import AVFoundation
import AudioToolbox
import CryptoKit
import Foundation
import UniformTypeIdentifiers
import UIKit

enum EchoNativeLocalLibrary {
  private static let audioExtensions = Set(["aac", "aiff", "alac", "caf", "flac", "m4a", "mp3", "mp4", "wav"])

  static var directory: URL {
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    return documents.appendingPathComponent("local-music", isDirectory: true)
  }

  static func scan() async -> [EchoNativeCoreTrack] {
    await Task.detached(priority: .utility) {
      let manager = FileManager.default
      try? manager.createDirectory(at: directory, withIntermediateDirectories: true)
      let urls = (try? manager.contentsOfDirectory(
        at: directory,
        includingPropertiesForKeys: [.fileSizeKey],
        options: [.skipsHiddenFiles]
      )) ?? []
      return urls
        .filter { audioExtensions.contains($0.pathExtension.lowercased()) }
        .sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }
        .map(track)
    }.value
  }

  @MainActor
  static func importFiles(from presenter: UIViewController) async throws -> Int {
    let importer = EchoNativeDocumentImporter(presenter: presenter)
    let urls = await importer.pickAudioFiles()
    guard !urls.isEmpty else { return 0 }
    return try await Task.detached(priority: .utility) {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      var count = 0
      for source in urls where audioExtensions.contains(source.pathExtension.lowercased()) {
        let accessed = source.startAccessingSecurityScopedResource()
        defer { if accessed { source.stopAccessingSecurityScopedResource() } }
        let destination = uniqueDestination(for: sanitized(source.lastPathComponent))
        try FileManager.default.copyItem(at: source, to: destination)
        count += 1
      }
      return count
    }.value
  }

  static func delete(_ track: EchoNativeCoreTrack) throws {
    guard let raw = track.localUrl, let url = URL(string: raw), url.isFileURL,
      url.standardizedFileURL.path.hasPrefix(directory.standardizedFileURL.path + "/")
    else {
      return
    }
    try FileManager.default.removeItem(at: url)
    try? FileManager.default.removeItem(at: url.deletingPathExtension().appendingPathExtension("lrc"))
  }

  @MainActor
  static func importLyrics(for track: EchoNativeCoreTrack, from presenter: UIViewController) async throws -> Bool {
    guard let raw = track.localUrl, let audioUrl = URL(string: raw), audioUrl.isFileURL else { return false }
    let importer = EchoNativeDocumentImporter(presenter: presenter)
    let type = UTType(filenameExtension: "lrc") ?? .plainText
    guard let source = await importer.pickFiles(contentTypes: [type, .plainText], allowsMultipleSelection: false).first else {
      return false
    }
    let accessed = source.startAccessingSecurityScopedResource()
    defer { if accessed { source.stopAccessingSecurityScopedResource() } }
    let destination = audioUrl.deletingPathExtension().appendingPathExtension("lrc")
    if source.standardizedFileURL == destination.standardizedFileURL { return true }
    try? FileManager.default.removeItem(at: destination)
    try FileManager.default.copyItem(at: source, to: destination)
    return true
  }

  private static func track(url: URL) -> EchoNativeCoreTrack {
    let asset = AVURLAsset(url: url)
    let metadata = asset.commonMetadata
    let duration = CMTimeGetSeconds(asset.duration)
    let title = stringValue(.commonIdentifierTitle, in: metadata)
      ?? url.deletingPathExtension().lastPathComponent.replacingOccurrences(
        of: #"^\d+[\s._-]+"#,
        with: "",
        options: .regularExpression
      )
    let artist = stringValue(.commonIdentifierArtist, in: metadata) ?? ""
    let album = stringValue(.commonIdentifierAlbumName, in: metadata) ?? ""
    let albumArtist = stringValue(markers: ["albumartist", "album artist", "tpe2", "aart"], in: asset.metadata) ?? ""
    let audioTrack = asset.tracks(withMediaType: .audio).first
    let sampleRate = streamDescription(audioTrack)?.mSampleRate
    let bitDepthValue = streamDescription(audioTrack)?.mBitsPerChannel ?? 0
    let resources = try? url.resourceValues(forKeys: [.fileSizeKey])
    let lyricsUrl = url.deletingPathExtension().appendingPathExtension("lrc")
    let artworkUrl = artwork(in: metadata, sourceUrl: url)
    return EchoNativeCoreTrack(
      album: album,
      albumArtist: albumArtist,
      artist: artist,
      artworkUrl: artworkUrl,
      bitDepth: bitDepthValue > 0 ? Int(bitDepthValue) : nil,
      bitrate: audioTrack.map { Int($0.estimatedDataRate.rounded()) },
      canPlayOnPhone: true,
      codec: url.pathExtension.uppercased(),
      discNo: numberValue(markers: ["disk", "disc", "tpos"], in: asset.metadata),
      durationMs: duration.isFinite && duration > 0 ? duration * 1000 : 0,
      fileName: url.lastPathComponent,
      fileSize: Int64(resources?.fileSize ?? 0),
      hasLyrics: FileManager.default.fileExists(atPath: lyricsUrl.path),
      id: "local:\(url.lastPathComponent)",
      lyricsUrl: FileManager.default.fileExists(atPath: lyricsUrl.path) ? lyricsUrl.absoluteString : nil,
      localUrl: url.absoluteString,
      sampleRate: sampleRate.flatMap { $0 > 0 ? $0 : nil },
      source: .local,
      sourceLabel: "Local",
      title: title,
      trackNo: numberValue(markers: ["trkn", "track", "trck"], in: asset.metadata)
    )
  }

  private static func stringValue(_ identifier: AVMetadataIdentifier, in metadata: [AVMetadataItem]) -> String? {
    metadata.first(where: { $0.identifier == identifier })?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func stringValue(markers: [String], in metadata: [AVMetadataItem]) -> String? {
    metadata.first(where: { item in
      let identifier = item.identifier?.rawValue.lowercased() ?? ""
      let key = item.key.map { String(describing: $0).lowercased() } ?? ""
      return markers.contains { identifier.contains($0) || key.contains($0) }
    })?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func streamDescription(_ track: AVAssetTrack?) -> AudioStreamBasicDescription? {
    guard let description = track?.formatDescriptions.first,
      let pointer = CMAudioFormatDescriptionGetStreamBasicDescription(description as! CMAudioFormatDescription)
    else {
      return nil
    }
    return pointer.pointee
  }

  private static func numberValue(markers: [String], in metadata: [AVMetadataItem]) -> Int? {
    guard let item = metadata.first(where: { item in
      let identifier = item.identifier?.rawValue.lowercased() ?? ""
      let key = item.key.map { String(describing: $0).lowercased() } ?? ""
      return markers.contains { identifier.contains($0) || key.contains($0) }
    }) else {
      return nil
    }
    if let value = item.numberValue?.intValue, value > 0 { return value }
    if let raw = item.stringValue?.split(separator: "/").first, let value = Int(raw), value > 0 { return value }
    guard let data = item.dataValue, data.count >= 4 else { return nil }
    let bytes = [UInt8](data)
    let value = Int(bytes[2]) << 8 | Int(bytes[3])
    return value > 0 ? value : nil
  }

  private static func artwork(in metadata: [AVMetadataItem], sourceUrl: URL) -> String? {
    guard let data = metadata.first(where: { $0.identifier == .commonIdentifierArtwork })?.dataValue,
      UIImage(data: data) != nil
    else {
      return nil
    }
    let digest = SHA256.hash(data: Data(sourceUrl.absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()
    let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("echo-native-artwork", isDirectory: true)
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let extensionName = data.starts(with: [0x89, 0x50, 0x4E, 0x47]) ? "png" : "jpg"
    let destination = directory.appendingPathComponent(digest).appendingPathExtension(extensionName)
    if !FileManager.default.fileExists(atPath: destination.path) {
      try? data.write(to: destination, options: .atomic)
    }
    return destination.absoluteString
  }

  private static func sanitized(_ name: String) -> String {
    let value = name.replacingOccurrences(of: #"[\\/:*?\"<>|#%]"#, with: "_", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? "track-\(Int(Date().timeIntervalSince1970))" : value
  }

  private static func uniqueDestination(for fileName: String) -> URL {
    let base = URL(fileURLWithPath: fileName).deletingPathExtension().lastPathComponent
    let ext = URL(fileURLWithPath: fileName).pathExtension
    var destination = directory.appendingPathComponent(fileName)
    var index = 2
    while FileManager.default.fileExists(atPath: destination.path) {
      let next = ext.isEmpty ? "\(base) \(index)" : "\(base) \(index).\(ext)"
      destination = directory.appendingPathComponent(next)
      index += 1
    }
    return destination
  }
}

@MainActor
private final class EchoNativeDocumentImporter: NSObject, UIDocumentPickerDelegate {
  private weak var presenter: UIViewController?
  private var continuation: CheckedContinuation<[URL], Never>?

  init(presenter: UIViewController) {
    self.presenter = presenter
  }

  func pickAudioFiles() async -> [URL] {
    await pickFiles(contentTypes: [.audio], allowsMultipleSelection: true)
  }

  func pickFiles(contentTypes: [UTType], allowsMultipleSelection: Bool) async -> [URL] {
    guard presenter != nil else { return [] }
    return await withCheckedContinuation { continuation in
      self.continuation = continuation
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: contentTypes, asCopy: true)
      picker.allowsMultipleSelection = allowsMultipleSelection
      picker.delegate = self
      presenter?.present(picker, animated: true)
    }
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    continuation?.resume(returning: urls)
    continuation = nil
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    continuation?.resume(returning: [])
    continuation = nil
  }
}

enum EchoNativeStreamCache {
  static func file(for remoteUrl: URL, track: EchoNativeCoreTrack) async throws -> URL {
    let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("echo-native-streams", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let rawExtension = track.codec?.lowercased() ?? remoteUrl.pathExtension.lowercased()
    let ext = ["aac", "flac", "m4a", "mp3", "mp4", "wav"].contains(rawExtension) ? rawExtension : "audio"
    let cacheKey = "v2|\(track.source.rawValue)|\(remoteUrl.host ?? "")|\(remoteUrl.port ?? 0)|\(track.id)"
    let digest = SHA256.hash(data: Data(cacheKey.utf8)).prefix(16)
      .map { String(format: "%02x", $0) }
      .joined()
    let destination = directory.appendingPathComponent(digest).appendingPathExtension(ext)
    if FileManager.default.fileExists(atPath: destination.path) { return destination }
    let (temporary, response) = try await URLSession.shared.download(from: remoteUrl)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw EchoNativeNetworkError.invalidResponse
    }
    let mimeType = response.mimeType?.lowercased() ?? ""
    guard !mimeType.hasPrefix("text/"), mimeType != "application/json" else {
      throw EchoNativeNetworkError.invalidResponse
    }
    try? FileManager.default.removeItem(at: destination)
    try FileManager.default.moveItem(at: temporary, to: destination)
    return destination
  }
}
