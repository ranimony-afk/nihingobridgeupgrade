import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/sqlite_service.dart';
import '../core/sync.dart';

/// Download manager: offline packs, queued progress, and manual sync.
class DownloadsPage extends ConsumerStatefulWidget {
  const DownloadsPage({super.key});

  @override
  ConsumerState<DownloadsPage> createState() => _DownloadsPageState();
}

class _DownloadsPageState extends ConsumerState<DownloadsPage> {
  bool _busy = false;
  String? _status;

  Future<void> _download() async {
    setState(() {
      _busy = true;
      _status = 'Downloading packs…';
    });
    try {
      await ref.read(syncServiceProvider).downloadPacks();
      setState(() => _status = 'Offline packs ready');
    } catch (error) {
      setState(() => _status = 'Failed: $error');
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _sync() async {
    setState(() => _busy = true);
    final sent = await ref.read(syncServiceProvider).flushOutbox();
    setState(() {
      _busy = false;
      _status = 'Synced $sent queued items';
    });
  }

  @override
  Widget build(BuildContext context) {
    final db = ref.read(sqliteProvider);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Offline downloads', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
        const SizedBox(height: 8),
        const Text('Dictionary, kanji, and grammar packs are stored in SQLite for offline study.'),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _busy ? null : _download,
          icon: const Icon(Icons.download),
          label: const Text('Download offline packs'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _busy ? null : _sync,
          icon: const Icon(Icons.sync),
          label: const Text('Sync queued progress'),
        ),
        if (_status != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_status!)),
        const Divider(height: 32),
        FutureBuilder<List<Map<String, Object?>>>(
          future: db.downloads(),
          builder: (context, snapshot) {
            final rows = snapshot.data ?? const [];
            if (rows.isEmpty) return const Text('No packs downloaded yet.');
            return Column(
              children: [
                for (final row in rows)
                  ListTile(
                    leading: const Icon(Icons.folder_zip),
                    title: Text('${row['label']}'),
                    subtitle: Text('${row['bytes']} bytes'),
                  ),
              ],
            );
          },
        ),
        FutureBuilder<List<Map<String, Object?>>>(
          future: db.pending(),
          builder: (context, snapshot) => ListTile(
            leading: const Icon(Icons.cloud_upload),
            title: const Text('Queued for sync'),
            trailing: Text('${snapshot.data?.length ?? 0}'),
          ),
        ),
      ],
    );
  }
}
