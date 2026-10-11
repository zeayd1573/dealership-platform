import SwiftUI

struct Poster: View {
    let url: URL?
    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let img): img.resizable().scaledToFill()
            default:
                ZStack { Color.gray.opacity(0.25); Image(systemName: "film").foregroundStyle(.secondary) }
            }
        }
    }
}

/// 2:3 poster tile with optional progress bar and subtitle.
struct PosterCard: View {
    let url: URL?
    let title: String
    var subtitle: String? = nil
    var progress: Double? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Color.clear
                .aspectRatio(2 / 3, contentMode: .fit)
                .overlay(Poster(url: url))
                .overlay(alignment: .bottom) {
                    if let progress, progress > 0 {
                        GeometryReader { g in
                            Rectangle().fill(Color.accentColor).frame(width: g.size.width * progress, height: 3)
                                .frame(maxHeight: .infinity, alignment: .bottom)
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 8))
            Text(title).font(.caption).lineLimit(2).multilineTextAlignment(.leading)
            if let subtitle { Text(subtitle).font(.caption2).foregroundStyle(.secondary) }
        }
    }
}

struct FavoriteMenu: ViewModifier {
    @EnvironmentObject var app: AppModel
    let item: Item
    func body(content: Content) -> some View {
        content.contextMenu {
            Button(app.isFavorite(item) ? "Remove from My List" : "Add to My List",
                   systemImage: app.isFavorite(item) ? "star.slash" : "star") { app.toggleFavorite(item) }
        }
    }
}
extension View { func favoriteMenu(_ item: Item) -> some View { modifier(FavoriteMenu(item: item)) } }

struct ChannelRow: View {
    @EnvironmentObject var app: AppModel
    let item: Item
    let list: [Item]
    var body: some View {
        HStack(spacing: 12) {
            Button {
                if let r = app.liveRequest(item, in: list) { app.play(r) }
            } label: {
                HStack(spacing: 12) {
                    Poster(url: item.poster).frame(width: 40, height: 40).clipShape(RoundedRectangle(cornerRadius: 6))
                    Text(item.name).lineLimit(2)
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button { app.toggleFavorite(item) } label: {
                Image(systemName: app.isFavorite(item) ? "star.fill" : "star").foregroundStyle(app.isFavorite(item) ? .yellow : .secondary)
            }
            .buttonStyle(.borderless)
        }
    }
}

struct PosterGrid: View {
    let items: [Item]
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 115, maximum: 170), spacing: 12, alignment: .top)], spacing: 14) {
            ForEach(items) { item in ItemLink(item: item).id(item.id) }
        }
    }
}

struct ItemLink: View {
    @EnvironmentObject var app: AppModel
    let item: Item
    var body: some View {
        NavigationLink(value: item) {
            PosterCard(url: item.poster, title: item.name, progress: item.kind == .movie ? app.progress("movie:\(item.id)") : nil)
        }
        .buttonStyle(.plain)
        .favoriteMenu(item)
    }
}
