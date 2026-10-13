import SwiftUI

struct ItemDetail: View {
    let item: Item
    var body: some View {
        switch item.kind {
        case .series: SeriesDetail(item: item)
        default: MovieDetail(item: item)
        }
    }
}

private struct FavoriteButton: View {
    @EnvironmentObject var app: AppModel
    let item: Item
    var body: some View {
        Button { app.toggleFavorite(item) } label: {
            Label(app.isFavorite(item) ? "In My List" : "Add to My List", systemImage: app.isFavorite(item) ? "star.fill" : "star")
        }
        .buttonStyle(.bordered)
    }
}

private struct Header: View {
    let poster: URL?
    let title: String
    let meta: String
    let plot: String
    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Poster(url: poster).frame(width: 120, height: 180).clipShape(RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(.title2.bold())
                if !meta.isEmpty { Text(meta).font(.subheadline).foregroundStyle(.secondary) }
                if !plot.isEmpty { Text(plot).font(.callout).foregroundStyle(.secondary) }
            }
        }
    }
}

struct MovieDetail: View {
    @EnvironmentObject var app: AppModel
    let item: Item
    @State private var info: APIVodInfo.Info?

    var body: some View {
        let saved = app.history["movie:\(item.id)"]
        let canResume = (saved?.t ?? 0) > 30 && saved?.finished == false
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Header(poster: info?.movie_image.flatMap { URL(string: $0) } ?? item.poster, title: item.name,
                       meta: [info?.releasedate, info?.genre, info?.duration?.value, (info?.rating?.value).flatMap { $0.isEmpty ? nil : "★ \($0)" }]
                           .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "),
                       plot: info?.plot ?? "")
                HStack {
                    Button { if let r = app.movieRequest(item) { app.play(r) } } label: {
                        Label(canResume ? "Resume \(HomeView.clock(saved?.t ?? 0))" : "Play", systemImage: "play.fill")
                    }.buttonStyle(.borderedProminent)
                    if canResume {
                        Button("Start over") { if let r = app.movieRequest(item, startAt: 0) { app.play(r) } }.buttonStyle(.bordered)
                    }
                    FavoriteButton(item: item)
                }
            }.padding()
        }
        .navigationTitle(item.name)
        .task { info = await app.movieDetails(item) }
    }
}

struct SeriesDetail: View {
    @EnvironmentObject var app: AppModel
    let item: Item
    @State private var data: SeriesData?
    @State private var error: String?
    @State private var season: Int?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Header(poster: data?.cover ?? item.poster, title: item.name, meta: data?.genre ?? "", plot: data?.plot ?? "")
                if let error { Text(error).foregroundStyle(.red) }
                if let data {
                    let seasons = Array(Set(data.episodes.map(\.season))).sorted()
                    let rp = app.resumePoint(for: item, episodes: data.episodes)
                    HStack {
                        if let rp {
                            let e = data.episodes[rp.index]
                            Button { play(data, rp.index, rp.startAt) } label: {
                                Label("\(rp.isNext ? "Next" : "Continue"): S\(e.season) E\(e.number)" + (rp.startAt > 10 ? " (\(HomeView.clock(rp.startAt)))" : ""), systemImage: "play.fill")
                            }.buttonStyle(.borderedProminent)
                        } else if !data.episodes.isEmpty {
                            Button { play(data, 0, 0) } label: { Label("Play S\(data.episodes[0].season) E\(data.episodes[0].number)", systemImage: "play.fill") }
                                .buttonStyle(.borderedProminent)
                        }
                        FavoriteButton(item: item)
                    }
                    if seasons.count > 1 {
                        Picker("Season", selection: Binding(get: { season ?? rpSeason(data, rp) ?? seasons[0] }, set: { season = $0 })) {
                            ForEach(seasons, id: \.self) { Text("Season \($0)").tag($0) }
                        }.pickerStyle(.menu)
                    }
                    let current = season ?? rpSeason(data, rp) ?? seasons.first
                    VStack(spacing: 0) {
                        ForEach(Array(data.episodes.enumerated()).filter { $0.element.season == current }, id: \.element.id) { idx, e in
                            Button { play(data, idx, app.history["ep:\(e.id)"].map { $0.finished ? 0 : $0.t } ?? 0) } label: {
                                HStack {
                                    Text("\(e.number)").foregroundStyle(.secondary).frame(width: 30, alignment: .leading)
                                    Text(e.title.isEmpty ? "Episode \(e.number)" : e.title).lineLimit(2)
                                    Spacer()
                                    if let p = app.progress("ep:\(e.id)") {
                                        Text(p >= 0.92 ? "✓" : "\(Int(p * 100))%").foregroundStyle(.secondary)
                                    } else if !e.duration.isEmpty { Text(e.duration).font(.caption).foregroundStyle(.secondary) }
                                }
                                .padding(.vertical, 10).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            Divider()
                        }
                    }
                } else if error == nil {
                    ProgressView()
                }
            }.padding()
        }
        .navigationTitle(item.name)
        .task {
            do { data = try await app.seriesData(item) } catch { self.error = error.localizedDescription }
        }
    }

    private func rpSeason(_ d: SeriesData, _ rp: (index: Int, startAt: Double, isNext: Bool)?) -> Int? {
        rp.map { d.episodes[$0.index].season }
    }
    private func play(_ d: SeriesData, _ idx: Int, _ startAt: Double) {
        if let r = app.episodeRequest(series: item, episodes: d.episodes, index: idx, startAt: startAt) { app.play(r) }
    }
}
