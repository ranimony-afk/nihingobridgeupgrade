import 'dart:convert';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:workmanager/workmanager.dart';

import 'api_client.dart';
import 'sqlite_service.dart';

const kSyncTask = 'nb-background-sync';

final notificationsProvider = Provider<FlutterLocalNotificationsPlugin>((ref) {
  return FlutterLocalNotificationsPlugin();
});

final syncServiceProvider = Provider<SyncService>((ref) {
  return SyncService(
    ref.watch(apiClientProvider),
    ref.watch(sqliteProvider),
    ref.watch(notificationsProvider),
  );
});

@pragma('vm:entry-point')
void backgroundDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    // Real network work runs through SyncService in the foreground isolate.
    // Here we only mark that the OS woke us so the UI can reconcile.
    return Future.value(true);
  });
}

class SyncService {
  SyncService(this._api, this._db, this._notifications);

  final ApiClient _api;
  final SqliteService _db;
  final FlutterLocalNotificationsPlugin _notifications;

  Future<void> initNotifications() async {
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
      macOS: DarwinInitializationSettings(),
    );
    await _notifications.initialize(settings);
  }

  Future<void> registerBackgroundSync() async {
    await Workmanager().initialize(backgroundDispatcher, isInDebugMode: false);
    await Workmanager().registerPeriodicTask(
      kSyncTask,
      kSyncTask,
      frequency: const Duration(hours: 6),
    );
  }

  Future<void> streakReminder(int streak) async {
    await _notifications.show(
      1,
      'Keep your streak',
      'Day $streak — one lesson keeps the flame alive.',
      const NotificationDetails(
        android: AndroidNotificationDetails('streaks', 'Streaks', importance: Importance.defaultImportance),
        iOS: DarwinNotificationDetails(),
      ),
    );
  }

  /// Downloads the dictionary + grammar packs for offline study.
  Future<void> downloadPacks() async {
    final dict = await _api.getJson('/api/v1/dict/offline');
    final pack = dict['data'] as Map<String, dynamic>?;
    if (pack != null) await _db.saveDictionaryPack(pack);

    final grammar = await _api.getJson('/api/v1/grammar');
    final points = (grammar['data'] as Map<String, dynamic>?)?['points'] as List<dynamic>?;
    if (points != null) await _db.saveGrammar(points);
  }

  /// Flushes queued progress captured while offline.
  Future<int> flushOutbox() async {
    final rows = await _db.pending();
    var sent = 0;
    for (final row in rows) {
      try {
        await _api.postJson(
          row['path']! as String,
          jsonDecode(row['payload']! as String) as Map<String, dynamic>,
        );
        await _db.clearQueued(row['id']! as int);
        sent += 1;
      } catch (_) {
        break;
      }
    }
    return sent;
  }
}
