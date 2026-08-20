# Phase 11 — Flutter client

Completes `apps/mobile` into a runnable multi-platform app. No web or API changes.

## Added in this phase

- **Platform runners** — `android/` (manifest, Gradle, Kotlin activity), `ios/` (Info.plist, AppDelegate),
  `macos/` entitlements, `linux/` and `windows/` CMake
- **Repository layer** (`lib/core/repository.dart`) — network-first with SQLite fallback, testable
- **Real SSE streaming** for the tutor (was a buffered regex read)
- **Downloads manager** screen with pack sizes and queued-sync count
- **Dart tests** — SSE parser, localization, settings, login widget
- **CI** — `.github/workflows/flutter.yml` runs analyze, test, and a debug APK build
- **Lints** — `analysis_options.yaml` on `flutter_lints`

## Platform support

| Target | Notes |
| --- | --- |
| Android | minSdk 23, notification + boot permissions, desugaring for local notifications |
| iOS | Background `fetch` + `remote-notification`, mic/speech usage strings |
| Tablet | `NavigationRail` at ≥720px |
| Desktop | `sqflite_common_ffi` initialised for Windows/Linux/macOS |

## API surface consumed

`/api/v1/auth/login` · `/api/v1/auth/refresh` · `/api/v1/auth/me` ·
`/api/v1/kg/search` · `/api/v1/kg/stats` · `/api/v1/kanji/graph` · `/api/v1/grammar` ·
`/api/v1/dict/offline` · `/api/v1/dict/bookmarks` ·
`/api/v1/tutor/session` · `/api/v1/tutor/stream` (SSE) · `/api/v1/tutor/shadow` · `/api/v1/analytics`

## Note

The sandbox has no Flutter SDK, so `flutter analyze` / `flutter test` run in CI rather than here.
The Next.js typecheck and production build were verified locally and pass.
