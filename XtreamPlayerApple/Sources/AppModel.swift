import Foundation
import SwiftUI

struct PlaybackRequest: Identifiable {
    let id = UUID()
    var url: URL
    var title: String
    var meta: HistoryEntry?          // nil for live TV (nothing to resume)
    var startAt: Double = 0
    var live = false
    var channel: Item?
    var autoAdvance = false          // episodes roll into the next one
    var next: (() -> PlaybackRequest?)?
    var prev: (() -> PlaybackRequest?)?
}

struct ContinueCard: Identifiable {
    var id: String { entry.key + (nextEpisode?.id ?? "") }
    let entry: HistoryEntry
    let nextEpisode: Episode?        // set when the last episode was finished
    let seriesItem: Item?
}

@MainActor
final class AppModel: ObservableObject {
    @Published var profiles: [Profile] = []
    @Published var profile: Profile?
    @Published var user: APIAuth.UserInfo?
    @Published var catalog: [Kind: Catalog] = [:]
    @Published var loadError: [Kind: String] = [:]
    @Published var favorites: Set<String> = []
    @Published var history: [String: HistoryEntry] = [:]
    @Published var playback: PlaybackRequest?
    @Published var connecting = false

    private(set) var client: XtreamClient?
    private var seriesCache: [String: SeriesData] = [:]
    private let defaults = UserDefaults.standard

    init() {
        if let data = defaults.data(forKey: "profiles"), var list = try? JSONDecoder().decode([Profile].self, from: data) {
            for i in list.indices { list[i].password = Keychain.get(list[i].id.uuidString) ?? "" }
            profiles = list
        }
    }

    // MARK: profiles

    func saveProfile(_ p: Profile) {
        Keychain.set(p.password, for: p.id.uuidString)
        if let i = profiles.firstIndex(where: { $0.id == p.id }) { profiles[i] = p } else { profiles.append(p) }
        persistProfiles()
    }
    func deleteProfile(_ p: Profile) {
        Keychain.delete(p.id.uuidString)
        defaults.removeObject(forKey: "favs.\(p.id)")
        defaults.removeObject(forKey: "hist.\(p.id)")
        profiles.removeAll { $0.id == p.id }
        persistProfiles()
    }
    private func persistProfiles() {
        if let d = try? JSONEncoder().encode(profiles) { defaults.set(d, forKey: "profiles") }
    }

    /// Verifies credentials without switching to the profile.
    func verify(_ p: Profile) async throws {
        guard let base = XtreamClient.normalize(p.host) else { throw XtreamClient.ClientError.badHost }
        let c = XtreamClient(base: base, username: p.username, password: p.password)
        let a = try await c.call(as: APIAuth.self)
        guard a.user_info?.auth?.value == "1" else { throw XtreamClient.ClientError.loginRejected }
    }

    func connect(_ p: Profile) async throws {
        guard let base = XtreamClient.normalize(p.host) else { throw XtreamClient.ClientError.badHost }
        connecting = true
        defer { connecting = false }
        let c = XtreamClient(base: base, username: p.username, password: p.password)
        let a = try await c.call(as: APIAuth.self)
        guard a.user_info?.auth?.value == "1" else { throw XtreamClient.ClientError.loginRejected }
        client = c
        user = a.user_info
        catalog = [:]; loadError = [:]; seriesCache = [:]
        favorites = Set(defaults.stringArray(forKey: "favs.\(p.id)") ?? [])
        if let d = defaults.data(forKey: "hist.\(p.id)"), let h = try? JSONDecoder().decode([String: HistoryEntry].self, from: d) { history = h } else { history = [:] }
        profile = p
        defaults.set(p.id.uuidString, forKey: "lastProfile")
    }

    func restoreLastProfile() async {
        guard profile == nil, let s = defaults.string(forKey: "lastProfile"), let p = profiles.first(where: { $0.id.uuidString == s }) else { return }
        try? await connect(p)
    }

    func disconnect() { playback = nil; profile = nil; client = nil }

    // MARK: catalog

    @Published var loadStats: [Kind: String] = [:]

    private func makeItem(_ s: APIStream, kind: Kind, category: String? = nil) -> Item? {
        guard let id = (kind == .series ? s.series_id : s.stream_id)?.value, !id.isEmpty else { return nil }
        let name = s.name ?? ""
        let icon = (kind == .series ? s.cover : s.stream_icon).flatMap { $0.isEmpty ? nil : URL(string: $0) }
        var cats = Set<String>()
        let primary = s.category_id?.value ?? category ?? ""
        cats.insert(primary)
        if let category { cats.insert(category) }
        return Item(kind: kind, id: id, name: name, poster: icon, categoryId: primary, ext: s.container_extension ?? "mp4",
                    rating: Double(s.rating?.value ?? "") ?? 0, lower: name.lowercased(), categoryIds: cats)
    }

