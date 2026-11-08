# Moments Live — mobile builds and manual store publishing

## Identifiers and public URLs

| Item | Value |
| --- | --- |
| Website and API | `https://live.inmomentservices.com` |
| Event invocation | `https://live.inmomentservices.com/e/<published-event-slug>` |
| iOS app bundle | `com.inmomentservices.live` |
| iOS App Clip bundle | `com.inmomentservices.live.Clip` |
| Android application ID | `com.inmomentservices.live` |
| Apple association | `/.well-known/apple-app-site-association` |
| Android association | `/.well-known/assetlinks.json` |

These identifiers are proposed values, not registrations already made in your developer
accounts. If unavailable, change the native projects, entitlements and server settings
together before your first store submission.

Native apps implement event-link entry, joining without an account, photo capture,
photo-library selection, guest quotas, authorized gallery viewing and photo sharing.
The iOS full app and App Clip share native SwiftUI code. The Android app uses native
Android controls, the system camera and the system document picker. Neither app is a
WebView wrapper. Owner administration is linked to the browser studio.

The clients also honor administrator upload/download controls, show scheduled
closing/reveal countdowns, and explain host-only gallery privacy. Deploy the matching
server before rebuilding the clients. Turning off the web app leaves native APIs
available; turning off Guest participation blocks native joins/uploads too.
Android build and lint have been checked on Windows. iOS/App Clip source changes
must still be compiled, signed and tested with Xcode on a Mac before submission.

## Apple application and App Clip

Use a Mac with current Xcode. Register both bundle identifiers in Apple Developer,
enable Associated Domains for both, and associate the App Clip with its parent app.
Use your real 10-character team ID in `LIVE_APPLE_TEAM_ID` on the server.
Set `LIVE_APPLE_APP_STORE_ID` to the numeric App Store Connect app ID to enable
the Safari App Clip banner on event pages.

```bash
brew install xcodegen
export MOMENTS_APPLE_TEAM_ID=YOURTEAMID
cd mobile/ios
xcodegen generate
open MomentsLive.xcodeproj
```

`project.yml` generates the two targets, Info plists, privacy manifests, associated
domain entitlements and the parent's embedded App Clip. App icons are included;
regenerate from the package root with `npm run build:live:icons` if needed.

1. Select your Apple team for **both** targets in Signing & Capabilities. Let Xcode
   manage profiles. Confirm the parent embeds `MomentsClip.app` in its App Clips phase.
2. Build the **MomentsLive** and **MomentsClip** schemes. Simulator validation:

   ```bash
   xcodebuild -project MomentsLive.xcodeproj -scheme MomentsLive \
     -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
     CODE_SIGNING_ALLOWED=NO build
   ```

3. On a physical iPhone, test camera capture, permission denial, library import, sharing,
   reveal/privacy/moderation settings and reconnect behavior against your deployed server.
4. Test App Clip invocation with Xcode's `_XCAppClipURL` environment variable set to
   a published event URL, and configure an on-device Local Experience for QR testing.
5. In App Store Connect, create the parent app, upload an archive built for **Any iOS
   Device**, and configure its App Clip experience: title, subtitle, action, header
   image, and the associated `https://live.inmomentservices.com/e/` URL prefix.
6. Confirm the AASA URL returns **200 JSON** without a redirect or authentication.
   Register advanced App Clip experiences as required for your QR/NFC invocation URLs.
7. Use TestFlight to test the uploaded parent and App Clip, then submit for review.

App Clips require Apple's provisioning, domain verification and App Store Connect
experience configuration. Hosting an AASA file alone does not publish an App Clip.
The web guest experience remains available before the native experience is released.
Apple validation may take time because association files are cached by Apple's CDN.

