import SwiftUI

struct MainView: View {
    @EnvironmentObject var app: AppModel

    var body: some View {
        TabView {
            HomeView().tabItem { Label("Home", systemImage: "house") }
            BrowseView(kind: .live).tabItem { Label("Live TV", systemImage: "tv") }
            BrowseView(kind: .movie).tabItem { Label("Movies", systemImage: "film") }
            BrowseView(kind: .series).tabItem { Label("Series", systemImage: "rectangle.stack") }
            MyListView().tabItem { Label("My List", systemImage: "star") }
        }
        #if os(iOS)
        .fullScreenCover(item: $app.playback) { r in PlayerView(app: app, request: r) }
        #else
        .sheet(item: $app.playback) { r in PlayerView(app: app, request: r) }
        #endif
    }
}

private func accountLine(_ app: AppModel) -> String {
    guard let u = app.user else { return "" }
    var exp = "unlimited"
    if let s = u.exp_date?.value, let t = Double(s), t > 0 {
        exp = Date(timeIntervalSince1970: t).formatted(date: .abbreviated, time: .omitted)
    }
    return "\(u.status ?? "Active") · expires \(exp) · \(u.active_cons?.value ?? "?")/\(u.max_connections?.value ?? "?") connections"
}

// MARK: - Home (Continue Watching + My List)

struct HomeView: View {
    @EnvironmentObject var app: AppModel
    @State private var cards: [ContinueCard] = []
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if !cards.isEmpty {
                        Shelf(title: "Continue Watching") {
                            ForEach(cards) { card in
                                Button { resume(card) } label: { continueCard(card) }
                                    .buttonStyle(.plain)
                                    .contextMenu { Button("Remove from Continue Watching") { app.removeFromContinue(card); refresh() } }
                            }
                        }
                    }
                    let series = app.favoriteItems(.series), movies = app.favoriteItems(.movie), live = app.favoriteItems(.live)
                    if !series.isEmpty { Shelf(title: "My Series") { ForEach(series) { shelfLink($0) } } }
                    if !movies.isEmpty { Shelf(title: "My Movies") { ForEach(movies) { shelfLink($0) } } }
                    if !live.isEmpty {
                        Shelf(title: "My Channels") {
                            ForEach(live) { ch in
                                Button { if let r = app.liveRequest(ch, in: live) { app.play(r) } } label: {
                                    VStack(spacing: 6) {
                                        Poster(url: ch.poster).frame(width: 110, height: 70).clipShape(RoundedRectangle(cornerRadius: 8))
                                        Text(ch.name).font(.caption).lineLimit(1).frame(width: 110)
                                    }
                                }.buttonStyle(.plain)
                            }
                        }
                    }
                    if loaded && cards.isEmpty && series.isEmpty && movies.isEmpty && live.isEmpty {
                        VStack(spacing: 8) {
                            Text("Welcome 👋").font(.title2.bold())
                            Text("Browse Live TV, Movies or Series. Long-press (or right-click) anything to add it to My List. Whatever you start watching shows up here under Continue Watching.")
                                .multilineTextAlignment(.center).foregroundStyle(.secondary)
                        }.frame(maxWidth: .infinity).padding(.top, 60)
                    }
                }
                .padding()
            }
            .navigationTitle(app.profile?.name ?? "Home")
            .toolbar {
                ToolbarItem(placement: .navigation) { Button { app.disconnect() } label: { Label("Playlists", systemImage: "list.bullet") } }
            }
            .safeAreaInset(edge: .bottom) {
                Text(accountLine(app)).font(.caption2).foregroundStyle(.secondary).padding(.bottom, 4)
            }
            .navigationDestination(for: Item.self) { ItemDetail(item: $0) }
            .task(id: "\(app.playback == nil)-\(app.favorites.count)-\(app.history.count)") { await reload() }
        }
    }

    private func refresh() { Task { await reload() } }

    private func reload() async {
        if !app.favorites.isEmpty { for k in Kind.allCases { await app.load(k) } }
        cards = await app.continueCards()
        loaded = true
    }

    private func shelfLink(_ item: Item) -> some View {
        ItemLink(item: item).frame(width: 120)
    }

    private func continueCard(_ c: ContinueCard) -> some View {
        let e = c.entry
        let sub: String
        let prog: Double?
        if let n = c.nextEpisode { sub = "S\(n.season) E\(n.number) · Up next"; prog = nil }
        else if e.kind == .episode { sub = "S\(e.season ?? 0) E\(e.number ?? 0) · \(Self.clock(e.t))"; prog = e.d > 0 ? e.t / e.d : nil }
        else { sub = "\(Self.clock(e.t)) / \(Self.clock(e.d))"; prog = e.d > 0 ? e.t / e.d : nil }
        return PosterCard(url: e.poster, title: e.title, subtitle: sub, progress: prog).frame(width: 130)
    }

    static func clock(_ s: Double) -> String {
        let t = Int(max(0, s)); let h = t / 3600, m = (t % 3600) / 60, sec = t % 60
        let two = { (n: Int) in n < 10 ? "0\(n)" : "\(n)" }
        return h > 0 ? "\(h):\(two(m)):\(two(sec))" : "\(m):\(two(sec))"
    }

    private func resume(_ c: ContinueCard) {
        let e = c.entry
        if e.kind == .movie {
            let item = Item(kind: .movie, id: e.id, name: e.title, poster: e.poster, categoryId: "", ext: e.ext, rating: 0, lower: "")
            if let r = app.movieRequest(item) { app.play(r) }
            return
        }
        guard let series = c.seriesItem else { return }
        Task {
            guard let data = try? await app.seriesData(series) else { return }
            let targetId = c.nextEpisode?.id ?? e.episodeId
            guard let idx = data.episodes.firstIndex(where: { $0.id == targetId }),
                  let r = app.episodeRequest(series: series, episodes: data.episodes, index: idx, startAt: c.nextEpisode == nil ? e.t : 0) else { return }
            app.play(r)
        }
    }
}