    func load(_ kind: Kind, force: Bool = false) async {
        if catalog[kind] != nil && !force { return }
        guard let c = client else { return }
        let (catAction, itemAction): (String, String) = {
            switch kind {
            case .live: return ("get_live_categories", "get_live_streams")
            case .movie: return ("get_vod_categories", "get_vod_streams")
            case .series: return ("get_series_categories", "get_series")
            }
        }()
        do {
            async let cats: [APICategory]? = try? c.callList(catAction)
            async let streams: [APIStream] = c.callList(itemAction)
            let cs = (await cats) ?? []
            let ss = try await streams
            let categories = cs.compactMap { x -> Category? in
                guard let id = x.category_id?.value else { return nil }
                return Category(id: id, name: x.category_name ?? "Category \(id)")
            }
            var byId: [String: Item] = [:]
            var order: [String] = []
            for s in ss { if let it = makeItem(s, kind: kind), byId[it.id] == nil { byId[it.id] = it; order.append(it.id) } }
            let unfiltered = order.count
            catalog[kind] = Catalog(categories: categories, items: order.compactMap { byId[$0] })
            loadStats[kind] = "\(unfiltered) titles"
            loadError[kind] = nil

            // Some panels cap/truncate the unfiltered list; apps like IPTV Smarters ask per category. Merge anything missing.
            guard kind != .live, !categories.isEmpty, categories.count <= 400 else { return }
            var pending = categories.map(\.id)
            await withTaskGroup(of: (String, [APIStream]).self) { group in
                func next() { if !pending.isEmpty { let cid = pending.removeFirst(); group.addTask { (cid, (try? await c.callList(itemAction, ["category_id": cid], as: APIStream.self)) ?? []) } } }
                for _ in 0..<5 { next() }
                while let (cid, list) = await group.next() {
                    for s in list {
                        guard let it = makeItem(s, kind: kind, category: cid) else { continue }
                        if var existing = byId[it.id] { existing.categoryIds.insert(cid); byId[it.id] = existing }
                        else { byId[it.id] = it; order.append(it.id) }
                    }
                    next()
                }
            }
            guard client?.base == c.base else { return }   // user switched playlists meanwhile
            catalog[kind] = Catalog(categories: categories, items: order.compactMap { byId[$0] })
            loadStats[kind] = "\(order.count) titles (server's full list had \(unfiltered))"
        } catch {
            loadError[kind] = error.localizedDescription
        }
    }

    func movieDetails(_ item: Item) async -> APIVodInfo.Info? {
        let r = try? await client?.call("get_vod_info", ["vod_id": item.id], as: APIVodInfo.self)
        return r?.info
    }

    func seriesData(_ item: Item) async throws -> SeriesData {
        if let s = seriesCache[item.id] { return s }
        guard let c = client else { throw XtreamClient.ClientError.badHost }
        let r = try await c.call("get_series_info", ["series_id": item.id], as: APISeriesInfo.self)
        var eps: [Episode] = []
        for key in r.episodes.keys.sorted(by: { (Int($0) ?? 0) < (Int($1) ?? 0) }) {
            for (i, e) in (r.episodes[key] ?? []).enumerated() {
                eps.append(Episode(id: e.id.value,
                                   season: Int(e.season?.value ?? "") ?? Int(key) ?? 1,
                                   number: Int(e.episode_num?.value ?? "") ?? (i + 1),
                                   title: e.title ?? "",
                                   ext: e.container_extension ?? "mp4",
                                   duration: e.info?.duration?.value ?? ""))
            }
        }
        let data = SeriesData(plot: r.info?.plot ?? "", genre: r.info?.genre ?? "", cover: r.info?.cover.flatMap { URL(string: $0) } ?? item.poster, episodes: eps)
        seriesCache[item.id] = data
        return data
    }

    func epg(for item: Item) async -> [APIEpg.Listing] {
        let r = try? await client?.call("get_short_epg", ["stream_id": item.id, "limit": "6"], as: APIEpg.self)
        return r?.epg_listings ?? []
    }

    // MARK: favorites

    func isFavorite(_ item: Item) -> Bool { favorites.contains(item.key) }
    func toggleFavorite(_ item: Item) {
        if favorites.contains(item.key) { favorites.remove(item.key) } else { favorites.insert(item.key) }
        if let p = profile { defaults.set(Array(favorites), forKey: "favs.\(p.id)") }
    }
    func favoriteItems(_ kind: Kind) -> [Item] {
        (catalog[kind]?.items ?? []).filter { favorites.contains($0.key) }
    }

    // MARK: history / continue watching

