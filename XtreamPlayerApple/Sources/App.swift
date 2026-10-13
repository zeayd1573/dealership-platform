import SwiftUI

@main
struct XtreamPlayerApp: App {
    @StateObject private var app = AppModel()
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .preferredColorScheme(.dark)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var app: AppModel
    var body: some View {
        Group {
            if app.profile == nil { ProfilesView() } else { MainView() }
        }
        .task { await app.restoreLastProfile() }
    }
}
