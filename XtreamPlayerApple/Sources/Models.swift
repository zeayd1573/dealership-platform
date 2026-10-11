import Foundation

/// Xtream panels return ids/ratings as strings, ints, doubles or null depending on the panel.
struct Flex: Decodable, Hashable {
    let value: String
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) { value = s }
        else if let i = try? c.decode(Int.self) { value = String(i) }
        else if let d = try? c.decode(Double.self) { value = d.rounded() == d ? String(Int(d)) : String(d) }
        else if let b = try? c.decode(Bool.self) { value = b ? "1" : "0" }
        else { value = "" }
    }
}

enum Kind: String, Codable, CaseIterable { case live, movie, series }

/// One unified shape for channels, movies and series so the UI can treat them alike.
struct Item: Identifiable, Hashable {
    let kind: Kind
    let id: String
    let name: String
    let poster: URL?
    let categoryId: String
    let ext: String
    let rating: Double
    let lower: String
    var key: String { "\(kind.rawValue):\(id)" }
}

struct Category: Identifiable, Hashable { let id: String; let name: String }
struct Catalog { var categories: [Category]; var items: [Item] }

struct Episode: Identifiable, Hashable {
    let id: String
    let season: Int
    let number: Int
    let title: String
    let ext: String
    let duration: String
}

struct SeriesData {
    var plot: String
    var genre: String
    var cover: URL?
    var episodes: [Episode]
}

struct Profile: Identifiable, Codable, Hashable {
    var id = UUID()
    var name: String
    var host: String
    var username: String
    var password: String = ""   // stored in the Keychain, never in UserDefaults
    enum CodingKeys: String, CodingKey { case id, name, host, username }
}

/// A resume point. Persisted per playlist.
struct HistoryEntry: Codable, Hashable {
    enum EntryKind: String, Codable { case movie, episode }
    var key: String
    var kind: EntryKind
    var id: String          // movie stream id, or series id for episodes
    var episodeId: String?
    var season: Int?
    var number: Int?
    var title: String       // movie or series title
    var episodeTitle: String?
    var poster: URL?
    var ext: String
    var t: Double
    var d: Double
    var updated: Date
    var finished: Bool { d > 0 && t / d >= 0.92 }
}

// MARK: - API payloads

struct APIAuth: Decodable {
    struct UserInfo: Decodable {
        let auth: Flex?
        let status: String?
        let exp_date: Flex?
        let max_connections: Flex?
        let active_cons: Flex?
        let allowed_output_formats: [String]?
    }
    let user_info: UserInfo?
}

struct APICategory: Decodable { let category_id: Flex?; let category_name: String? }

struct APIStream: Decodable {
    let stream_id: Flex?
    let series_id: Flex?
    let name: String?
    let stream_icon: String?
    let cover: String?
    let category_id: Flex?
    let container_extension: String?
    let rating: Flex?
}

struct APIVodInfo: Decodable {
    struct Info: Decodable {
        let plot: String?
        let genre: String?
        let releasedate: String?
        let duration: Flex?
        let movie_image: String?
        let rating: Flex?
    }
    let info: Info?
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        info = try? c.decode(Info.self, forKey: .info)   // some panels send [] here
    }
    enum CodingKeys: String, CodingKey { case info }
}

struct APISeriesInfo: Decodable {
    struct Info: Decodable { let plot: String?; let genre: String?; let cover: String? }
    struct EpInfo: Decodable { let duration: Flex? }
    struct Ep: Decodable {
        let id: Flex
        let episode_num: Flex?
        let title: String?
        let container_extension: String?
        let season: Flex?
        let info: EpInfo?
    }
    let info: Info?
    let episodes: [String: [Ep]]
    enum CodingKeys: String, CodingKey { case info, episodes }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        info = try? c.decode(Info.self, forKey: .info)
        episodes = (try? c.decode([String: [Ep]].self, forKey: .episodes)) ?? [:]  // [] when empty
    }
}

struct APIEpg: Decodable {
    struct Listing: Decodable {
        let title: String?
        let description: String?
        let start_timestamp: Flex?
        let stop_timestamp: Flex?
    }
    let epg_listings: [Listing]?
}
