# NihongoBridge — Flutter client

One codebase for **Android, iOS, tablet, and desktop** (macOS, Linux, Windows). It consumes the same
`/api/v1` surface as the web app, so no backend changes were needed.

## Run

```bash
cd apps/mobile
flutter pub get

# Android emulator reaches the host at 10.0.2.2
flutter run --dart-define=NB_API_BASE=http://10.0.2.2:3000

# iOS simulator / desktop
flutter run --dart-define=NB_API_BASE=http://localhost:3000
```

## Verify

```bash
flutter analyze
flutter test
```

CI runs both plus a debug APK build in `.github/workflows/flutter.yml`.

## Architecture

```
lib/
  core/
    api_client.dart      Dio + bearer token + 401 refresh retry
    repository.dart      Single gateway: network first, SQLite fallback, SSE parser
    sqlite_service.dart  Offline tables + outbox queue
    sync.dart            Background sync, notifications, pack downloads
    settings.dart        Theme + locale (persisted)
  features/
    auth.dart            Email login, 2FA challenge, token restore
    study.dart           Dictionary, Kanji, Grammar, Quiz, Conversation
    downloads.dart       Pack manager + queued sync
    progress.dart        Progress, leaderboard, settings
  main.dart              Responsive shell
```

## Feature map

| Requirement | Implementation |
| --- | --- |
| Android / iOS | `android/`, `ios/` runners with notification + background permissions |
| Tablet / desktop | `NavigationRail` at ≥720px, `sqflite_common_ffi` for desktop SQLite |
| Offline SQLite | `lexemes`, `kanji`, `grammar`, `downloads`, `outbox` tables |
| Riverpod | `ProviderScope`, `StateNotifier` for auth and settings |
| Dio | Interceptor injects bearer, refreshes on 401, retries once |
| Push notifications | `flutter_local_notifications` streak reminders |
| Downloads | Dictionary + grammar packs cached to SQLite, managed in Downloads tab |
| Authentication | `/api/v1/auth/login` incl. 2FA, refresh in secure storage |
| Dictionary | `/api/v1/kg/search` with offline fallback and bookmark queue |
| Grammar | `/api/v1/grammar` list with cached fallback |
| Kanji | `/api/v1/kanji/graph` branches |
| Quiz | Deck from the offline pack; answers queue then sync |
| Conversation | **True SSE streaming** from `/api/v1/tutor/stream` with live score |

## Offline behaviour

Every write goes to the `outbox` table when the network fails. `SyncService.flushOutbox()` replays
them on next launch, on manual **Sync now**, or on the 6-hour workmanager job.
