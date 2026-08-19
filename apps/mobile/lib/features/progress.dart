import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/settings.dart';
import '../core/sqlite_service.dart';
import '../core/sync.dart';
import 'auth.dart';

class ProgressPage extends ConsumerWidget {
  const ProgressPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder<Map<String, dynamic>>(
      future: ref.read(apiClientProvider).getJson('/api/v1/kg/stats'),
      builder: (context, snapshot) {
        final data = snapshot.data?['data'] as Map<String, dynamic>?;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text('Your graph coverage', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
            const SizedBox(height: 12),
            ListTile(title: const Text('Lexemes'), trailing: Text('${data?['lexemes'] ?? '—'}')),
            ListTile(title: const Text('Kanji'), trailing: Text('${data?['kanji'] ?? '—'}')),
            ListTile(title: const Text('Grammar'), trailing: Text('${data?['grammar'] ?? '—'}')),
          ],
        );
      },
    );
  }
}

class LeaderboardPage extends ConsumerWidget {
  const LeaderboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder<Map<String, dynamic>>(
      future: ref.read(apiClientProvider).getJson('/api/v1/tutor/session'),
      builder: (context, snapshot) {
        final stats = snapshot.data?['data'] as Map<String, dynamic>?;
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('Weekly league', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
              Text('Tutor sessions: ${stats?['total'] ?? 0}'),
              Text('Average score: ${stats?['avg'] ?? 0}'),
            ],
          ),
        );
      },
    );
  }
}

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    final auth = ref.watch(authProvider);
    final sync = ref.read(syncServiceProvider);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SwitchListTile(
          title: const Text('Dark mode'),
          value: settings.dark,
          onChanged: (value) => ref.read(settingsProvider.notifier).setDark(value),
        ),
        ListTile(
          title: const Text('Language'),
          trailing: DropdownButton<String>(
            value: settings.locale,
            items: const [
              DropdownMenuItem(value: 'en', child: Text('English')),
              DropdownMenuItem(value: 'ja', child: Text('日本語')),
              DropdownMenuItem(value: 'ta', child: Text('தமிழ்')),
              DropdownMenuItem(value: 'ml', child: Text('മലയാളം')),
              DropdownMenuItem(value: 'hi', child: Text('हिन्दी')),
            ],
            onChanged: (value) => ref.read(settingsProvider.notifier).setLocale(value ?? 'en'),
          ),
        ),
        ListTile(title: const Text('Plan'), trailing: Text(auth.plan)),
        FilledButton(onPressed: sync.downloadPacks, child: const Text('Download offline packs')),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: () async {
            final sent = await sync.flushOutbox();
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Synced $sent items')));
            }
          },
          child: const Text('Sync now'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: () => sync.streakReminder(3),
          child: const Text('Test push notification'),
        ),
        const SizedBox(height: 8),
        FutureBuilder(
          future: ref.read(sqliteProvider).downloads(),
          builder: (context, snapshot) => Text('Downloads: ${snapshot.data?.length ?? 0}'),
        ),
        const SizedBox(height: 16),
        TextButton(onPressed: ref.read(authProvider.notifier).logout, child: const Text('Sign out')),
      ],
    );
  }
}
