import Foundation
import Security

struct XtreamClient {
    static let userAgent = "VLC/3.0.20 LibVLC/3.0.20"   // many panels reject unknown clients

    let base: URL
    let username: String
    let password: String

    enum ClientError: LocalizedError {
        case badHost, http(Int), badData, loginRejected
        var errorDescription: String? {
            switch self {
            case .badHost: return "That server address doesn't look right."
            case .http(let c): return "The server answered with error \(c)."
            case .badData: return "The server didn't return valid data. Check the host, username and password."
            case .loginRejected: return "Login rejected: wrong username/password or the account is disabled."
            }
        }
    }

    private static let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.httpAdditionalHeaders = ["User-Agent": XtreamClient.userAgent]
        c.timeoutIntervalForRequest = 60
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: c)
    }()

    /// "example.com:8080/player_api.php" -> http://example.com:8080
    static func normalize(_ raw: String) -> URL? {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return nil }
        let low = s.lowercased()
        if !low.hasPrefix("http://") && !low.hasPrefix("https://") { s = "http://" + s }
        guard var c = URLComponents(string: s), c.host != nil else { return nil }
        var path = c.path
        for suffix in ["player_api.php", "get.php", "panel_api.php", "xmltv.php"] where path.lowercased().hasSuffix("/" + suffix) {
            path = String(path.dropLast(suffix.count + 1))
        }
        while path.hasSuffix("/") { path.removeLast() }
        c.path = path
        c.query = nil
        c.fragment = nil
        return c.url
    }

    func call<T: Decodable>(_ action: String? = nil, _ params: [String: String] = [:], as type: T.Type = T.self) async throws -> T {
        guard var c = URLComponents(url: base.appendingPathComponent("player_api.php"), resolvingAgainstBaseURL: false) else { throw ClientError.badHost }
        var q = [URLQueryItem(name: "username", value: username), URLQueryItem(name: "password", value: password)]
        if let action { q.append(URLQueryItem(name: "action", value: action)) }
        for (k, v) in params { q.append(URLQueryItem(name: k, value: v)) }
        c.queryItems = q
        c.percentEncodedQuery = c.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")  // '+' in passwords
        guard let url = c.url else { throw ClientError.badHost }
        let (data, resp) = try await Self.session.data(from: url)
        if let h = resp as? HTTPURLResponse, !(200..<300).contains(h.statusCode) { throw ClientError.http(h.statusCode) }
        do { return try JSONDecoder().decode(T.self, from: data) } catch { throw ClientError.badData }
    }

    /// section: "live" | "movie" | "series"
    func streamURL(_ section: String, id: String, ext: String) -> URL {
        base.appendingPathComponent(section)
            .appendingPathComponent(username)
            .appendingPathComponent(password)
            .appendingPathComponent("\(id).\(ext)")
    }
}

enum Keychain {
    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "XtreamPlayer",
         kSecAttrAccount as String: key]
    }
    // Unsigned/ad-hoc builds (e.g. a sandboxed Mac app without a team) can be refused Keychain access
    // (errSecMissingEntitlement). Fall back to UserDefaults so the app still works for personal use.
    private static func fallbackKey(_ key: String) -> String { "pw.\(key)" }

    static func set(_ value: String, for key: String) {
        SecItemDelete(query(key) as CFDictionary)
        var q = query(key)
        q[kSecValueData as String] = Data(value.utf8)
        if SecItemAdd(q as CFDictionary, nil) == errSecSuccess {
            UserDefaults.standard.removeObject(forKey: fallbackKey(key))
        } else {
            UserDefaults.standard.set(value, forKey: fallbackKey(key))
        }
    }
    static func get(_ key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        if SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data {
            return String(data: d, encoding: .utf8)
        }
        return UserDefaults.standard.string(forKey: fallbackKey(key))
    }
    static func delete(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
        UserDefaults.standard.removeObject(forKey: fallbackKey(key))
    }
}
