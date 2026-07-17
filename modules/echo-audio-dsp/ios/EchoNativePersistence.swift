import Foundation
import Security

enum EchoNativePersistence {
  private static let defaultsKey = "echo.native.state.v1"
  private static let migrationKey = "echo.native.didMigrateLegacy.v1"
  private static let service = "app.echo.next.ios.native"

  static func load() -> EchoNativePersistentState {
    guard
      let data = UserDefaults.standard.data(forKey: defaultsKey),
      var state = try? JSONDecoder().decode(EchoNativePersistentState.self, from: data)
    else {
      return EchoNativePersistentState()
    }
    state.echoConnection.token = keychainValue(account: "echo-token") ?? ""
    state.powerampConnection.token = keychainValue(account: "poweramp-token") ?? ""
    return state
  }

  static func save(_ state: EchoNativePersistentState) {
    setKeychainValue(state.echoConnection.token, account: "echo-token")
    setKeychainValue(state.powerampConnection.token, account: "poweramp-token")
    var publicState = state
    publicState.echoConnection.token = ""
    publicState.powerampConnection.token = ""
    if let data = try? JSONEncoder().encode(publicState) {
      UserDefaults.standard.set(data, forKey: defaultsKey)
    }
  }

  static func neteaseCookie() -> String {
    keychainValue(account: "netease-cookie") ?? ""
  }

  static func setNeteaseCookie(_ value: String) {
    setKeychainValue(value, account: "netease-cookie")
  }

  static var didMigrateLegacy: Bool {
    UserDefaults.standard.bool(forKey: migrationKey)
  }

  static func markLegacyMigrated() {
    UserDefaults.standard.set(true, forKey: migrationKey)
  }

  private static func keychainValue(account: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: account,
      kSecAttrService as String: service,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: true,
    ]
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  private static func setKeychainValue(_ value: String, account: String) {
    let identity: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: account,
      kSecAttrService as String: service,
    ]
    guard !value.isEmpty, let data = value.data(using: .utf8) else {
      SecItemDelete(identity as CFDictionary)
      return
    }
    let attributes = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ] as [String: Any]
    if SecItemUpdate(identity as CFDictionary, attributes as CFDictionary) == errSecSuccess {
      return
    }
    var item = identity
    attributes.forEach { item[$0.key] = $0.value }
    SecItemAdd(item as CFDictionary, nil)
  }
}
