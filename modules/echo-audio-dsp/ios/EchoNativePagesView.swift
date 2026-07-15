import Combine
import AVFoundation
import CoreImage.CIFilterBuiltins
import Foundation
import PhotosUI
import SwiftUI
import UIKit

private struct EchoNativePageOption: Decodable, Identifiable {
  let id: String
  let label: String
}

private struct EchoNativePageStatus: Decodable {
  let broken: Bool
  let label: String
  let online: Bool
}

private struct EchoNativeLibraryTrack: Decodable, Identifiable {
  let artworkUrl: String
  let artist: String
  let canPlayOnPhone: Bool
  let favorite: Bool
  let group: String
  let hasLyrics: Bool
  let id: String
  let isLocal: Bool
  let source: String
  let tags: [String]
  let title: String
}

private struct EchoNativeStreamingPlaylist: Decodable, Identifiable {
  let artworkUrl: String
  let favorite: Bool
  let id: String
  let name: String
  let pinned: Bool
  let sourceLabel: String
  let trackCount: Int
}

private struct EchoNativeLibraryStreaming: Decodable {
  let libraryMode: String
  let libraryModeOptions: [EchoNativePageOption]
  let loggedIn: Bool
  let playlistCount: Int
  let playlists: [EchoNativeStreamingPlaylist]
  let profileName: String
  let selectedPlaylistId: String
  let selectedPlaylistName: String
  let status: String
}

private struct EchoNativeLibraryCollection: Decodable, Identifiable {
  let artworkUrl: String
  let id: String
  let query: String
  let subtitle: String
  let title: String
}

private struct EchoNativePlaylist: Decodable, Identifiable {
  let artworkUrl: String
  let favorite: Bool
  let id: String
  let name: String
  let pinned: Bool
  let subtitle: String
  let tracks: [EchoNativeLibraryTrack]
}

private struct EchoNativePlaylistEditorState: Identifiable {
  let id = UUID()
  let initialName: String
  let playlistId: String?
  let trackId: String?
  let trackSource: String?

  init(
    initialName: String,
    playlistId: String?,
    trackId: String? = nil,
    trackSource: String? = nil
  ) {
    self.initialName = initialName
    self.playlistId = playlistId
    self.trackId = trackId
    self.trackSource = trackSource
  }
}

private struct EchoNativePlaylistSelection: Identifiable {
  let id: String
}

private struct EchoNativeLibraryLabels: Decodable {
  let addToQueue: String
  let addToPlaylist: String
  let cancel: String
  let collections: String
  let createPlaylist: String
  let deleteTrack: String
  let deletePlaylist: String
  let empty: String
  let favorite: String
  let favoritePlaylist: String
  let importLyrics: String
  let importMusic: String
  let localPlay: String
  let playNext: String
  let playlistName: String
  let playlists: String
  let pinPlaylist: String
  let removeFromPlaylist: String
  let renamePlaylist: String
  let refresh: String
  let searchPlaceholder: String
  let songs: String
  let unFavoritePlaylist: String
  let unpinPlaylist: String
  let unfavorite: String
}

private struct EchoNativeLibraryPayload: Decodable {
  let busy: Bool
  let canPlayLocal: Bool
  let collections: [EchoNativeLibraryCollection]
  let filter: String
  let filterOptions: [EchoNativePageOption]
  let labels: EchoNativeLibraryLabels
  let playlists: [EchoNativePlaylist]
  var query: String
  let source: String
  let sourceOptions: [EchoNativePageOption]
  let streaming: EchoNativeLibraryStreaming
  var selectedPlaylist: EchoNativePlaylist?
  let totalLabel: String
  let tracks: [EchoNativeLibraryTrack]
  let view: String
  let viewOptions: [EchoNativePageOption]
}

private struct EchoNativeConnectionStreaming: Decodable {
  var apiBaseUrl: String
  let busy: Bool
  let loggedIn: Bool
  let playlistCount: Int
  let profileAvatarUrl: String
  let profileName: String
  let qrUrl: String
  let status: String
}

private struct EchoNativeConnectionLabels: Decodable {
  let connect: String
  let connectionDescription: String
  let echoConnection: String
  let enabled: String
  let host: String
  let hostPlaceholder: String
  let library: String
  let manual: String
  let pairLink: String
  let scanPairing: String
  let port: String
  let save: String
  let streamable: String
  let streamingComingSoon: String
  let streamingReserved: String
  let test: String
  let token: String
}

private struct EchoNativeConnectionPayload: Decodable {
  let busy: Bool
  var enabled: Bool
  var host: String
  let labels: EchoNativeConnectionLabels
  let libraryCount: String
  let mode: String
  let modeOptions: [EchoNativePageOption]
  var pairingText: String
  var port: String
  let streamableCount: String
  var streaming: EchoNativeConnectionStreaming
  var token: String
}

private struct EchoNativeSettingRow: Decodable, Identifiable {
  var boolValue: Bool?
  let description: String
  let disabled: Bool
  let id: String
  let kind: String
  let options: [EchoNativePageOption]
  var selection: String?
  let title: String
  let value: String
}

private struct EchoNativeSettingSection: Decodable, Identifiable {
  let description: String
  let id: String
  var rows: [EchoNativeSettingRow]
  let summary: String
  let symbol: String
  let title: String
}

private struct EchoNativeSettingsPayload: Decodable {
  var sections: [EchoNativeSettingSection]
  let subtitle: String
}

private struct EchoNativePagePayload: Decodable {
  var connection: EchoNativeConnectionPayload?
  let language: String
  var library: EchoNativeLibraryPayload?
  let page: String
  var settings: EchoNativeSettingsPayload?
  let status: EchoNativePageStatus
  let title: String
}

final class EchoNativePagesModel: ObservableObject {
  @Published fileprivate var payload: EchoNativePagePayload?
  let equalizer = EchoNativeEqualizerModel()
  private var lastPayloadJSON = ""

  func update(payloadJSON: String) {
    guard payloadJSON != lastPayloadJSON else { return }
    guard
      let data = payloadJSON.data(using: .utf8),
      var nextPayload = try? JSONDecoder().decode(EchoNativePagePayload.self, from: data)
    else {
      return
    }
    lastPayloadJSON = payloadJSON
    nextPayload.connection = nextPayload.connection ?? payload?.connection
    nextPayload.library = nextPayload.library ?? payload?.library
    nextPayload.settings = nextPayload.settings ?? payload?.settings
    payload = nextPayload
    equalizer.language = nextPayload.language
  }
}