struct Shelf<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.title3.bold())
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 12) { content }
            }
        }
    }
}

// MARK: - Browse

struct BrowseView: View {
    @EnvironmentObject var app: AppModel
    let kind: Kind
    @State private var category = "all"
    @State private var query = ""

    private var title: String { kind == .live ? "Live TV" : kind == .movie ? "Movies" : "Series" }
    private var filtered: [Item] {
        var items = app.catalog[kind]?.items ?? []
        if category != "all" { items = items.filter { $0.categoryId == category || $0.categoryIds.contains(category) } }
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        if !q.isEmpty { items = items.filter { $0.lower.contains(q) } }
        return items
    }

    var body: some View {
        NavigationStack {
            Group {
                if app.catalog[kind] != nil {
                    let items = filtered
                    if items.isEmpty {
                        Text("Nothing found.").foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if kind == .live {
                        List(items) { ChannelRow(item: $0, list: items) }.listStyle(.plain)
                    } else {
                        ScrollView { PosterGrid(items: items).padding() }
                    }
                } else if let e = app.loadError[kind] {
                    VStack(spacing: 12) {
                        Text("Couldn't load: \(e)").multilineTextAlignment(.center)
                        Button("Try again") { Task { await app.load(kind, force: true) } }
                    }.padding()
                } else {
                    ProgressView("Loading…")
                }
            }
            .navigationTitle(title)
            .safeAreaInset(edge: .bottom) {
                if let t = app.loadStats[kind] { Text(t).font(.caption2).foregroundStyle(.secondary).padding(.bottom, 2) }
            }
            .searchable(text: $query, prompt: "Search \(title)")
            .toolbar {
                ToolbarItem {
                    Menu {
                        Picker("Category", selection: $category) {
                            Text("All").tag("all")
                            ForEach(app.catalog[kind]?.categories ?? []) { Text($0.name).tag($0.id) }
                        }.pickerStyle(.inline)
                    } label: { Label("Category", systemImage: "line.3.horizontal.decrease.circle") }
                }
                ToolbarItem {
                    Button { Task { await app.load(kind, force: true) } } label: { Label("Reload", systemImage: "arrow.clockwise") }
                }
            }
            .navigationDestination(for: Item.self) { ItemDetail(item: $0) }
            .task { await app.load(kind) }
        }
    }
}

// MARK: - My List

struct MyListView: View {
    @EnvironmentObject var app: AppModel
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    let series = app.favoriteItems(.series), movies = app.favoriteItems(.movie), live = app.favoriteItems(.live)
                    if series.isEmpty && movies.isEmpty && live.isEmpty {
                        Text("Nothing here yet. Long-press (or right-click) a title and choose “Add to My List”.")
                            .foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.top, 60)
                    }
                    if !series.isEmpty { Text("Series").font(.title3.bold()); PosterGrid(items: series) }
                    if !movies.isEmpty { Text("Movies").font(.title3.bold()); PosterGrid(items: movies) }
                    if !live.isEmpty {
                        Text("Channels").font(.title3.bold())
                        ForEach(live) { ChannelRow(item: $0, list: live) }
                    }
                }.padding()
            }
            .navigationTitle("My List")
            .navigationDestination(for: Item.self) { ItemDetail(item: $0) }
            .task { for k in Kind.allCases { await app.load(k) } }
        }
    }
}
