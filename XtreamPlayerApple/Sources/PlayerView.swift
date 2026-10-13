import SwiftUI
import AVKit
import Combine

@MainActor
final class PlayerModel: ObservableObject {
    @Published var request: PlaybackRequest
    @Published var message: String? = "Loading…"
    @Published var epg: [APIEpg.Listing] = []
    let player = AVPlayer()

    private let app: AppModel
    private var bag = Set<AnyCancellable>()
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?

    init(app: AppModel, request: PlaybackRequest) {
        self.app = app
        self.request = request
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setCategory(.playback)   // play even with the silent switch on
        #endif
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 5, preferredTimescale: 1), queue: .main) { [weak self] _ in
            Task { @MainActor in self?.save() }
        }
        start(request)
    }

    var hasNext: Bool { request.next?() != nil }
    var hasPrev: Bool { request.prev?() != nil }

    func start(_ r: PlaybackRequest) {
        save()
        request = r
        message = "Loading…"
        epg = []
        bag.removeAll()
        if let o = endObserver { NotificationCenter.default.removeObserver(o); endObserver = nil }

        let asset = AVURLAsset(url: r.url, options: ["AVURLAssetHTTPHeaderFieldsKey": ["User-Agent": XtreamClient.userAgent]])
        let item = AVPlayerItem(asset: asset)
        let startAt = r.startAt
        let isLive = r.live
        item.publisher(for: \.status).receive(on: DispatchQueue.main).sink { [weak self] status in
            Task { @MainActor in
                guard let self else { return }
                switch status {
                case .readyToPlay:
                    self.message = nil
                    let d = item.duration.seconds
                    if startAt > 10, d.isFinite, startAt < d - 20 {
                        _ = await self.player.seek(to: CMTime(seconds: startAt, preferredTimescale: 600))
                    }
                case .failed:
                    let why = item.error?.localizedDescription ?? "Playback failed"
                    self.message = why + (isLive ? "\nThe channel may be offline." : "\nThis format may not be supported on Apple devices.")
                default: break
                }
            }
        }.store(in: &bag)
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.ended() }
        }
        player.replaceCurrentItem(with: item)
        player.play()

        if let ch = r.channel {
            Task { self.epg = await app.epg(for: ch) }
        }
    }

    private func ended() {
        save(force: true)
        if request.autoAdvance, let n = request.next?() { start(n) }
    }

    func goNext() { if let n = request.next?() { start(n) } }
    func goPrev() { if let p = request.prev?() { start(p) } }

    func save(force: Bool = false) {
        guard let meta = request.meta else { return }
        let d = player.currentItem?.duration.seconds ?? 0
        let t = player.currentTime().seconds
        guard d.isFinite, d > 0, t.isFinite, (t > 0 || force) else { return }
        app.record(meta, t: force ? d : t, d: d)
    }

    func shutdown() {
        save()
        player.pause()
        if let o = timeObserver { player.removeTimeObserver(o); timeObserver = nil }
        if let o = endObserver { NotificationCenter.default.removeObserver(o); endObserver = nil }
        bag.removeAll()
        player.replaceCurrentItem(with: nil)
    }
}

struct PlayerView: View {
    @StateObject private var model: PlayerModel
    @Environment(\.dismiss) private var dismiss

    init(app: AppModel, request: PlaybackRequest) {
        _model = StateObject(wrappedValue: PlayerModel(app: app, request: request))
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VideoPlayer(player: model.player).ignoresSafeArea()
            if let m = model.message {
                Text(m).multilineTextAlignment(.center).foregroundStyle(.white)
                    .padding().background(.black.opacity(0.7)).clipShape(RoundedRectangle(cornerRadius: 10))
                    .allowsHitTesting(false)
            }
            VStack(spacing: 0) {
                HStack(spacing: 14) {
                    Button { model.shutdown(); dismiss() } label: { Image(systemName: "xmark.circle.fill").font(.title) }
                    Text(model.request.title).font(.headline).lineLimit(1)
                    Spacer()
                    if model.hasPrev { Button { model.goPrev() } label: { Image(systemName: "backward.end.fill").font(.title2) } }
                    if model.hasNext { Button { model.goNext() } label: { Image(systemName: "forward.end.fill").font(.title2) } }
                }
                .buttonStyle(.plain).foregroundStyle(.white)
                .padding(12).background(LinearGradient(colors: [.black.opacity(0.7), .clear], startPoint: .top, endPoint: .bottom))
                Spacer()
                if !model.epg.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(model.epg.prefix(3).enumerated()), id: \.offset) { _, l in
                            Text(timeRange(l) + " " + decode(l.title)).font(.caption).foregroundStyle(.white)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(10).background(.black.opacity(0.55))
                    .padding(.bottom, 56)   // keep clear of the system transport controls
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 900, minHeight: 560)
        #endif
        .onDisappear { model.shutdown() }
    }

    private func decode(_ s: String?) -> String {
        guard let s, let d = Data(base64Encoded: s), let t = String(data: d, encoding: .utf8) else { return s ?? "" }
        return t
    }
    private func timeRange(_ l: APIEpg.Listing) -> String {
        guard let a = Double(l.start_timestamp?.value ?? ""), let b = Double(l.stop_timestamp?.value ?? "") else { return "" }
        let f = DateFormatter(); f.timeStyle = .short; f.dateStyle = .none
        return "\(f.string(from: Date(timeIntervalSince1970: a)))–\(f.string(from: Date(timeIntervalSince1970: b)))"
    }
}