struct EchoNativePagesScreen: View {
  @ObservedObject var model: EchoNativePagesModel
  let page: String
  let onAction: ([String: Any]) -> Void
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.openURL) private var openURL
  @State private var expandedSection = "interface"
  @State private var showPairingScanner = false
  @State private var showEqualizer = false
  @State private var playlistEditor: EchoNativePlaylistEditorState?
  @State private var playlistSelection: EchoNativePlaylistSelection?
  @State private var playlistPendingDeletion: EchoNativePlaylist?
  @State private var showStreamingLogoutConfirmation = false
  @AppStorage("echo.library.echoDisplayMode") private var echoLibraryDisplayMode = "list"
  @AppStorage("echo.library.collectionDisplayMode") private var collectionDisplayMode = "grid"
  @AppStorage("echo.library.streamingPlaylistDisplayMode") private var streamingPlaylistDisplayMode = "grid"

  var body: some View {
    Group {
      if let payload = model.payload {
        VStack(spacing: 0) {
          pageHeader(payload, title: pageTitle(payload.language))
          Group {
            switch page {
            case "library":
              if let library = payload.library {
                libraryPage(library)
              }
            case "search":
              if let library = payload.library {
                searchPage(library)
              }
            case "connect":
              if let connection = payload.connection {
                connectionPage(connection)
              }
            case "settings":
              if let settings = payload.settings {
                settingsPage(settings)
              }
            default:
              EmptyView()
            }
          }
          .id(page)
          .transition(.opacity.combined(with: .move(edge: .trailing)))
        }
        .foregroundColor(echoInk)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.28), value: payload.page)
      }
    }
    .background(Color.clear)
    .preferredColorScheme(.light)
    .sheet(isPresented: $showEqualizer) {
      EchoNativeEqualizerSheet(model: model.equalizer, onAction: onAction)
    }
    .sheet(item: $playlistEditor) { editor in
      EchoNativePlaylistEditorSheet(
        editor: editor,
        labels: model.payload?.library?.labels,
        onAction: onAction
      )
    }
    .sheet(item: $playlistSelection) { selection in
      EchoNativePlaylistDetailSheet(
        model: model,
        playlistId: selection.id,
        onAction: onAction
      )
    }
    .fullScreenCover(isPresented: $showPairingScanner) {
      EchoPairingScannerSheet(language: model.payload?.language ?? "zh") { code in
        onAction(["action": "pairScanned", "text": code])
      }
    }
    .confirmationDialog(
      model.payload?.language == "en" ? "Delete this playlist?" : "删除这个歌单？",
      isPresented: Binding(
        get: { playlistPendingDeletion != nil },
        set: { if !$0 { playlistPendingDeletion = nil } }
      ),
      titleVisibility: .visible
    ) {
      Button(model.payload?.library?.labels.deletePlaylist ?? "删除歌单", role: .destructive) {
        if let playlist = playlistPendingDeletion {
          onAction(["action": "playlistDelete", "playlistId": playlist.id])
        }
        playlistPendingDeletion = nil
      }
      Button(model.payload?.library?.labels.cancel ?? "取消", role: .cancel) {}
    } message: {
      Text(playlistPendingDeletion?.name ?? "")
    }
    .alert(
      model.payload?.language == "en" ? "Sign out of NetEase Cloud Music?" : "退出网易云音乐？",
      isPresented: $showStreamingLogoutConfirmation
    ) {
      Button(model.payload?.language == "en" ? "Sign out" : "退出", role: .destructive) {
        onAction(["action": "streamingLogout"])
      }
      Button(model.payload?.language == "en" ? "Cancel" : "取消", role: .cancel) {}
    } message: {
      Text(model.payload?.language == "en" ? "You will need to scan the QR code again to sign in." : "下次登录需要重新扫描二维码。")
    }
  }

  private func pageHeader(_ payload: EchoNativePagePayload, title: String) -> some View {
    HStack(alignment: .center, spacing: 14) {
      Text(title)
        .font(.system(size: 32, weight: .bold, design: .rounded))
        .lineLimit(1)
      Spacer(minLength: 8)
      HStack(spacing: 7) {
        Circle()
          .fill(statusColor(payload.status))
          .frame(width: 7, height: 7)
        Text(payload.status.label)
          .font(.system(size: 11, weight: .bold))
          .lineLimit(1)
      }
      .foregroundColor(statusColor(payload.status))
      .padding(.horizontal, 12)
      .frame(height: 34)
      .echoGlass(
        tint: statusColor(payload.status).opacity(0.08),
        clear: false,
        interactive: false,
        in: Capsule()
      )
    }
    .padding(.horizontal, 20)
    .padding(.top, 18)
    .padding(.bottom, 12)
  }

  private func pageTitle(_ language: String) -> String {
    let english = language == "en"
    switch page {
    case "library": return english ? "Library" : "曲库"
    case "search": return english ? "Search" : "搜索"
    case "connect": return english ? "Connect" : "连接"
    default: return english ? "Settings" : "设置"
    }
  }

  private func statusColor(_ status: EchoNativePageStatus) -> Color {
    status.broken ? echoAccent : (status.online ? echoGold : echoInk.opacity(0.5))
  }

  private func searchPage(_ library: EchoNativeLibraryPayload) -> some View {
    libraryPage(library, searchOnly: true)
      .searchable(text: libraryQueryBinding(library), prompt: library.labels.searchPlaceholder)
  }

  private func libraryPage(_ library: EchoNativeLibraryPayload, searchOnly: Bool = false) -> some View {
    let normalizedQuery = library.query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let displayedPlaylists = library.playlists.filter { playlist in
      normalizedQuery.isEmpty
        || playlist.name.lowercased().contains(normalizedQuery)
        || playlist.tracks.contains { track in
          track.title.lowercased().contains(normalizedQuery)
            || track.artist.lowercased().contains(normalizedQuery)
        }
    }
    let displayedStreamingPlaylists = library.streaming.playlists.filter { playlist in
      normalizedQuery.isEmpty || playlist.name.lowercased().contains(normalizedQuery)
    }
    let streamingContentEmpty = library.streaming.loggedIn && (
      library.streaming.libraryMode == "playlists"
        ? displayedStreamingPlaylists.isEmpty
        : library.tracks.isEmpty
    )
    return ScrollView(showsIndicators: false) {
      LazyVStack(alignment: .leading, spacing: 14) {
        if !searchOnly {
          EchoNativeSegmentedControl(
            options: library.sourceOptions,
            selection: library.source,
            onSelect: { onAction(["action": "librarySource", "selection": $0]) }
          )
        }

        if !searchOnly && library.source == "streaming" {
          EchoNativeSegmentedControl(
            options: library.streaming.libraryModeOptions,
            selection: library.streaming.libraryMode,
            onSelect: { onAction(["action": "streamingLibraryMode", "selection": $0]) }
          )

          if !library.streaming.loggedIn {
            Button {
              onAction(["action": "streamingConnect"])
            } label: {
              Label(library.labels.empty, systemImage: "person.crop.circle.badge.plus")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(echoInk.opacity(0.58))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .echoGlass(tint: Color.white.opacity(0.09), clear: false, in: RoundedRectangle(cornerRadius: 17))
            }
            .buttonStyle(.plain)
          }

          if !library.streaming.status.isEmpty {
            Text(library.streaming.status)
              .font(.system(size: 11, weight: .semibold))
              .foregroundColor(echoInk.opacity(0.5))
              .frame(maxWidth: .infinity, alignment: .center)
              .multilineTextAlignment(.center)
          }
        }

        if !searchOnly {
          HStack(spacing: 10) {
            HStack(spacing: 9) {
              Image(systemName: "magnifyingglass")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(echoInk.opacity(0.45))
              TextField(
                library.labels.searchPlaceholder,
                text: libraryQueryBinding(library)
              )
              .font(.system(size: 14, weight: .medium))
              .textInputAutocapitalization(.never)
              .disableAutocorrection(true)
              if !library.query.isEmpty {
                Button {
                  libraryQueryBinding(library).wrappedValue = ""
                } label: {
                  Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(echoInk.opacity(0.36))
                    .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(model.payload?.language == "en" ? "Clear search" : "清除搜索")
              }
            }
            .padding(.horizontal, 14)
            .frame(height: 46)
            .echoGlass(tint: Color.white.opacity(0.12), clear: false, in: RoundedRectangle(cornerRadius: 15, style: .continuous))

            Button {
              onAction(["action": "libraryRefresh"])
            } label: {
              Image(systemName: "arrow.clockwise")
                .font(.system(size: 16, weight: .bold))
                .rotationEffect(.degrees(library.busy ? 180 : 0))
                .frame(width: 46, height: 46)
                .echoGlass(tint: Color.white.opacity(0.13), clear: false, in: Circle())
            }
            .buttonStyle(.plain)
            .disabled(library.busy)
            .accessibilityLabel(library.labels.refresh)
          }
        }

        if !searchOnly && library.source == "echo" {
          ScrollView(.horizontal, showsIndicators: false) {
            EchoNativeSegmentedControl(
              options: library.filterOptions,
              selection: library.filter,
              compact: true,
              onSelect: { onAction(["action": "libraryFilter", "selection": $0]) }
            )
          }
          ScrollView(.horizontal, showsIndicators: false) {
            EchoNativeSegmentedControl(
              options: library.viewOptions,
              selection: library.view,
              compact: true,
              onSelect: { onAction(["action": "libraryView", "selection": $0]) }
            )
          }
        } else if !searchOnly && library.source == "local" {
          ScrollView(.horizontal, showsIndicators: false) {
            EchoNativeSegmentedControl(
              options: library.viewOptions,
              selection: library.view,
              compact: true,
              onSelect: { onAction(["action": "libraryView", "selection": $0]) }
            )
          }
        }

        if library.source != "streaming" {
          HStack {
            Text(library.labels.playlists)
              .font(.system(size: 18, weight: .bold, design: .rounded))
            Spacer()
            Button {
              playlistEditor = EchoNativePlaylistEditorState(initialName: "", playlistId: nil)
            } label: {
              Label(library.labels.createPlaylist, systemImage: "plus")
                .font(.system(size: 11, weight: .bold))
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .tint(echoAccent)
          }

          if library.playlists.isEmpty {
            Button {
              playlistEditor = EchoNativePlaylistEditorState(initialName: "", playlistId: nil)
            } label: {
              Label(library.labels.createPlaylist, systemImage: "music.note.list")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(echoInk.opacity(0.52))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .echoGlass(tint: Color.white.opacity(0.08), clear: false, in: RoundedRectangle(cornerRadius: 16))
            }
            .buttonStyle(.plain)
          } else if !displayedPlaylists.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
              LazyHStack(spacing: 12) {
                ForEach(displayedPlaylists) { playlist in
                  libraryPlaylistCard(playlist, labels: library.labels)
                }
              }
            }
          }
        }

        if library.source == "streaming" && library.streaming.loggedIn && library.streaming.libraryMode == "playlists" {
          HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
              Text(library.labels.playlists)
                .font(.system(size: 18, weight: .bold, design: .rounded))
              Text("\(library.streaming.profileName) · \(library.streaming.playlistCount)")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(echoInk.opacity(0.48))
            }
            Spacer()
            EchoNativeDisplayModeButton(mode: streamingPlaylistDisplayMode, language: model.payload?.language ?? "zh") {
              streamingPlaylistDisplayMode = streamingPlaylistDisplayMode == "grid" ? "list" : "grid"
            }
          }

          if streamingPlaylistDisplayMode == "grid" {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible())], spacing: 18) {
              ForEach(displayedStreamingPlaylists) { playlist in
                streamingPlaylistGridCard(playlist, labels: library.labels)
              }
            }
          } else {
            LazyVStack(spacing: 0) {
              ForEach(displayedStreamingPlaylists) { playlist in
                streamingPlaylistRow(playlist, labels: library.labels)
              }
            }
          }
        }

        if !library.collections.isEmpty {
          HStack {
            Text(library.labels.collections)
              .font(.system(size: 18, weight: .bold, design: .rounded))
            Spacer()
            EchoNativeDisplayModeButton(mode: collectionDisplayMode, language: model.payload?.language ?? "zh") {
              collectionDisplayMode = collectionDisplayMode == "grid" ? "list" : "grid"
            }
          }
          if collectionDisplayMode == "grid" {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible())], spacing: 18) {
              ForEach(library.collections) { collection in
                libraryCollectionGridCard(collection)
              }
            }
          } else {
            LazyVStack(spacing: 0) {
              ForEach(library.collections) { collection in
                libraryCollectionRow(collection)
              }
            }
          }
        }

        HStack(spacing: 10) {
          Text(library.totalLabel)
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(echoInk.opacity(0.52))
          Spacer()
          if library.source == "echo" && library.view == "songs" {
            EchoNativeDisplayModeButton(mode: echoLibraryDisplayMode, language: model.payload?.language ?? "zh") {
              echoLibraryDisplayMode = echoLibraryDisplayMode == "grid" ? "list" : "grid"
            }
          }
          if library.source == "local" {
            EchoNativeLabelButton(
              symbol: "square.and.arrow.down",
              title: library.labels.importMusic,
              disabled: library.busy
            ) {
              onAction(["action": "libraryImport"])
            }
            EchoNativeLabelButton(
              symbol: "play.fill",
              title: library.labels.localPlay,
              disabled: !library.canPlayLocal
            ) {
              onAction(["action": "libraryPlayFirst"])
            }
          }
        }
        .frame(minHeight: 38)

        if !library.tracks.isEmpty {
          Text(library.source == "streaming" && !library.streaming.selectedPlaylistName.isEmpty
            ? library.streaming.selectedPlaylistName
            : library.labels.songs)
            .font(.system(size: 18, weight: .bold, design: .rounded))
        }

        if (library.source == "streaming"
          ? streamingContentEmpty
          : (library.tracks.isEmpty && library.collections.isEmpty && displayedPlaylists.isEmpty)) {
          VStack(spacing: 12) {
            Image(systemName: "music.note.list")
              .font(.system(size: 28, weight: .medium))
            Text(library.labels.empty)
              .font(.system(size: 14, weight: .semibold))
              .multilineTextAlignment(.center)
          }
          .foregroundColor(echoInk.opacity(0.4))
          .frame(maxWidth: .infinity)
          .padding(.vertical, 54)
        } else if library.source == "echo" && library.view == "songs" && echoLibraryDisplayMode == "grid" {
          LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible())],
            spacing: 18
          ) {
            ForEach(library.tracks) { track in
              libraryTrackGridCard(track, labels: library.labels)
            }
          }
          .transition(.opacity.combined(with: .scale(scale: 0.98)))
        } else {
          ForEach(Array(library.tracks.enumerated()), id: \.element.id) { index, track in
            if !track.group.isEmpty && (index == 0 || library.tracks[index - 1].group != track.group) {
              Text(track.group)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(echoAccent.opacity(0.78))
                .padding(.top, index == 0 ? 2 : 10)
            }
            libraryTrackRow(track, labels: library.labels)
          }
        }
      }
      .padding(.horizontal, 20)
      .padding(.bottom, 24)
    }
    .refreshable { onAction(["action": "libraryRefresh"]) }
  }

  private func libraryQueryBinding(_ library: EchoNativeLibraryPayload) -> Binding<String> {
    Binding(
      get: { model.payload?.library?.query ?? library.query },
      set: { value in
        updateLibrary { $0.query = value }
        onAction(["action": "libraryQuery", "text": value])
      }
    )
  }

  private func libraryCollectionGridCard(_ collection: EchoNativeLibraryCollection) -> some View {
    EchoNativeMediaGridCard(
      artworkUrl: collection.artworkUrl,
      title: collection.title,
      subtitle: collection.subtitle,
      onSelect: { selectCollection(collection) },
      accessory: { EmptyView() }
    )
    .accessibilityLabel("\(collection.title), \(collection.subtitle)")
  }

  private func libraryCollectionRow(_ collection: EchoNativeLibraryCollection) -> some View {
    EchoNativeMediaRow(
      artworkUrl: collection.artworkUrl,
      title: collection.title,
      subtitle: collection.subtitle,
      onSelect: { selectCollection(collection) }
    ) {
      Button { selectCollection(collection) } label: {
        Image(systemName: "chevron.right")
          .font(.system(size: 11, weight: .bold))
          .foregroundColor(echoInk.opacity(0.32))
          .frame(width: 44, height: 44)
          .contentShape(Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(collection.title)
    }
  }

  private func selectCollection(_ collection: EchoNativeLibraryCollection) {
    updateLibrary { $0.query = collection.query }
    onAction(["action": "libraryQuery", "text": collection.query])
  }

  private func libraryTrackGridCard(
    _ track: EchoNativeLibraryTrack,
    labels: EchoNativeLibraryLabels
  ) -> some View {
    EchoNativeMediaGridCard(
      artworkUrl: track.artworkUrl,
      title: track.title,
      subtitle: track.artist,
      onArtworkError: { onAction(["action": "artworkError", "url": track.artworkUrl]) },
      onSelect: { onAction(["action": "trackPlay", "id": track.id, "source": track.source]) }
    ) {
      if track.source != "streaming" {
        libraryTrackMenu(track, labels: labels)
      }
    }
  }

  private func libraryPlaylistCard(
    _ playlist: EchoNativePlaylist,
    labels: EchoNativeLibraryLabels
  ) -> some View {
    VStack(alignment: .leading, spacing: 7) {
      Button {
        playlistSelection = EchoNativePlaylistSelection(id: playlist.id)
        onAction(["action": "playlistOpen", "playlistId": playlist.id])
      } label: {
        ZStack(alignment: .topTrailing) {
          EchoNativeArtwork(urlString: playlist.artworkUrl, onError: {})
            .frame(width: 126, height: 126)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
          if playlist.pinned || playlist.favorite {
            HStack(spacing: 4) {
              if playlist.pinned { Image(systemName: "pin.fill") }
              if playlist.favorite { Image(systemName: "heart.fill") }
            }
            .font(.system(size: 9, weight: .bold))
            .foregroundColor(.white)
            .padding(7)
            .background(Color.black.opacity(0.24), in: Capsule())
            .padding(7)
          }
        }
      }
      .buttonStyle(.plain)

      HStack(spacing: 4) {
        Button {
          playlistSelection = EchoNativePlaylistSelection(id: playlist.id)
          onAction(["action": "playlistOpen", "playlistId": playlist.id])
        } label: {
          VStack(alignment: .leading, spacing: 2) {
            Text(playlist.name)
              .font(.system(size: 13, weight: .bold))
              .foregroundColor(echoInk)
              .lineLimit(1)
            Text(playlist.subtitle)
              .font(.system(size: 10, weight: .semibold))
              .foregroundColor(echoInk.opacity(0.48))
          }
          .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        Spacer(minLength: 0)
        Menu {
          Button {
            onAction(["action": "playlistPin", "playlistId": playlist.id])
          } label: {
            Label(playlist.pinned ? labels.unpinPlaylist : labels.pinPlaylist, systemImage: "pin")
          }
          Button {
            onAction(["action": "playlistFavorite", "playlistId": playlist.id])
          } label: {
            Label(playlist.favorite ? labels.unFavoritePlaylist : labels.favoritePlaylist, systemImage: "heart")
          }
          Button {
            playlistEditor = EchoNativePlaylistEditorState(initialName: playlist.name, playlistId: playlist.id)
          } label: {
            Label(labels.renamePlaylist, systemImage: "pencil")
          }
          Button(role: .destructive) {
            playlistPendingDeletion = playlist
          } label: {
            Label(labels.deletePlaylist, systemImage: "trash")
          }
        } label: {
          Image(systemName: "ellipsis")
            .font(.system(size: 12, weight: .bold))
            .frame(width: 44, height: 44)
        }
      }
      .frame(width: 126)
    }
    .frame(width: 126, alignment: .leading)
    .accessibilityElement(children: .contain)
  }

  private func streamingPlaylistGridCard(
    _ playlist: EchoNativeStreamingPlaylist,
    labels: EchoNativeLibraryLabels
  ) -> some View {
    EchoNativeMediaGridCard(
      artworkUrl: playlist.artworkUrl,
      title: playlist.name,
      subtitle: playlist.sourceLabel,
      badges: playlistBadges(playlist),
      onSelect: { onAction(["action": "streamingPlaylistOpen", "id": playlist.id]) }
    ) {
      streamingPlaylistMenu(playlist, labels: labels)
    }
  }

  private func streamingPlaylistRow(
    _ playlist: EchoNativeStreamingPlaylist,
    labels: EchoNativeLibraryLabels
  ) -> some View {
    EchoNativeMediaRow(
      artworkUrl: playlist.artworkUrl,
      title: playlist.name,
      subtitle: "\(playlist.sourceLabel) · \(playlist.trackCount)",
      badges: playlistBadges(playlist),
      onSelect: { onAction(["action": "streamingPlaylistOpen", "id": playlist.id]) }
    ) {
      streamingPlaylistMenu(playlist, labels: labels)
    }
  }

  private func playlistBadges(_ playlist: EchoNativeStreamingPlaylist) -> [String] {
    [playlist.pinned ? "pin.fill" : nil, playlist.favorite ? "heart.fill" : nil].compactMap { $0 }
  }

  private func streamingPlaylistMenu(
    _ playlist: EchoNativeStreamingPlaylist,
    labels: EchoNativeLibraryLabels
  ) -> some View {
    Menu {
      Button {
        onAction(["action": "streamingPlaylistPin", "id": playlist.id])
      } label: {
        Label(playlist.pinned ? labels.unpinPlaylist : labels.pinPlaylist, systemImage: "pin")
      }
      Button {
        onAction(["action": "streamingPlaylistFavorite", "id": playlist.id])
      } label: {
        Label(playlist.favorite ? labels.unFavoritePlaylist : labels.favoritePlaylist, systemImage: "heart")
      }
    } label: {
      ZStack {
        Image(systemName: "ellipsis")
          .font(.system(size: 14, weight: .bold))
        if playlist.pinned || playlist.favorite {
          Circle()
            .fill(echoAccent)
            .frame(width: 6, height: 6)
            .offset(x: 10, y: -10)
        }
      }
      .frame(width: 44, height: 44)
      .echoGlass(tint: Color.white.opacity(0.1), in: Circle())
    }
  }

  private func libraryTrackRow(
    _ track: EchoNativeLibraryTrack,
    labels: EchoNativeLibraryLabels
  ) -> some View {
    return HStack(spacing: 11) {
      Button {
        onAction(["action": "trackPlay", "id": track.id, "source": track.source])
      } label: {
        HStack(spacing: 11) {
          EchoNativeArtwork(urlString: track.artworkUrl) {
            onAction(["action": "artworkError", "url": track.artworkUrl])
          }
          .frame(width: 54, height: 54)
          .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))

          VStack(alignment: .leading, spacing: 4) {
            Text(track.title)
              .font(.system(size: 15, weight: .bold))
              .lineLimit(1)
            HStack(spacing: 5) {
              Text(track.artist)
                .lineLimit(1)
              if track.hasLyrics {
                Text("LRC")
                  .font(.system(size: 9, weight: .bold))
              }
            }
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(echoInk.opacity(0.5))
            if !track.tags.isEmpty {
              ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 5) {
                  ForEach(track.tags, id: \.self) { tag in
                    Text(tag)
                      .font(.system(size: 9, weight: .bold))
                      .foregroundColor(echoInk.opacity(0.6))
                      .padding(.horizontal, 7)
                      .frame(height: 20)
                      .overlay(Capsule().stroke(echoInk.opacity(0.16), lineWidth: 0.8))
                  }
                }
              }
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)

      if track.source != "streaming" {
        libraryTrackMenu(track, labels: labels)
      }
    }
    .padding(.vertical, 8)
    .overlay(alignment: .bottom) {
      Rectangle().fill(echoInk.opacity(0.09)).frame(height: 0.7)
    }
  }

  private func libraryTrackMenu(
    _ track: EchoNativeLibraryTrack,
    labels: EchoNativeLibraryLabels
  ) -> some View {
    let playlists = model.payload?.library?.playlists ?? []
    return Menu {
      if playlists.isEmpty {
        Button {
          playlistEditor = EchoNativePlaylistEditorState(
            initialName: "",
            playlistId: nil,
            trackId: track.id,
            trackSource: track.isLocal ? "local" : "echo"
          )
        } label: {
          Label(labels.createPlaylist, systemImage: "plus")
        }
      } else {
        Menu {
          ForEach(playlists) { playlist in
            Button(playlist.name) {
              onAction([
                "action": "playlistAddTrack",
                "id": track.id,
                "playlistId": playlist.id,
                "source": track.isLocal ? "local" : "echo",
              ])
            }
          }
        } label: {
          Label(labels.addToPlaylist, systemImage: "music.note.list")
        }
        Button {
          playlistEditor = EchoNativePlaylistEditorState(
            initialName: "",
            playlistId: nil,
            trackId: track.id,
            trackSource: track.isLocal ? "local" : "echo"
          )
        } label: {
          Label(labels.createPlaylist, systemImage: "plus")
        }
      }

      if track.isLocal {
        Divider()
        Button {
          onAction(["action": "trackFavorite", "id": track.id])
        } label: {
          Label(track.favorite ? labels.unfavorite : labels.favorite, systemImage: track.favorite ? "heart.slash" : "heart")
        }
        Button {
          onAction(["action": "trackQueue", "id": track.id])
        } label: {
          Label(labels.addToQueue, systemImage: "text.badge.plus")
        }
        Button {
          onAction(["action": "trackNext", "id": track.id])
        } label: {
          Label(labels.playNext, systemImage: "text.insert")
        }
        Button {
          onAction(["action": "trackLyrics", "id": track.id])
        } label: {
          Label(labels.importLyrics, systemImage: "doc.text")
        }
        Button(role: .destructive) {
          onAction(["action": "trackDelete", "id": track.id])
        } label: {
          Label(labels.deleteTrack, systemImage: "trash")
        }
      }
    } label: {
      Image(systemName: "ellipsis")
        .font(.system(size: 16, weight: .bold))
        .frame(width: 44, height: 44)
        .echoGlass(tint: Color.white.opacity(0.1), in: Circle())
    }
  }

  private func connectionPage(_ connection: EchoNativeConnectionPayload) -> some View {
    ScrollView(showsIndicators: false) {
      VStack(alignment: .leading, spacing: 18) {
        EchoNativeSegmentedControl(
          options: connection.modeOptions,
          selection: connection.mode,
          onSelect: { onAction(["action": "connectMode", "selection": $0]) }
        )

        if connection.mode == "streaming" {
          connectionSection(
            symbol: "music.note.house",
            title: model.payload?.language == "en" ? "NetEase Cloud Music" : "网易云音乐"
          ) {
            EchoNativeTextField(
              placeholder: model.payload?.language == "en"
                ? "Self-hosted API address"
                : "自托管 NeteaseCloudMusicApi 地址",
              text: Binding(
                get: { model.payload?.connection?.streaming.apiBaseUrl ?? connection.streaming.apiBaseUrl },
                set: { value in
                  updateConnection { $0.streaming.apiBaseUrl = value }
                  onAction(["action": "streamingApiUrl", "text": value])
                }
              ),
              keyboardType: .URL
            )

            if connection.streaming.loggedIn {
              HStack(spacing: 13) {
                EchoNativeArtwork(urlString: connection.streaming.profileAvatarUrl, onError: {})
                  .frame(width: 58, height: 58)
                  .clipShape(Circle())
                VStack(alignment: .leading, spacing: 4) {
                  Text(connection.streaming.profileName)
                    .font(.system(size: 17, weight: .bold))
                    .lineLimit(1)
                  Text(model.payload?.language == "en"
                    ? "NetEase · \(connection.streaming.playlistCount) playlists"
                    : "网易云 · \(connection.streaming.playlistCount) 个歌单")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(echoInk.opacity(0.5))
                }
                Spacer(minLength: 6)
                Button(role: .destructive) {
                  showStreamingLogoutConfirmation = true
                } label: {
                  Text(model.payload?.language == "en" ? "Sign out" : "退出")
                    .font(.system(size: 12, weight: .bold))
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
              }
              .padding(14)
              .echoGlass(tint: Color.white.opacity(0.1), clear: false, interactive: false, in: RoundedRectangle(cornerRadius: 19))
            } else {
              Button {
                onAction(["action": "streamingLogin"])
              } label: {
                HStack(spacing: 8) {
                  if connection.streaming.busy { ProgressView().controlSize(.small) }
                  Image(systemName: "qrcode")
                  Text(model.payload?.language == "en" ? "QR code sign in" : "扫码登录")
                }
                .font(.system(size: 13, weight: .bold))
                .frame(maxWidth: .infinity)
                .frame(height: 46)
                .echoGlass(tint: echoAccent.opacity(0.09), clear: false, in: RoundedRectangle(cornerRadius: 15))
              }
              .buttonStyle(.plain)
              .disabled(connection.streaming.busy || connection.streaming.apiBaseUrl.isEmpty)

              if !connection.streaming.qrUrl.isEmpty {
                EchoNativeQRCode(value: connection.streaming.qrUrl)
                  .frame(width: 210, height: 210)
                  .padding(12)
                  .background(Color.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                  .frame(maxWidth: .infinity)
                  .transition(.opacity.combined(with: .scale(scale: 0.96)))
                if let loginUrl = URL(string: connection.streaming.qrUrl) {
                  Button {
                    openURL(loginUrl)
                  } label: {
                    Label(
                      model.payload?.language == "en" ? "Open NetEase Cloud Music" : "在网易云音乐中打开",
                      systemImage: "arrow.up.right.square"
                    )
                    .font(.system(size: 12, weight: .bold))
                  }
                  .buttonStyle(.bordered)
                  .buttonBorderShape(.capsule)
                  .frame(maxWidth: .infinity)
                }
              }
            }

            if !connection.streaming.status.isEmpty {
              Text(connection.streaming.status)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(echoInk.opacity(0.55))
                .frame(maxWidth: .infinity, alignment: .center)
                .multilineTextAlignment(.center)
            }

            Text(model.payload?.language == "en"
              ? "Use your own NeteaseCloudMusicApi service. Session credentials stay in iOS Keychain."
              : "使用你自己的 NeteaseCloudMusicApi 服务，登录凭据仅保存在 iOS 钥匙串。")
              .font(.system(size: 10, weight: .medium))
              .foregroundColor(echoInk.opacity(0.42))
              .fixedSize(horizontal: false, vertical: true)
          }
        } else {
          connectionToggle(connection)
          connectionMetrics(connection)
          connectionSection(symbol: "link.badge.plus", title: connection.labels.pairLink) {
            EchoNativeTextField(
              placeholder: "echo://pair?host=192.168.1.12&port=26789&token=...",
              text: Binding(
                get: { model.payload?.connection?.pairingText ?? connection.pairingText },
                set: { value in
                  updateConnection { $0.pairingText = value }
                  onAction(["action": "pairingText", "text": value])
                }
              )
            )
            HStack(spacing: 10) {
              EchoNativeLabelButton(symbol: "link", title: connection.labels.connect) {
                onAction(["action": "pairConnection"])
              }
              EchoNativeLabelButton(symbol: "qrcode.viewfinder", title: connection.labels.scanPairing) {
                showPairingScanner = true
              }
            }
          }
          connectionSection(symbol: "slider.horizontal.3", title: connection.labels.manual) {
            EchoNativeTextField(
              placeholder: connection.labels.hostPlaceholder,
              text: connectionBinding(connection, keyPath: \.host, field: "host")
            )
            HStack(spacing: 10) {
              EchoNativeTextField(
                placeholder: connection.labels.port,
                text: connectionBinding(connection, keyPath: \.port, field: "port"),
                keyboardType: .numberPad
              )
              EchoNativeTextField(
                placeholder: connection.labels.token,
                text: connectionBinding(connection, keyPath: \.token, field: "token"),
                secure: true
              )
            }
            HStack(spacing: 10) {
              EchoNativeLabelButton(symbol: "checkmark", title: connection.labels.save) {
                onAction(["action": "connectionSave"])
              }
              EchoNativeLabelButton(
                symbol: "arrow.clockwise",
                title: connection.labels.test,
                disabled: connection.busy
              ) {
                onAction(["action": "connectionTest"])
              }
            }
          }
        }
      }
      .padding(.horizontal, 20)
      .padding(.bottom, 24)
    }
  }

  private func connectionToggle(_ connection: EchoNativeConnectionPayload) -> some View {
    HStack(spacing: 14) {
      Image(systemName: "desktopcomputer")
        .font(.system(size: 19, weight: .semibold))
        .foregroundColor(echoAccent)
        .frame(width: 42, height: 42)
        .echoGlass(tint: echoAccent.opacity(0.08), interactive: false, in: Circle())
      VStack(alignment: .leading, spacing: 3) {
        Text(connection.labels.enabled)
          .font(.system(size: 15, weight: .bold))
        Text(connection.labels.connectionDescription)
          .font(.system(size: 11, weight: .medium))
          .foregroundColor(echoInk.opacity(0.5))
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 6)
      Toggle("", isOn: Binding(
        get: { model.payload?.connection?.enabled ?? connection.enabled },
        set: { enabled in
          updateConnection { $0.enabled = enabled }
          onAction(["action": "echoConnectionEnabled", "enabled": enabled])
        }
      ))
      .labelsHidden()
      .tint(echoAccent)
    }
    .padding(15)
    .echoGlass(tint: Color.white.opacity(0.1), clear: false, interactive: false, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
  }

  private func connectionMetrics(_ connection: EchoNativeConnectionPayload) -> some View {
    HStack(spacing: 0) {
      connectionMetric(value: connection.host.isEmpty ? "--" : connection.host, label: connection.labels.host)
      Rectangle().fill(echoInk.opacity(0.1)).frame(width: 1, height: 38)
      connectionMetric(value: connection.libraryCount, label: connection.labels.library)
      Rectangle().fill(echoInk.opacity(0.1)).frame(width: 1, height: 38)
      connectionMetric(value: connection.streamableCount, label: connection.labels.streamable)
    }
    .padding(.vertical, 8)
  }

  private func connectionMetric(value: String, label: String) -> some View {
    VStack(spacing: 4) {
      Text(value)
        .font(.system(size: 15, weight: .bold, design: .rounded))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      Text(label)
        .font(.system(size: 10, weight: .semibold))
        .foregroundColor(echoInk.opacity(0.45))
    }
    .frame(maxWidth: .infinity)
  }

  private func connectionSection<Content: View>(
    symbol: String,
    title: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 11) {
      Label(title, systemImage: symbol)
        .font(.system(size: 14, weight: .bold))
        .foregroundColor(echoInk.opacity(0.7))
      content()
    }
  }

  private func connectionBinding(
    _ connection: EchoNativeConnectionPayload,
    keyPath: WritableKeyPath<EchoNativeConnectionPayload, String>,
    field: String
  ) -> Binding<String> {
    Binding(
      get: { model.payload?.connection?[keyPath: keyPath] ?? connection[keyPath: keyPath] },
      set: { value in
        updateConnection { $0[keyPath: keyPath] = value }
        onAction(["action": "connectionField", "field": field, "text": value])
      }
    )
  }

  private func settingsPage(_ settings: EchoNativeSettingsPayload) -> some View {
    ScrollView(showsIndicators: false) {
      LazyVStack(alignment: .leading, spacing: 10) {
        Text(settings.subtitle)
          .font(.system(size: 13, weight: .medium))
          .foregroundColor(echoInk.opacity(0.5))
          .padding(.bottom, 4)

        ForEach(settings.sections) { section in
          let expanded = expandedSection == section.id
          VStack(spacing: 0) {
            Button {
              if reduceMotion {
                expandedSection = expanded ? "" : section.id
              } else {
                withAnimation(.easeInOut(duration: 0.24)) {
                  expandedSection = expanded ? "" : section.id
                }
              }
            } label: {
              HStack(spacing: 12) {
                Image(systemName: section.symbol)
                  .font(.system(size: 17, weight: .semibold))
                  .foregroundColor(expanded ? echoAccent : echoInk.opacity(0.58))
                  .frame(width: 38, height: 38)
                  .echoGlass(
                    tint: expanded ? echoAccent.opacity(0.08) : Color.white.opacity(0.08),
                    clear: !expanded,
                    in: Circle()
                  )
                VStack(alignment: .leading, spacing: 3) {
                  Text(section.title)
                    .font(.system(size: 15, weight: .bold))
                  Text(section.description)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(echoInk.opacity(0.48))
                    .lineLimit(expanded ? 2 : 1)
                }
                Spacer(minLength: 8)
                if !expanded {
                  Text(section.summary)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(echoInk.opacity(0.42))
                    .lineLimit(1)
                }
                Image(systemName: "chevron.down")
                  .font(.system(size: 12, weight: .bold))
                  .foregroundColor(echoInk.opacity(0.38))
                  .rotationEffect(.degrees(expanded ? 180 : 0))
              }
              .contentShape(Rectangle())
              .padding(.vertical, 11)
            }
            .buttonStyle(.plain)

            if expanded {
              VStack(spacing: 0) {
                Rectangle().fill(echoInk.opacity(0.09)).frame(height: 0.7)
                ForEach(section.rows) { row in
                  settingRow(row)
                  if row.id != section.rows.last?.id {
                    Rectangle().fill(echoInk.opacity(0.07)).frame(height: 0.7).padding(.leading, 50)
                  }
                }
              }
              .transition(.opacity.combined(with: .move(edge: .top)))
            }
          }
          .padding(.horizontal, 14)
          .echoGlass(
            tint: expanded ? Color.white.opacity(0.12) : Color.white.opacity(0.06),
            clear: !expanded,
            interactive: false,
            in: RoundedRectangle(cornerRadius: 19, style: .continuous)
          )
        }
      }
      .padding(.horizontal, 20)
      .padding(.bottom, 24)
    }
  }

  @ViewBuilder
  private func settingRow(_ row: EchoNativeSettingRow) -> some View {
    switch row.kind {
    case "toggle":
      HStack(spacing: 12) {
        settingText(row)
        Spacer(minLength: 8)
        Toggle("", isOn: Binding(
          get: { currentSettingRow(row.id)?.boolValue ?? row.boolValue ?? false },
          set: { enabled in
            updateSettingRow(row.id) { $0.boolValue = enabled }
            onAction(["action": "settingToggle", "key": row.id, "enabled": enabled])
          }
        ))
        .labelsHidden()
        .tint(echoAccent)
      }
      .padding(.vertical, 12)
    case "picker":
      VStack(alignment: .leading, spacing: 10) {
        settingText(row)
        ScrollView(.horizontal, showsIndicators: false) {
          EchoNativeSegmentedControl(
            options: row.options,
            selection: currentSettingRow(row.id)?.selection ?? row.selection ?? "",
            compact: true,
            onSelect: { selection in
              updateSettingRow(row.id) { $0.selection = selection }
              onAction(["action": "settingSelect", "key": row.id, "selection": selection])
            }
          )
        }
      }
      .padding(.vertical, 12)
    case "eq":
      Button {
        showEqualizer = true
      } label: {
        HStack(spacing: 12) {
          settingText(row)
          Spacer(minLength: 8)
          Text(row.value)
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(echoAccent)
          Image(systemName: "slider.vertical.3")
            .font(.system(size: 14, weight: .bold))
        }
        .padding(.vertical, 12)
      }
      .buttonStyle(.plain)
    case "action":
      Button {
        onAction(["action": "settingAction", "key": row.id])
      } label: {
        HStack(spacing: 12) {
          settingText(row)
          Spacer(minLength: 8)
          Image(systemName: "chevron.right")
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(echoInk.opacity(0.38))
        }
        .padding(.vertical, 12)
      }
      .buttonStyle(.plain)
      .disabled(row.disabled)
      .opacity(row.disabled ? 0.42 : 1)
    default:
      HStack(spacing: 12) {
        settingText(row)
        Spacer(minLength: 8)
        Text(row.value)
          .font(.system(size: 12, weight: .bold))
          .foregroundColor(echoInk.opacity(0.52))
      }
      .padding(.vertical, 12)
    }
  }

  private func settingText(_ row: EchoNativeSettingRow) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(row.title)
        .font(.system(size: 14, weight: .bold))
      if !row.description.isEmpty {
        Text(row.description)
          .font(.system(size: 10.5, weight: .medium))
          .foregroundColor(echoInk.opacity(0.48))
          .fixedSize(horizontal: false, vertical: true)
      }
    }
  }

  private func currentSettingRow(_ id: String) -> EchoNativeSettingRow? {
    model.payload?.settings?.sections.lazy.flatMap { $0.rows }.first { $0.id == id }
  }

  private func updateLibrary(_ update: (inout EchoNativeLibraryPayload) -> Void) {
    guard var payload = model.payload, var library = payload.library else { return }
    update(&library)
    payload.library = library
    model.payload = payload
  }

  private func updateConnection(_ update: (inout EchoNativeConnectionPayload) -> Void) {
    guard var payload = model.payload, var connection = payload.connection else { return }
    update(&connection)
    payload.connection = connection
    model.payload = payload
  }

  private func updateSettingRow(_ id: String, update: (inout EchoNativeSettingRow) -> Void) {
    guard var payload = model.payload, var settings = payload.settings else { return }
    for sectionIndex in settings.sections.indices {
      guard let rowIndex = settings.sections[sectionIndex].rows.firstIndex(where: { $0.id == id }) else { continue }
      update(&settings.sections[sectionIndex].rows[rowIndex])
      payload.settings = settings
      model.payload = payload
      return
    }
  }
}

private struct EchoNativePlaylistEditorSheet: View {
  let editor: EchoNativePlaylistEditorState
  let labels: EchoNativeLibraryLabels?
  let onAction: ([String: Any]) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var name: String

  init(
    editor: EchoNativePlaylistEditorState,
    labels: EchoNativeLibraryLabels?,
    onAction: @escaping ([String: Any]) -> Void
  ) {
    self.editor = editor
    self.labels = labels
    self.onAction = onAction
    _name = State(initialValue: editor.initialName)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text(editorTitle)
        .font(.system(size: 24, weight: .bold, design: .rounded))
      TextField(labels?.playlistName ?? "歌单名称", text: $name)
        .textFieldStyle(.roundedBorder)
        .submitLabel(.done)
        .onSubmit(save)
      HStack(spacing: 12) {
        Button(labels?.cancel ?? "取消") { dismiss() }
          .buttonStyle(.bordered)
        Button(editorTitle) {
          save()
        }
        .buttonStyle(.borderedProminent)
        .tint(echoAccent)
        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
    }
    .padding(22)
    .foregroundColor(echoInk)
    .background(echoWarmBackground.ignoresSafeArea())
    .preferredColorScheme(.light)
  }

  private var editorTitle: String {
    editor.playlistId == nil
      ? (labels?.createPlaylist ?? "创建歌单")
      : (labels?.renamePlaylist ?? "重命名歌单")
  }

  private func save() {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    if let playlistId = editor.playlistId {
      onAction(["action": "playlistRename", "playlistId": playlistId, "text": trimmed])
    } else {
      var payload: [String: Any] = ["action": "playlistCreate", "text": trimmed]
      if let trackId = editor.trackId, let source = editor.trackSource {
        payload["id"] = trackId
        payload["source"] = source
      }
      onAction(payload)
    }
    dismiss()
  }
}

private struct EchoNativePlaylistDetailSheet: View {
  @ObservedObject var model: EchoNativePagesModel
  let playlistId: String
  let onAction: ([String: Any]) -> Void
  @Environment(\.dismiss) private var dismiss

  private var playlist: EchoNativePlaylist? {
    model.payload?.library?.selectedPlaylist
      ?? model.payload?.library?.playlists.first(where: { $0.id == playlistId })
  }

  var body: some View {
    VStack(spacing: 14) {
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text(playlist?.name ?? "")
            .font(.system(size: 24, weight: .bold, design: .rounded))
          Text(playlist?.subtitle ?? "")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(echoInk.opacity(0.5))
        }
        Spacer()
        if let playlist, let firstTrack = playlist.tracks.first {
          Button {
            dismiss()
            onAction([
              "action": "trackPlay",
              "id": firstTrack.id,
              "playlistId": playlist.id,
              "source": firstTrack.source,
            ])
          } label: {
            Image(systemName: "play.fill")
              .font(.system(size: 14, weight: .bold))
              .frame(width: 44, height: 44)
              .echoGlass(tint: echoAccent.opacity(0.09), in: Circle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(model.payload?.language == "en" ? "Play playlist" : "播放歌单")
        }
        Button {
          onAction(["action": "playlistClose"])
          dismiss()
        } label: {
          Image(systemName: "xmark")
            .font(.system(size: 13, weight: .bold))
            .frame(width: 44, height: 44)
            .echoGlass(tint: Color.white.opacity(0.1), in: Circle())
        }
        .buttonStyle(.plain)
      }

      if let playlist, !playlist.tracks.isEmpty {
        ScrollView(showsIndicators: false) {
          LazyVStack(spacing: 0) {
            ForEach(Array(playlist.tracks.enumerated()), id: \.offset) { _, track in
              HStack(spacing: 11) {
                Button {
                  dismiss()
                  onAction([
                    "action": "trackPlay",
                    "id": track.id,
                    "playlistId": playlist.id,
                    "source": track.source,
                  ])
                } label: {
                  HStack(spacing: 11) {
                    EchoNativeArtwork(urlString: track.artworkUrl, onError: {})
                      .frame(width: 50, height: 50)
                      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    VStack(alignment: .leading, spacing: 3) {
                      Text(track.title)
                        .font(.system(size: 14, weight: .bold))
                        .lineLimit(1)
                      Text(track.artist)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(echoInk.opacity(0.48))
                        .lineLimit(1)
                    }
                    Spacer()
                  }
                }
                .buttonStyle(.plain)
                Menu {
                  Button(role: .destructive) {
                    onAction([
                      "action": "playlistRemoveTrack",
                      "playlistId": playlist.id,
                      "source": track.source,
                      "trackId": track.id,
                    ])
                  } label: {
                    Label(
                      model.payload?.library?.labels.removeFromPlaylist ?? "从歌单移除",
                      systemImage: "trash"
                    )
                  }
                } label: {
                  Image(systemName: "ellipsis")
                    .font(.system(size: 14, weight: .bold))
                    .frame(width: 44, height: 44)
                }
              }
              .padding(.vertical, 8)
              .overlay(alignment: .bottom) {
                Rectangle().fill(echoInk.opacity(0.08)).frame(height: 0.7)
              }
            }
          }
        }
      } else {
        VStack(spacing: 12) {
          Image(systemName: "music.note.list")
            .font(.system(size: 28, weight: .medium))
          Text(model.payload?.language == "en" ? "Add songs from the library." : "从曲库中选择歌曲加入歌单。")
            .font(.system(size: 13, weight: .semibold))
        }
        .foregroundColor(echoInk.opacity(0.42))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .padding(20)
    .foregroundColor(echoInk)
    .background(echoWarmBackground.ignoresSafeArea())
    .preferredColorScheme(.light)
    .onDisappear { onAction(["action": "playlistClose"]) }
  }
}

private struct EchoPairingScannerSheet: View {
  let language: String
  let onCode: (String) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var cameraUnavailable = false
  @State private var photoError = false
  @State private var showPhotoPicker = false

  var body: some View {
    ZStack {
      EchoQRCodeScannerView(
        onCode: { code in
          dismiss()
          onCode(code)
        },
        onUnavailable: { cameraUnavailable = true }
      )
      .ignoresSafeArea()

      VStack(spacing: 0) {
        HStack {
          VStack(alignment: .leading, spacing: 3) {
            Text(language == "en" ? "Scan Pairing Code" : "扫描配对二维码")
              .font(.system(size: 22, weight: .bold, design: .rounded))
            Text(language == "en" ? "Point the camera at the QR code shown by ECHO." : "将 ECHO 显示的二维码放入取景框。")
              .font(.system(size: 11, weight: .semibold))
              .foregroundColor(.white.opacity(0.7))
          }
          Spacer()
          Button {
            dismiss()
          } label: {
            Image(systemName: "xmark")
              .font(.system(size: 13, weight: .bold))
              .frame(width: 44, height: 44)
              .echoGlass(tint: Color.black.opacity(0.14), in: Circle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(language == "en" ? "Close scanner" : "关闭扫码")
        }
        .foregroundColor(.white)
        .padding(.horizontal, 20)
        .padding(.top, 18)

        Spacer()

        RoundedRectangle(cornerRadius: 26, style: .continuous)
          .stroke(Color.white.opacity(0.9), lineWidth: 3)
          .frame(width: 250, height: 250)
          .shadow(color: .black.opacity(0.25), radius: 18)

        Spacer()

        VStack(spacing: 12) {
          Button {
            showPhotoPicker = true
          } label: {
            Label(language == "en" ? "Choose from Photos" : "从相册选择", systemImage: "photo")
              .font(.system(size: 13, weight: .bold))
              .padding(.horizontal, 18)
              .frame(height: 42)
              .echoGlass(tint: Color.white.opacity(0.12), clear: false, in: Capsule())
          }
          .buttonStyle(.plain)

          Text(language == "en" ? "The connection is saved automatically after a successful scan." : "识别成功后会自动保存连接信息。")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(.white.opacity(0.76))
            .multilineTextAlignment(.center)
        }
        .padding(.horizontal, 30)
        .padding(.bottom, 26)
      }

      if cameraUnavailable {
        Color.black.opacity(0.88).ignoresSafeArea()
        VStack(spacing: 14) {
          Image(systemName: "camera.fill")
            .font(.system(size: 30, weight: .medium))
          Text(language == "en" ? "Camera access is required" : "需要相机权限")
            .font(.system(size: 20, weight: .bold))
          Text(language == "en" ? "Enable Camera for ECHO iPhone in Settings, then scan again." : "请在系统设置中允许 ECHO iPhone 使用相机，然后重新扫码。")
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(.white.opacity(0.68))
            .multilineTextAlignment(.center)
          Button(language == "en" ? "Open Settings" : "打开设置") {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            UIApplication.shared.open(url)
          }
          .font(.system(size: 13, weight: .bold))
          .padding(.horizontal, 18)
          .frame(height: 42)
          .echoGlass(tint: Color.white.opacity(0.12), clear: false, in: Capsule())
          Button {
            showPhotoPicker = true
          } label: {
            Label(language == "en" ? "Choose from Photos" : "从相册选择", systemImage: "photo")
              .font(.system(size: 13, weight: .bold))
              .padding(.horizontal, 18)
              .frame(height: 42)
              .echoGlass(tint: Color.white.opacity(0.12), clear: false, in: Capsule())
          }
          .buttonStyle(.plain)
        }
        .foregroundColor(.white)
        .padding(28)
      }
    }
    .background(Color.black.ignoresSafeArea())
    .preferredColorScheme(.dark)
    .sheet(isPresented: $showPhotoPicker) {
      EchoQRCodePhotoPicker(
        onCode: { code in
          showPhotoPicker = false
          dismiss()
          onCode(code)
        },
        onCancel: { showPhotoPicker = false },
        onFailure: {
          showPhotoPicker = false
          photoError = true
        }
      )
    }
    .alert(language == "en" ? "No QR code found" : "未识别到二维码", isPresented: $photoError) {
      Button(language == "en" ? "OK" : "好", role: .cancel) {}
    } message: {
      Text(language == "en" ? "Choose a clear image containing an ECHO pairing QR code." : "请选择包含清晰 ECHO 配对二维码的图片。")
    }
  }
}

private struct EchoQRCodePhotoPicker: UIViewControllerRepresentable {
  let onCode: (String) -> Void
  let onCancel: () -> Void
  let onFailure: () -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(onCode: onCode, onCancel: onCancel, onFailure: onFailure)
  }

  func makeUIViewController(context: Context) -> PHPickerViewController {
    var configuration = PHPickerConfiguration(photoLibrary: .shared())
    configuration.filter = .images
    configuration.selectionLimit = 1
    let picker = PHPickerViewController(configuration: configuration)
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

  final class Coordinator: NSObject, PHPickerViewControllerDelegate {
    private let onCode: (String) -> Void
    private let onCancel: () -> Void
    private let onFailure: () -> Void

    init(onCode: @escaping (String) -> Void, onCancel: @escaping () -> Void, onFailure: @escaping () -> Void) {
      self.onCode = onCode
      self.onCancel = onCancel
      self.onFailure = onFailure
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
      guard let provider = results.first?.itemProvider else {
        picker.dismiss(animated: true, completion: onCancel)
        return
      }
      let handleCode = onCode
      let handleFailure = onFailure
      provider.loadObject(ofClass: UIImage.self) { object, _ in
        let code = (object as? UIImage).flatMap(Self.qrCode)
        DispatchQueue.main.async {
          picker.dismiss(animated: true) {
            if let code { handleCode(code) } else { handleFailure() }
          }
        }
      }
    }

    private static func qrCode(in image: UIImage) -> String? {
      guard let ciImage = CIImage(image: image) else { return nil }
      let detector = CIDetector(
        ofType: CIDetectorTypeQRCode,
        context: nil,
        options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]
      )
      return detector?.features(in: ciImage)
        .compactMap { ($0 as? CIQRCodeFeature)?.messageString }
        .first
    }
  }
}

private struct EchoQRCodeScannerView: UIViewControllerRepresentable {
  let onCode: (String) -> Void
  let onUnavailable: () -> Void

  func makeUIViewController(context: Context) -> EchoQRCodeScannerViewController {
    EchoQRCodeScannerViewController(onCode: onCode, onUnavailable: onUnavailable)
  }

  func updateUIViewController(_ uiViewController: EchoQRCodeScannerViewController, context: Context) {}

  static func dismantleUIViewController(_ uiViewController: EchoQRCodeScannerViewController, coordinator: ()) {
    uiViewController.stopScanning()
  }
}

private struct EchoNativeQRCode: View {
  let value: String

  var body: some View {
    Group {
      if let image = makeImage() {
        Image(uiImage: image)
          .resizable()
          .interpolation(.none)
          .scaledToFit()
      } else {
        Image(systemName: "qrcode")
          .font(.system(size: 48, weight: .medium))
          .foregroundColor(echoInk.opacity(0.35))
      }
    }
    .accessibilityLabel("QR Code")
  }

  private func makeImage() -> UIImage? {
    let filter = CIFilter.qrCodeGenerator()
    filter.message = Data(value.utf8)
    filter.correctionLevel = "M"
    guard
      let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)),
      let cgImage = CIContext().createCGImage(output, from: output.extent)
    else {
      return nil
    }
    return UIImage(cgImage: cgImage)
  }
}

private final class EchoQRCodeScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
  private let onCode: (String) -> Void
  private let onUnavailable: () -> Void
  private let previewLayer: AVCaptureVideoPreviewLayer
  private let session = AVCaptureSession()
  private let sessionQueue = DispatchQueue(label: "app.echo.qr-scanner")
  private var configured = false
  private var handledCode = false

  init(onCode: @escaping (String) -> Void, onUnavailable: @escaping () -> Void) {
    self.onCode = onCode
    self.onUnavailable = onUnavailable
    previewLayer = AVCaptureVideoPreviewLayer(session: session)
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    previewLayer.videoGravity = .resizeAspectFill
    view.layer.addSublayer(previewLayer)
    requestCameraAccess()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    previewLayer.frame = view.bounds
  }

  func stopScanning() {
    sessionQueue.async { [weak self] in
      guard let self, self.session.isRunning else { return }
      self.session.stopRunning()
    }
  }

  private func requestCameraAccess() {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      configureAndStart()
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
        DispatchQueue.main.async {
          if granted {
            self?.configureAndStart()
          } else {
            self?.onUnavailable()
          }
        }
      }
    default:
      onUnavailable()
    }
  }

  private func configureAndStart() {
    guard !configured else { return }
    guard
      let camera = AVCaptureDevice.default(for: .video),
      let input = try? AVCaptureDeviceInput(device: camera),
      session.canAddInput(input)
    else {
      onUnavailable()
      return
    }

    let output = AVCaptureMetadataOutput()
    guard session.canAddOutput(output) else {
      onUnavailable()
      return
    }

    session.beginConfiguration()
    if session.canSetSessionPreset(.high) {
      session.sessionPreset = .high
    }
    session.addInput(input)
    session.addOutput(output)
    output.setMetadataObjectsDelegate(self, queue: .main)
    output.metadataObjectTypes = [.qr]
    session.commitConfiguration()
    configured = true

    sessionQueue.async { [weak self] in
      self?.session.startRunning()
    }
  }

  func metadataOutput(
    _ output: AVCaptureMetadataOutput,
    didOutput metadataObjects: [AVMetadataObject],
    from connection: AVCaptureConnection
  ) {
    guard
      !handledCode,
      let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
      let value = object.stringValue,
      !value.isEmpty
    else {
      return
    }
    handledCode = true
    stopScanning()
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    onCode(value)
  }
}

