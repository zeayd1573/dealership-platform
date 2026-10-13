import SwiftUI

struct ProfilesView: View {
    @EnvironmentObject var app: AppModel
    @State private var editing: Profile?
    @State private var adding = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if app.profiles.isEmpty {
                    Text("No playlists yet. Tap + to add the one from your IPTV provider.").foregroundStyle(.secondary)
                }
                ForEach(app.profiles) { p in
                    Button { connect(p) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.name).font(.headline)
                            Text("\(p.host) · \(p.username)").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button("Edit", systemImage: "pencil") { editing = p }
                        Button("Delete", systemImage: "trash", role: .destructive) { app.deleteProfile(p) }
                    }
                }
                .onDelete { idx in idx.map { app.profiles[$0] }.forEach(app.deleteProfile) }
            }
            .overlay { if app.connecting { ProgressView("Connecting…").padding().background(.regularMaterial).clipShape(RoundedRectangle(cornerRadius: 12)) } }
            .navigationTitle("Xtream Player")
            .toolbar { Button { adding = true } label: { Label("Add playlist", systemImage: "plus") } }
            .sheet(isPresented: $adding) { ProfileForm(profile: nil, onSaved: connect) }
            .sheet(item: $editing) { p in ProfileForm(profile: p, onSaved: connect) }
            .alert("Couldn't connect", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(error ?? "") }
        }
    }

    private func connect(_ p: Profile) {
        Task {
            do { try await app.connect(p) } catch { self.error = error.localizedDescription }
        }
    }
}

struct ProfileForm: View {
    @EnvironmentObject var app: AppModel
    @Environment(\.dismiss) private var dismiss
    let profile: Profile?
    let onSaved: (Profile) -> Void

    @State private var name = ""
    @State private var host = ""
    @State private var username = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Playlist") {
                    TextField("Playlist name", text: $name)
                    TextField("Server host (http://example.com:8080)", text: $host)
                    TextField("Username", text: $username)
                    SecureField("Password", text: $password)
                }
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
                if let error { Text(error).foregroundStyle(.red) }
            }
            .formStyle(.grouped)
            .navigationTitle(profile == nil ? "Add playlist" : "Edit playlist")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Checking…" : "Save & connect") { save() }
                        .disabled(busy || name.isEmpty || host.isEmpty || username.isEmpty || password.isEmpty)
                }
            }
            .onAppear {
                if let p = profile { name = p.name; host = p.host; username = p.username; password = p.password }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 360)
        #endif
    }

    private func save() {
        var p = profile ?? Profile(name: "", host: "", username: "")
        p.name = name.trimmingCharacters(in: .whitespaces)
        p.host = host.trimmingCharacters(in: .whitespaces)
        p.username = username.trimmingCharacters(in: .whitespaces)
        p.password = password
        busy = true; error = nil
        Task {
            do {
                try await app.verify(p)
                app.saveProfile(p)
                dismiss()
                onSaved(p)
            } catch { self.error = error.localizedDescription }
            busy = false
        }
    }
}
