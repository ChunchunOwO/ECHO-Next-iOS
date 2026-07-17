import Foundation
import SwiftUI
import WebKit

struct EchoNeteaseLoginSheet: View {
  let language: String
  let onCookie: (String) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var errorMessage = ""
  @State private var loading = true

  var body: some View {
    NavigationView {
      ZStack {
        EchoNeteaseLoginWebView(
          onCookie: { cookie in
            onCookie(cookie)
            dismiss()
          },
          onError: { errorMessage = $0 },
          onLoadingChange: { loading = $0 }
        )
        if loading {
          ProgressView()
            .controlSize(.large)
        }
      }
      .safeAreaInset(edge: .bottom) {
        if !errorMessage.isEmpty {
          Text(errorMessage)
            .font(.footnote)
            .foregroundStyle(.red)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(.regularMaterial)
        }
      }
      .navigationTitle(language == "en" ? "NetEase sign in" : "登录网易云音乐")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(language == "en" ? "Cancel" : "取消") { dismiss() }
        }
      }
    }
    .navigationViewStyle(.stack)
  }
}

private struct EchoNeteaseLoginWebView: UIViewRepresentable {
  let onCookie: (String) -> Void
  let onError: (String) -> Void
  let onLoadingChange: (Bool) -> Void

  func makeCoordinator() -> Coordinator {
    Coordinator(
      onCookie: onCookie,
      onError: onError,
      onLoadingChange: onLoadingChange
    )
  }

  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    configuration.defaultWebpagePreferences.preferredContentMode = .mobile

    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
    webView.navigationDelegate = context.coordinator
    configuration.websiteDataStore.httpCookieStore.add(context.coordinator)
    webView.load(URLRequest(url: URL(string: "https://music.163.com/#/login/")!))
    return webView
  }

  func updateUIView(_ webView: WKWebView, context: Context) {}

  static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
    webView.configuration.websiteDataStore.httpCookieStore.remove(coordinator)
    webView.stopLoading()
  }

  final class Coordinator: NSObject, WKHTTPCookieStoreObserver, WKNavigationDelegate {
    private static let retainedCookieNames = Set([
      "MUSIC_U",
      "MUSIC_A",
      "NMTID",
      "WEVNSM",
      "WNMCID",
      "__csrf",
      "__remember_me",
      "_ntes_nnid",
      "_ntes_nuid",
    ])

    private let onCookie: (String) -> Void
    private let onError: (String) -> Void
    private let onLoadingChange: (Bool) -> Void
    private var submittedCookie = ""

    init(
      onCookie: @escaping (String) -> Void,
      onError: @escaping (String) -> Void,
      onLoadingChange: @escaping (Bool) -> Void
    ) {
      self.onCookie = onCookie
      self.onError = onError
      self.onLoadingChange = onLoadingChange
    }

    func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
      inspectCookies(in: cookieStore)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      onLoadingChange(false)
      inspectCookies(in: webView.configuration.websiteDataStore.httpCookieStore)
    }

    func webView(
      _ webView: WKWebView,
      didFail navigation: WKNavigation!,
      withError error: Error
    ) {
      onLoadingChange(false)
      onError(error.localizedDescription)
    }

    func webView(
      _ webView: WKWebView,
      didFailProvisionalNavigation navigation: WKNavigation!,
      withError error: Error
    ) {
      onLoadingChange(false)
      onError(error.localizedDescription)
    }

    private func inspectCookies(in cookieStore: WKHTTPCookieStore) {
      cookieStore.getAllCookies { [weak self] cookies in
        guard let self else { return }
        let neteaseCookies = cookies.filter { cookie in
          let domain = cookie.domain.lowercased()
          return (domain == "music.163.com" || domain.hasSuffix(".163.com"))
            && Self.retainedCookieNames.contains(cookie.name)
        }
        guard neteaseCookies.contains(where: {
          ($0.name == "MUSIC_U" || $0.name == "MUSIC_A") && !$0.value.isEmpty
        }) else {
          return
        }
        let value = neteaseCookies
          .sorted { $0.name < $1.name }
          .map { "\($0.name)=\($0.value)" }
          .joined(separator: "; ")
        guard !value.isEmpty, value != submittedCookie else { return }
        submittedCookie = value
        DispatchQueue.main.async { self.onCookie(value) }
      }
    }
  }
}