private struct EchoNativeMediaGridCard<Accessory: View>: View {
  let artworkUrl: String
  let badges: [String]
  let onArtworkError: () -> Void
  let onSelect: () -> Void
  let subtitle: String
  let title: String
  let accessory: Accessory

  init(
    artworkUrl: String,
    title: String,
    subtitle: String,
    badges: [String] = [],
    onArtworkError: @escaping () -> Void = {},
    onSelect: @escaping () -> Void,
    @ViewBuilder accessory: () -> Accessory
  ) {
    self.artworkUrl = artworkUrl
    self.badges = badges
    self.onArtworkError = onArtworkError
    self.onSelect = onSelect
    self.subtitle = subtitle
    self.title = title
    self.accessory = accessory()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ZStack(alignment: .topTrailing) {
        Button(action: onSelect) {
          EchoNativeArtwork(urlString: artworkUrl, onError: onArtworkError)
            .frame(maxWidth: .infinity)
            .aspectRatio(1, contentMode: .fill)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        accessory.padding(7)
      }
      Button(action: onSelect) {
        VStack(alignment: .leading, spacing: 4) {
          Text(title)
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(echoInk)
            .lineLimit(1)
          HStack(spacing: 5) {
            Text(subtitle).lineLimit(1)
            Spacer(minLength: 2)
            ForEach(badges, id: \.self) { Image(systemName: $0) }
          }
          .font(.system(size: 11, weight: .semibold))
          .foregroundColor(echoInk.opacity(0.48))
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
    }
  }
}

private struct EchoNativeMediaRow<Accessory: View>: View {
  let artworkUrl: String
  let badges: [String]
  let onSelect: () -> Void
  let subtitle: String
  let title: String
  let accessory: Accessory

  init(
    artworkUrl: String,
    title: String,
    subtitle: String,
    badges: [String] = [],
    onSelect: @escaping () -> Void,
    @ViewBuilder accessory: () -> Accessory
  ) {
    self.artworkUrl = artworkUrl
    self.badges = badges
    self.onSelect = onSelect
    self.subtitle = subtitle
    self.title = title
    self.accessory = accessory()
  }

  var body: some View {
    HStack(spacing: 11) {
      Button(action: onSelect) {
        HStack(spacing: 11) {
          EchoNativeArtwork(urlString: artworkUrl, onError: {})
            .frame(width: 58, height: 58)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
          VStack(alignment: .leading, spacing: 4) {
            Text(title)
              .font(.system(size: 15, weight: .bold))
              .foregroundColor(echoInk)
              .lineLimit(1)
            HStack(spacing: 5) {
              Text(subtitle).lineLimit(1)
              ForEach(badges, id: \.self) { Image(systemName: $0) }
            }
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(echoInk.opacity(0.48))
          }
          Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      accessory
    }
    .padding(.vertical, 8)
    .overlay(alignment: .bottom) {
      Rectangle().fill(echoInk.opacity(0.09)).frame(height: 0.7)
    }
  }
}

private struct EchoNativeDisplayModeButton: View {
  let mode: String
  let language: String
  let onToggle: () -> Void
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    Button {
      if reduceMotion {
        onToggle()
      } else {
        withAnimation(.easeInOut(duration: 0.22)) { onToggle() }
      }
    } label: {
      Image(systemName: mode == "grid" ? "list.bullet" : "square.grid.2x2")
        .font(.system(size: 14, weight: .bold))
        .frame(width: 44, height: 44)
        .echoGlass(tint: Color.white.opacity(0.1), in: Circle())
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(language == "en"
      ? (mode == "grid" ? "Use list view" : "Use large artwork view")
      : (mode == "grid" ? "切换列表视图" : "切换大图视图"))
  }
}

private struct EchoNativeSegmentedControl: View {
  let options: [EchoNativePageOption]
  let selection: String
  var compact = false
  let onSelect: (String) -> Void

  var body: some View {
    echoGlassGroup(spacing: 5) {
      HStack(spacing: 7) {
        ForEach(options) { option in
          let selected = option.id == selection
          Button {
            onSelect(option.id)
          } label: {
            Text(option.label)
              .font(.system(size: compact ? 11 : 12, weight: .bold))
              .foregroundColor(selected ? echoAccent : echoInk.opacity(0.54))
              .lineLimit(1)
              .padding(.horizontal, compact ? 12 : 16)
              .frame(maxWidth: compact ? nil : .infinity, minHeight: 44)
              .echoGlass(
                tint: selected ? Color.black.opacity(0.1) : Color.white.opacity(0.08),
                clear: !selected,
                in: Capsule()
              )
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(selected ? [.isButton, .isSelected] : [.isButton])
        }
      }
    }
  }
}

private struct EchoNativeLabelButton: View {
  let symbol: String
  let title: String
  var disabled = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        Image(systemName: symbol)
          .font(.system(size: 13, weight: .bold))
        Text(title)
          .font(.system(size: 11, weight: .bold))
          .lineLimit(1)
      }
      .foregroundColor(echoInk.opacity(disabled ? 0.34 : 0.72))
      .padding(.horizontal, 13)
      .frame(minHeight: 44)
      .echoGlass(tint: Color.white.opacity(0.11), clear: false, in: Capsule())
    }
    .buttonStyle(.plain)
    .disabled(disabled)
  }
}

private struct EchoNativeTextField: View {
  let placeholder: String
  @Binding var text: String
  var keyboardType: UIKeyboardType = .default
  var secure = false

  var body: some View {
    Group {
      if secure {
        SecureField(placeholder, text: $text)
      } else {
        TextField(placeholder, text: $text)
          .keyboardType(keyboardType)
      }
    }
    .font(.system(size: 13, weight: .medium))
    .textInputAutocapitalization(.never)
    .disableAutocorrection(true)
    .padding(.horizontal, 14)
    .frame(maxWidth: .infinity, minHeight: 46)
    .echoGlass(tint: Color.white.opacity(0.12), clear: false, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
  }
}
