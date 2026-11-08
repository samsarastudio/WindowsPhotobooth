import SwiftUI
import PhotosUI
import UIKit
import Security

private let baseURL = URL(string: "https://live.inmomentservices.com")!

struct Event: Decodable {
    let slug: String
    let title: String
    let description: String
    let status: String
    let visibility: String
    let reveal: Double
    let closes_at: Double?
    let cover_url: String?
}
struct EventState: Decodable {
    let event: Event
    let joined: Bool
    let remaining: Int
    let revealed: Bool
    let uploads_enabled: Bool?
    let server_time: Double?
    let features: LiveFeatures?
}
struct LiveFeatures: Decodable { let downloads: Bool; let revealExperience: Bool }
struct Photo: Decodable, Identifiable {
    let id: String
    let url: String
    let guest_name: String
}
struct JoinResponse: Decodable { let guest_token: String? }
struct APIError: Decodable { let error: String }

enum GuestKeychain {
    static func read(_ slug: String) -> String {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "MomentsLive", kSecAttrAccount as String: slug, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }
    static func save(_ value: String, slug: String) {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "MomentsLive", kSecAttrAccount as String: slug]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
}

@MainActor final class MomentsModel: ObservableObject {
    @Published var slug = ""
    @Published var state: EventState?
    @Published var photos: [Photo] = []
    @Published var error: String?
    @Published var busy = false
    @Published var message = ""
    var auth: String { GuestKeychain.read(slug) }

    func open(_ url: URL) {
        let parts = url.pathComponents.filter { $0 != "/" }
        guard url.scheme == "https", url.host == baseURL.host, parts.count == 2, parts[0] == "e", parts[1].range(of: "^[a-z0-9-]+$", options: .regularExpression) != nil else { error = "Open a valid Moments Live event link."; return }
        slug = parts[1]; state = nil; photos = []
        UserDefaults.standard.set(url.absoluteString, forKey: "lastEvent")
        Task { await refresh() }
    }
    func request(_ endpoint: String, method: String = "GET", body: Data? = nil, contentType: String = "application/json", guestToken: String? = nil) async throws -> Data {
        guard let url = URL(string: endpoint, relativeTo: baseURL)?.absoluteURL, url.host == baseURL.host else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = method; request.httpBody = body; request.timeoutInterval = 45
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue(guestToken ?? auth, forHTTPHeaderField: "X-Guest-Token")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(APIError.self, from: data))?.error ?? "Unable to connect. Please try again."
            throw NSError(domain: "Moments", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
        return data
    }
    func refresh() async {
        guard !slug.isEmpty else { return }
        let current = slug, key = auth
        do {
            let data = try await request("api/guest/\(current)", guestToken: key)
            let next = try JSONDecoder().decode(EventState.self, from: data)
            let images: [Photo]
            if next.joined { images = try JSONDecoder().decode([Photo].self, from: await request("api/guest/\(current)/photos", guestToken: key)) } else { images = [] }
            guard current == slug else { return }
            if state?.revealed == false && next.revealed && next.event.visibility != "host" && next.features?.revealExperience != false { message = "The wait is over. Your moments are ready." }
            state = next; photos = images
        } catch { self.error = error.localizedDescription }
    }
    func join(name: String) async {
        busy = true; defer { busy = false }
        do {
            let data = try await request("api/guest/\(slug)/join", method: "POST", body: JSONSerialization.data(withJSONObject: ["name": name]))
            let result = try JSONDecoder().decode(JoinResponse.self, from: data)
            if let key = result.guest_token { GuestKeychain.save(key, slug: slug) }
            await refresh()
        } catch { self.error = error.localizedDescription }
    }
    func upload(_ image: UIImage) async {
        guard let bytes = image.jpegData(compressionQuality: 0.88) else { error = "Could not read this photo."; return }
        guard bytes.count <= 15 * 1024 * 1024 else { error = "Choose a photo smaller than 15 MB."; return }
        busy = true; message = "Sharing your moment…"; defer { busy = false }
        let boundary = "Moments-\(UUID().uuidString)"
        var body = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"request_id\"\r\n\r\n\(UUID().uuidString)\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"capture.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8)
        body.append(bytes); body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        do {
            _ = try await request("api/guest/\(slug)/photos", method: "POST", body: body, contentType: "multipart/form-data; boundary=\(boundary)")
            message = "Your moment is shared. Thank you!"; await refresh()
        } catch { message = ""; self.error = error.localizedDescription }
    }
}

@main struct MomentsLiveApp: App {
    @StateObject private var model = MomentsModel()
    var body: some Scene {
        WindowGroup {
            MomentsView().environmentObject(model)
                .onOpenURL { model.open($0) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in if let url = activity.webpageURL { model.open(url) } }
                .task { if model.slug.isEmpty, let last = UserDefaults.standard.string(forKey: "lastEvent"), let url = URL(string: last) { model.open(url) } }
        }
    }
}