Apple documentation: [website association](https://developer.apple.com/documentation/appclip/associating-your-app-clip-with-your-website),
[invocations](https://developer.apple.com/documentation/appclip/responding-to-invocations).

## Android build and Google Play

Install JDK 17 and Android SDK 36. The checked-in Gradle wrapper verifies the Gradle
distribution checksum. Open `mobile/android` in Android Studio or run:

```bash
cd mobile/android
./gradlew assembleDebug bundleRelease lint
```

Windows: use `gradlew.bat`. The debug APK is installable for testing. Without signing
environment variables, the release AAB is **unsigned** and cannot be uploaded as a
finished release. Build a signed release using your upload key:

```bash
export MOMENTS_KEYSTORE=/absolute/path/to/your-upload-key.jks
export MOMENTS_KEY_ALIAS=your-alias
# Set MOMENTS_STORE_PASSWORD and MOMENTS_KEY_PASSWORD through your secure shell/CI
# secret mechanism. Do not commit them or put literal passwords in command history.
./gradlew bundleRelease
```

Outputs:

- Debug APK: `app/build/outputs/apk/debug/app-debug.apk`
- Release AAB: `app/build/outputs/bundle/release/app-release.aab`

In Google Play Console, create **Moments Live**, enable Play App Signing, upload the
signed bundle to Internal testing, and copy the **App signing key certificate SHA-256**
into `LIVE_ANDROID_SHA256`. This is usually different from the upload-key fingerprint.
Restart the Live service. The association endpoint should now return the matching
package and certificate. Verify links on a physical device:

```bash
adb shell pm verify-app-links --re-verify com.inmomentservices.live
adb shell pm get-app-links com.inmomentservices.live
adb shell am start -a android.intent.action.VIEW \
  -d 'https://live.inmomentservices.com/e/YOUR_EVENT_SLUG'
```

For debug App Link verification, temporarily add your debug certificate fingerprint
alongside the production fingerprint on a test server; remove it before production.
No Android Instant App is required: guests without the full app use the mobile website.

Android documentation: [verification](https://developer.android.com/training/app-links/verify-applinks).

## Store metadata to prepare

- Name: **Moments Live**
- Short description: **Capture and share every perspective at your event.**
- Description: **Join an event with your host's link. Capture photos, share them with
  the event gallery, and revisit the moments together. Your host controls when photos
  appear and whether guests see everyone's photos or only their own.**
- Category: Photo & Video / Photography.
- Icon: `mobile/store-assets/google-play-icon.png`; iOS icon in its asset catalog.
- Screenshots: capture real native screens on supported devices after deploying a
  sample event; do not submit browser screenshots as native app screenshots.
- App Clip header: prepare Apple's required artwork in App Store Connect.
- Support and privacy URLs: publish your actual support contact, privacy policy, data
  deletion procedure, terms and moderation/reporting policies before store submission.
- Provide reviewers a published demo-event URL with capacity and no private user photos.
- Complete Apple's privacy disclosures and Google's Data Safety using actual behavior:
  display name, uploaded photos and a per-event pseudonymous guest identifier; owner
  email is collected on the web. No ad SDK or tracking SDK is included.
- Review user-generated-content requirements before public release. The implemented
  owner moderation/deletion tools do not replace a staffed abuse-reporting process.

## Verification status and boundaries

The supplied workflow template `docs/ci/moments-live.workflow.yml` builds server tests,
an Android debug APK/unsigned AAB, and both iOS simulator targets. Install it at
`.github/workflows/moments-live.yml` in the **monorepo** using a credential with GitHub's
`workflow` permission. The current connected credential cannot install workflows.
It does **not** deploy the domain or upload anything to a store.
Android builds and server/browser tests have been run locally. iOS/App Clip compilation
has not been run on this Windows workstation and must be verified on a Mac or with
the supplied workflow before release. Signing, device camera behavior, App Clip invocation, store review, policy/support
pages and live DNS remain manual release steps. No store approval is implied by a build.

For the first release, test multiple phones, app reinstall/storage clearing, event closure,
own-photos privacy, delayed reveal, host removal, lost connectivity, camera permission
denial and large phone images. Guest credentials are device-specific: changing devices
does not automatically restore that guest's private gallery.
