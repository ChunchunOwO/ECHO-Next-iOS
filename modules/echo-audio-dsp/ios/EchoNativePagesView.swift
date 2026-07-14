import Combine
import AVFoundation
import Foundation
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
  let tags: [String]
  let title: String
}

private struct EchoNativeLibraryLabels: Decodable {
  let addToQueue: String
  let deleteTrack: String
  let empty: String
  let favorite: String
  let importLyrics: String
  let importMusic: String
  let localPlay: String
  let playNext: String
  let refresh: String
  let searchPlaceholder: String
  let unfavorite: String
}

private struct EchoNativeLibraryPayload: Decodable {
  let busy: Bool
  let canPlayLocal: Bool
  let filter: String
  let filterOptions: [EchoNativePageOption]
  let labels: EchoNativeLibraryLabels
  var query: String
  let source: String
  let sourceOptions: [EchoNativePageOption]
  let totalLabel: String
  let tracks: [EchoNativeLibraryTrack]
  let view: String
  let viewOptions: [EchoNativePageOption]
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

  func update(payloadJSON: String) {
    guard
      let data = payloadJSON.data(using: .utf8),
      var nextPayload = try? JSONDecoder().decode(EchoNativePagePayload.self, from: data)
    else {
      return
    }
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
  @State private var expandedSection = "interface"
  @State private var showPairingScanner = false
  @State private var showEqualizer = false

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
    .fullScreenCover(isPresented: $showPairingScanner) {
      EchoPairingScannerSheet(language: model.payload?.language ?? "zh") { code in
        onAction(["action": "pairScanned", "text": code])
      }
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
    case "connect": return english ? "Connect" : "连接"
    default: return english ? "Settings" : "设置"
    }
  }

  private func statusColor(_ status: EchoNativePageStatus) -> Color {
    status.broken ? echoAccent : (status.online ? echoGold : echoInk.opacity(0.5))
  }

  private func libraryPage(_ library: EchoNativeLibraryPayload) -> some View {
    ScrollView(showsIndicators: false) {
      LazyVStack(alignment: .leading, spacing: 14) {
        EchoNativeSegmentedControl(
          options: library.sourceOptions,
          selection: library.source,
          onSelect: { onAction(["action": "librarySource", "selection": $0]) }
        )

        HStack(spacing: 10) {
          HStack(spacing: 9) {
            Image(systemName: "magnifyingglass")
              .font(.system(size: 15, weight: .semibold))
              .foregroundColor(echoInk.opacity(0.45))
            TextField(
              library.labels.searchPlaceholder,
              text: Binding(
                get: { model.payload?.library?.query ?? library.query },
                set: { value in
                  updateLibrary { $0.query = value }
                  onAction(["action": "libraryQuery", "text": value])
                }
              )
            )
            .font(.system(size: 14, weight: .medium))
            .textInputAutocapitalization(.never)
            .disableAutocorrection(true)
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

        ScrollView(.horizontal, showsIndicators: false) {
          EchoNativeSegmentedControl(
            options: library.source == "local" ? library.viewOptions : library.filterOptions,
            selection: library.source == "local" ? library.view : library.filter,
            compact: true,
            onSelect: { selection in
              onAction([
                "action": library.source == "local" ? "libraryView" : "libraryFilter",
                "selection": selection,
              ])
            }
          )
        }

        HStack(spacing: 10) {
          Text(library.totalLabel)
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(echoInk.opacity(0.52))
          Spacer()
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

        if library.tracks.isEmpty {
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

  private func libraryTrackRow(
    _ track: EchoNativeLibraryTrack,
    labels: EchoNativeLibraryLabels
  ) -> some View {
    HStack(spacing: 11) {
      Button {
        onAction(["action": "trackPlay", "id": track.id, "source": track.isLocal ? "local" : "echo"])
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

      if track.isLocal {
        Menu {
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
        } label: {
          Image(systemName: "ellipsis")
            .font(.system(size: 16, weight: .bold))
            .frame(width: 40, height: 40)
            .echoGlass(tint: Color.white.opacity(0.1), in: Circle())
        }
      } else {
        Button {
          onAction(["action": "trackPlay", "id": track.id, "source": "echo"])
        } label: {
          Image(systemName: track.canPlayOnPhone ? "play.fill" : "desktopcomputer")
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(echoAccent)
            .frame(width: 40, height: 40)
            .echoGlass(tint: echoAccent.opacity(0.08), in: Circle())
        }
        .buttonStyle(.plain)
      }
    }
    .padding(.vertical, 8)
    .overlay(alignment: .bottom) {
      Rectangle().fill(echoInk.opacity(0.09)).frame(height: 0.7)
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
          VStack(spacing: 12) {
            Image(systemName: "dot.radiowaves.left.and.right")
              .font(.system(size: 28, weight: .medium))
            Text(connection.labels.streamingComingSoon)
              .font(.system(size: 20, weight: .bold))
            Text(connection.labels.streamingReserved)
              .font(.system(size: 13, weight: .medium))
              .foregroundColor(echoInk.opacity(0.52))
              .multilineTextAlignment(.center)
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 42)
          .padding(.horizontal, 22)
          .echoGlass(tint: Color.white.opacity(0.1), clear: false, interactive: false, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
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

private struct EchoPairingScannerSheet: View {
  let language: String
  let onCode: (String) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var cameraUnavailable = false

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
              .frame(width: 38, height: 38)
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

        Text(language == "en" ? "The connection is saved automatically after a successful scan." : "识别成功后会自动保存连接信息。")
          .font(.system(size: 12, weight: .semibold))
          .foregroundColor(.white.opacity(0.76))
          .multilineTextAlignment(.center)
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
        }
        .foregroundColor(.white)
        .padding(28)
      }
    }
    .background(Color.black.ignoresSafeArea())
    .preferredColorScheme(.dark)
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
              .frame(maxWidth: compact ? nil : .infinity, minHeight: compact ? 34 : 40)
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
      .frame(height: 38)
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
