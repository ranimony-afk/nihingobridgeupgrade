import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/repository.dart';
import '../core/sqlite_service.dart';

/// Dictionary search — online first, SQLite cache when offline.
class DictionaryPage extends ConsumerStatefulWidget {
  const DictionaryPage({super.key});

  @override
  ConsumerState<DictionaryPage> createState() => _DictionaryPageState();
}

class _DictionaryPageState extends ConsumerState<DictionaryPage> {
  final _controller = TextEditingController();
  SearchResult _results = const SearchResult(lexemes: [], offline: false);
  bool _loading = false;

  Future<void> _search() async {
    final query = _controller.text.trim();
    if (query.isEmpty) return;
    setState(() => _loading = true);
    final result = await ref.read(repositoryProvider).searchDictionary(query);
    if (!mounted) return;
    setState(() {
      _results = result;
      _loading = false;
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  onSubmitted: (_) => _search(),
                  decoration: const InputDecoration(
                    hintText: '水, たべる, eat',
                    prefixIcon: Icon(Icons.search),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(onPressed: _search, child: const Text('Search')),
            ],
          ),
        ),
        if (_results.offline)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [Icon(Icons.cloud_off, size: 16), SizedBox(width: 6), Text('Offline cache')],
            ),
          ),
        if (_loading) const LinearProgressIndicator(),
        Expanded(
          child: ListView.builder(
            itemCount: _results.lexemes.length,
            itemBuilder: (context, index) {
              final row = _results.lexemes[index];
              return ListTile(
                title: Text(row.lemma, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                subtitle: Text('${row.reading} · ${row.pos ?? ''} ${row.jlpt ?? ''}'),
                trailing: IconButton(
                  icon: const Icon(Icons.bookmark_add_outlined),
                  onPressed: () => ref.read(sqliteProvider).queue('/api/v1/dict/bookmarks', {
                    'targetType': 'lexeme',
                    'targetId': row.id,
                  }),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class KanjiPage extends ConsumerWidget {
  const KanjiPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: ref.read(repositoryProvider).kanjiBranches(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        final branches = snapshot.data!;
        return ListView(
          children: [
            for (final branch in branches)
              ExpansionTile(
                initiallyExpanded: true,
                title: Text('${branch['name']}'),
                children: [
                  Wrap(
                    children: [
                      for (final leaf in (branch['children'] as List<dynamic>? ?? const []))
                        Padding(
                          padding: const EdgeInsets.all(6),
                          child: Chip(
                            label: Text(
                              '${(leaf as Map<String, dynamic>)['name']}',
                              style: const TextStyle(fontSize: 20),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
          ],
        );
      },
    );
  }
}

class GrammarPage extends ConsumerWidget {
  const GrammarPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: ref.read(repositoryProvider).grammarPoints(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        final points = snapshot.data!;
        return ListView.builder(
          itemCount: points.length,
          itemBuilder: (context, index) {
            final row = points[index];
            return ListTile(
              title: Text('${row['title']} — ${row['structure']}'),
              subtitle: Text('${row['level']} · ${row['explanation']}'),
            );
          },
        );
      },
    );
  }
}

/// Quiz mirrors the web LMS. Answers queue offline and flush via SyncService.
class QuizPage extends ConsumerStatefulWidget {
  const QuizPage({super.key});

  @override
  ConsumerState<QuizPage> createState() => _QuizPageState();
}

class _QuizPageState extends ConsumerState<QuizPage> {
  List<Map<String, dynamic>> _deck = const [];
  int _index = 0;
  int _correct = 0;

  @override
  void initState() {
    super.initState();
    Future.microtask(() async {
      final deck = await ref.read(repositoryProvider).quizDeck();
      if (mounted) setState(() => _deck = deck);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_deck.isEmpty) return const Center(child: CircularProgressIndicator());
    if (_index >= _deck.length) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('Score $_correct / ${_deck.length}', style: const TextStyle(fontSize: 24)),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => setState(() {
                _index = 0;
                _correct = 0;
              }),
              child: const Text('Try again'),
            ),
          ],
        ),
      );
    }

    final question = _deck[_index];
    final options = <String>{
      '${question['a']}',
      ..._deck.map((row) => '${row['a']}'),
    }.take(4).toList()
      ..shuffle();

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text('${question['q']}', style: const TextStyle(fontSize: 56, fontWeight: FontWeight.w900)),
        const SizedBox(height: 24),
        for (final option in options)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 24),
            child: FilledButton(
              onPressed: () async {
                if (option == '${question['a']}') _correct += 1;
                await ref.read(sqliteProvider).queue('/api/v1/analytics', {
                  'name': 'mobile_quiz_answer',
                  'path': '/quiz',
                });
                if (mounted) setState(() => _index += 1);
              },
              child: Text(option),
            ),
          ),
      ],
    );
  }
}

/// Streaming AI tutor with roleplay and shadowing score.
class ConversationPage extends ConsumerStatefulWidget {
  const ConversationPage({super.key});

  @override
  ConsumerState<ConversationPage> createState() => _ConversationPageState();
}

class _ConversationPageState extends ConsumerState<ConversationPage> {
  final _input = TextEditingController();
  final List<({String role, String text})> _log = [];
  String? _sessionId;
  String _scenario = 'cafe';
  int? _lastScore;
  bool _busy = false;

  Future<void> _start() async {
    final id = await ref.read(repositoryProvider).startTutorSession(scenario: _scenario);
    if (mounted) {
      setState(() {
        _sessionId = id;
        _log.clear();
      });
    }
  }

  Future<void> _send() async {
    if (_sessionId == null || _input.text.trim().isEmpty || _busy) return;
    final text = _input.text.trim();
    setState(() {
      _log.add((role: 'you', text: text));
      _log.add((role: 'sensei', text: ''));
      _input.clear();
      _busy = true;
    });

    final stream = ref.read(repositoryProvider).streamTutor(sessionId: _sessionId!, text: text);
    await for (final frame in stream) {
      if (!mounted) return;
      if (frame.event == 'analysis') {
        setState(() => _lastScore = (frame.data['score'] as num?)?.toInt());
      }
      if (frame.event == 'token' || frame.event == 'offline') {
        setState(() {
          final current = _log.last.text;
          _log[_log.length - 1] = (role: 'sensei', text: current + '${frame.data['text'] ?? ''}');
        });
      }
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              DropdownButton<String>(
                value: _scenario,
                items: const [
                  DropdownMenuItem(value: 'cafe', child: Text('Cafe')),
                  DropdownMenuItem(value: 'station', child: Text('Station')),
                  DropdownMenuItem(value: 'class', child: Text('Classroom')),
                  DropdownMenuItem(value: 'interview', child: Text('Interview')),
                ],
                onChanged: (value) => setState(() => _scenario = value ?? 'cafe'),
              ),
              const SizedBox(width: 12),
              FilledButton(
                onPressed: _start,
                child: Text(_sessionId == null ? 'Start roleplay' : 'Restart'),
              ),
              const Spacer(),
              if (_lastScore != null) Text('Score $_lastScore'),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: [
              for (final line in _log)
                Align(
                  alignment: line.role == 'you' ? Alignment.centerRight : Alignment.centerLeft,
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(line.text.isEmpty ? '…' : line.text),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  onSubmitted: (_) => _send(),
                  decoration: const InputDecoration(hintText: '日本語で書いてください'),
                ),
              ),
              IconButton(onPressed: _busy ? null : _send, icon: const Icon(Icons.send)),
            ],
          ),
        ),
      ],
    );
  }
}
