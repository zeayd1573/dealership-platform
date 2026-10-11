# Xtream Player for iPhone, iPad and Mac (native SwiftUI)

One codebase, two apps. Enter your playlist name, host, username and password and watch.
Unlike the web version it needs **no proxy server** - it talks to your provider directly and plays with Apple's native
player (AVPlayer), so it works on the go on cellular/Wi-Fi.

Features: multiple playlists (password in Keychain), Home with **Continue Watching** (resumes mid-episode, jumps to the next
episode) and **My List**, Live TV with program guide and channel up/down, Movies, Series with seasons and auto-play next,
search and categories. Long-press (iPhone) / right-click (Mac) a title to add it to My List.

## Build it (on your Mac, ~5 minutes)
Requirements: Xcode 15+ (free from the App Store), Homebrew.

```
brew install xcodegen
cd XtreamPlayerApple
xcodegen generate        # creates XtreamPlayer.xcodeproj
open XtreamPlayer.xcodeproj
```
In Xcode:
1. Click the **XtreamPlayer** project -> target -> **Signing & Capabilities** -> tick *Automatically manage signing* and pick your
   Apple ID as Team (a free Apple ID works). Change the Bundle Identifier to something unique, e.g. `com.yourname.xtreamplayer`.
2. **Mac:** choose destination *My Mac* and press Run (&#9654;).
3. **iPhone:** plug it in (or use Wi-Fi pairing), enable *Settings -> Privacy & Security -> Developer Mode*, pick your iPhone as the
   destination and press Run. First launch: *Settings -> General -> VPN & Device Management -> trust your Apple ID*.

Notes
- A free Apple ID installs expire after 7 days (just press Run again). A paid Apple Developer account ($99/yr) gives 1-year installs
  and TestFlight/App Store distribution.
- Plain-http panels are allowed via an App Transport Security exception (`project.yml`).
- Apple's player handles HLS (.m3u8), MP4/MOV and most live streams. MKV, some HEVC/AC3 titles won't play natively - that's an
  OS limitation (a VLC-based engine could be added later).
- Status: written without access to Xcode, so the first build may need small fixes. Send me any compiler errors and I'll fix them.