struct MomentsView: View {
    @EnvironmentObject var model: MomentsModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var eventLink = ""
    @State private var name = ""
    @State private var camera = false
    @State private var selection: PhotosPickerItem?
    private let green = Color(red: 0.09, green: 0.24, blue: 0.21)
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text("inmoment  /  LIVE").font(.headline).tracking(2)
                    if let state = model.state {
                        Text(state.event.title).font(.system(size: 38, design: .serif))
                        Text(state.event.description).foregroundStyle(.secondary)
                        if !state.joined && state.event.status == "published" && state.uploads_enabled != false {
                            Text("Your photos are shared with the host\(state.event.visibility == "all" ? " and event guests" : ""). Only upload photos you have permission to share.").font(.footnote)
                            TextField("Your display name", text: $name).textFieldStyle(.roundedBorder).textContentType(.givenName)
                            Button("Join this event") { Task { await model.join(name: name) } }.buttonStyle(.borderedProminent).disabled(model.busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                        if state.joined {
                            Text("\(state.remaining) photos left for you").font(.headline)
                            if state.event.status == "published" && state.remaining > 0 && state.uploads_enabled != false {
                                HStack {
                                    Button {
                                        if UIImagePickerController.isSourceTypeAvailable(.camera) { camera = true } else { model.error = "Camera is unavailable. Choose a photo instead." }
                                    } label: { Label("Take photo", systemImage: "camera") }
                                    PhotosPicker(selection: $selection, matching: .images) { Label("Choose photo", systemImage: "photo") }
                                }.buttonStyle(.bordered).disabled(model.busy)
                            }
                        }
                        if model.busy { ProgressView(model.message) } else if !model.message.isEmpty { Text(model.message).font(.footnote) }
                        if state.event.visibility == "host" { Text("This is a private collection for your event host.").font(.callout) }
                        if state.uploads_enabled == false && state.event.status == "published" { Text("Photo submissions are paused by the administrator.") }
                        if state.features?.revealExperience != false {
                            if let end = state.event.closes_at, state.event.status == "published", end > (state.server_time ?? 0) { CountdownLabel(title: "Camera closes in", deadline: end, serverTime: state.server_time) }
                            if !state.revealed && state.event.visibility != "host" { CountdownLabel(title: "Your moments reveal in", deadline: state.event.reveal, serverTime: state.server_time) }
                        } else if !state.revealed && state.event.visibility != "host" { Text("Your photos will appear at the host’s scheduled reveal time.") }
                        Text("Every perspective.").font(.title2)
                        if model.photos.isEmpty { Text("Photos appear here when shared, approved and revealed.").foregroundStyle(.secondary) }
                        LazyVStack(spacing: 20) { ForEach(model.photos) { photo in PhotoCard(photo: photo).environmentObject(model) } }
                        ShareLink(item: baseURL.appendingPathComponent("e/\(model.slug)")) { Label("Share event", systemImage: "square.and.arrow.up") }
                        Button("Open another event") { model.slug = ""; model.state = nil; model.photos = []; UserDefaults.standard.removeObject(forKey: "lastEvent") }
                    } else {
                        Text("Every perspective, together.").font(.system(size: 42, design: .serif))
                        Text("Open the event link shared by your host, or paste it here.")
                        TextField("Event URL", text: $eventLink).textFieldStyle(.roundedBorder).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        Button("Open event") { if let url = URL(string: eventLink.trimmingCharacters(in: .whitespacesAndNewlines)) { model.open(url) } }.buttonStyle(.borderedProminent)
                        Link("Event owner studio", destination: baseURL)
                    }
                }.padding(24)
            }.background(Color(red: 0.97, green: 0.96, blue: 0.94)).foregroundStyle(green).tint(green)
                .refreshable { await model.refresh() }
                .sheet(isPresented: $camera) { CameraPicker { image in camera = false; if let image { Task { await model.upload(image) } } }.ignoresSafeArea() }
                .onChange(of: selection) { item in Task { if let data = try? await item?.loadTransferable(type: Data.self), let image = UIImage(data: data) { await model.upload(image) }; selection = nil } }
                .alert("Moments Live", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) { Button("OK") { model.error = nil } } message: { Text(model.error ?? "") }
                .task(id: model.slug) {
                    while !Task.isCancelled && !model.slug.isEmpty {
                        do { try await Task.sleep(nanoseconds: 10_000_000_000) } catch { break }
                        if scenePhase == .active && !model.busy && !camera { await model.refresh() }
                    }
                }
        }
    }
}

struct PhotoCard: View {
    let photo: Photo
    @EnvironmentObject var model: MomentsModel
    @State private var image: UIImage?
    @State private var shareImage: UIImage?
    @State private var sharing = false
    var body: some View {
        VStack(alignment: .leading) {
            if let image { Image(uiImage: image).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 12)) } else { ProgressView().frame(height: 180) }
            HStack { Text(photo.guest_name).font(.caption); Spacer(); if model.state?.features?.downloads != false { Button("Save / share") {
                Task { do { let bytes = try await model.request(String(photo.url.dropFirst()) + "?download=1"); shareImage = UIImage(data: bytes); sharing = shareImage != nil } catch { model.error = error.localizedDescription } }
            } } }
        }.task(id: photo.id) { if let data = try? await model.request(String(photo.url.dropFirst()) + "?thumb=1") { image = UIImage(data: data) } }
            .sheet(isPresented: $sharing) { if let shareImage { ShareSheet(image: shareImage) } }
    }
}
struct CountdownLabel: View {
    let title: String
    let deadline: Double
    let serverTime: Double?
    var body: some View {
        let start = Date()
        let remaining = max(0, (deadline - (serverTime ?? start.timeIntervalSince1970 * 1000)) / 1000)
        VStack(alignment: .leading) {
            Text(title).font(.caption)
            Text(timerInterval: start...start.addingTimeInterval(remaining), countsDown: true).monospacedDigit().font(.title)
        }
    }
}
struct ShareSheet: UIViewControllerRepresentable {
    let image: UIImage
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [image], applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
struct CameraPicker: UIViewControllerRepresentable {
    let completion: (UIImage?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }
    func makeUIViewController(context: Context) -> UIImagePickerController { let picker = UIImagePickerController(); picker.sourceType = .camera; picker.delegate = context.coordinator; return picker }
    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let completion: (UIImage?) -> Void
        init(completion: @escaping (UIImage?) -> Void) { self.completion = completion }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { completion(nil) }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) { completion(info[.originalImage] as? UIImage) }
    }
}