    func record(_ meta: HistoryEntry, t: Double, d: Double) {
        var e = meta
        e.t = t; e.d = d; e.updated = Date()
        history[e.key] = e
        if history.count > 60 {
            for k in history.values.sorted(by: { $0.updated > $1.updated }).dropFirst(60).map(\.key) { history[k] = nil }
        }
        if let p = profile, let d = try? JSONEncoder().encode(history) { defaults.set(d, forKey: "hist.\(p.id)") }
    }
    func progress(_ key: String) -> Double? {
        guard let h = history[key], h.d > 0 else { return nil }
        return min(1, h.t / h.d)
    }
    func removeFromContinue(_ card: ContinueCard) {
        for e in history.values where e.kind == card.entry.kind && e.id == card.entry.id {
            history[e.key] = nil
        }
        if let p = profile, let d = try? JSONEncoder().encode(history) { defaults.set(d, forKey: "hist.\(p.id)") }
    }

    func continueCards() async -> [ContinueCard] {
        var seen = Set<String>()
        var out: [ContinueCard] = []
        for e in history.values.sorted(by: { $0.updated > $1.updated }) {
            let group = (e.kind == .movie ? "m" : "s") + e.id
            if !seen.insert(group).inserted { continue }
            if e.kind == .movie {
                if !e.finished && e.t > 20 { out.append(ContinueCard(entry: e, nextEpisode: nil, seriesItem: nil)) }
                continue
            }
            let series = seriesItem(id: e.id, title: e.title, poster: e.poster)
            if !e.finished { out.append(ContinueCard(entry: e, nextEpisode: nil, seriesItem: series)); continue }
            if let data = try? await seriesData(series),
               let i = data.episodes.firstIndex(where: { $0.id == e.episodeId }), i + 1 < data.episodes.count {
                out.append(ContinueCard(entry: e, nextEpisode: data.episodes[i + 1], seriesItem: series))
            }
        }
        return Array(out.prefix(20))
    }

    func seriesItem(id: String, title: String, poster: URL?) -> Item {
        catalog[.series]?.items.first { $0.id == id }
            ?? Item(kind: .series, id: id, name: title, poster: poster, categoryId: "", ext: "mp4", rating: 0, lower: title.lowercased())
    }

    func resumePoint(for series: Item, episodes: [Episode]) -> (index: Int, startAt: Double, isNext: Bool)? {
        guard let last = history.values.filter({ $0.kind == .episode && $0.id == series.id }).max(by: { $0.updated < $1.updated }),
              let i = episodes.firstIndex(where: { $0.id == last.episodeId }) else { return nil }
        if !last.finished { return (i, last.t, false) }
        return i + 1 < episodes.count ? (i + 1, 0, true) : nil
    }

    // MARK: playback requests

    func play(_ r: PlaybackRequest) { playback = r }

    func movieRequest(_ item: Item, startAt: Double? = nil) -> PlaybackRequest? {
        guard let c = client else { return nil }
        let key = "movie:\(item.id)"
        let meta = HistoryEntry(key: key, kind: .movie, id: item.id, title: item.name, poster: item.poster, ext: item.ext, t: 0, d: 0, updated: Date())
        return PlaybackRequest(url: c.streamURL("movie", id: item.id, ext: item.ext), title: item.name, meta: meta,
                               startAt: startAt ?? history[key]?.t ?? 0)
    }

    func episodeRequest(series: Item, episodes: [Episode], index: Int, startAt: Double = 0) -> PlaybackRequest? {
        guard let c = client, episodes.indices.contains(index) else { return nil }
        let e = episodes[index]
        let meta = HistoryEntry(key: "ep:\(e.id)", kind: .episode, id: series.id, episodeId: e.id, season: e.season, number: e.number,
                                title: series.name, episodeTitle: e.title, poster: series.poster, ext: e.ext, t: 0, d: 0, updated: Date())
        var r = PlaybackRequest(url: c.streamURL("series", id: e.id, ext: e.ext),
                                title: "\(series.name) – S\(e.season)E\(e.number) \(e.title)", meta: meta, startAt: startAt)
        r.autoAdvance = true
        r.next = { [weak self] in self?.episodeRequest(series: series, episodes: episodes, index: index + 1) }
        r.prev = index > 0 ? { [weak self] in self?.episodeRequest(series: series, episodes: episodes, index: index - 1) } : nil
        return r
    }

    func liveRequest(_ item: Item, in list: [Item]) -> PlaybackRequest? {
        guard let c = client else { return nil }
        let formats = (user?.allowed_output_formats ?? ["m3u8", "ts"]).map { $0.lowercased() }
        let ext = formats.contains("m3u8") || !formats.contains("ts") ? "m3u8" : "ts"
        var r = PlaybackRequest(url: c.streamURL("live", id: item.id, ext: ext), title: item.name)
        r.live = true
        r.channel = item
        let i = list.firstIndex(of: item)
        r.next = { [weak self] in
            guard let i, i + 1 < list.count else { return nil }
            return self?.liveRequest(list[i + 1], in: list)
        }
        r.prev = { [weak self] in
            guard let i, i > 0 else { return nil }
            return self?.liveRequest(list[i - 1], in: list)
        }
        return r
    }
}
