import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'sqlite_service.dart';

/// Parses one Server-Sent Events frame into (event, data).
/// Exposed for unit tests — no Flutter binding required.
({String event, Map<String, dynamic> data})? parseSseFrame(String frame) {
  String? event;
  final dataLines = <String>[];
  for (final line in frame.split('\n')) {
    if (line.startsWith('event:')) event = line.substring(6).trim();
    if (line.startsWith('data:')) dataLines.add(line.substring(5).trim());
  }
  if (dataLines.isEmpty) return null;
  try {
    final decoded = jsonDecode(dataLines.join('\n'));
    if (decoded is! Map<String, dynamic>) return null;
    return (event: event ?? 'message', data: decoded);
  } catch (_) {
    return null;
  }
}

class Lexeme {
  const Lexeme({required this.id, required this.lemma, required this.reading, this.pos, this.jlpt});

  factory Lexeme.fromJson(Map<String, dynamic> json) => Lexeme(
        id: '${json['id']}',
        lemma: '${json['lemma']}',
        reading: '${json['reading']}',
        pos: json['pos'] as String?,
        jlpt: json['jlpt'] as String?,
      );

  final String id;
  final String lemma;
  final String reading;
  final String? pos;
  final String? jlpt;
}

class SearchResult {
  const SearchResult({required this.lexemes, required this.offline});

  final List<Lexeme> lexemes;
  final bool offline;
}

final repositoryProvider = Provider<BridgeRepository>((ref) {
  return BridgeRepository(ref.watch(apiClientProvider), ref.watch(sqliteProvider));
});

/// Single data gateway: network first, SQLite when offline.
class BridgeRepository {
  BridgeRepository(this._api, this._db);

  final ApiClient _api;
  final SqliteService _db;

  Future<SearchResult> searchDictionary(String query) async {
    try {
      final response = await _api.getJson('/api/v1/kg/search', query: {'q': query});
      final data = response['data'] as Map<String, dynamic>?;
      final rows = ((data?['lexemes'] as List<dynamic>?) ?? const [])
          .map((row) => Lexeme.fromJson(row as Map<String, dynamic>))
          .toList();
      return SearchResult(lexemes: rows, offline: false);
    } on DioException {
      final rows = await _db.searchLexemes(query);
      return SearchResult(
        lexemes: rows
            .map((row) => Lexeme(
                  id: '${row['id']}',
                  lemma: '${row['lemma']}',
                  reading: '${row['reading']}',
                  pos: row['pos'] as String?,
                  jlpt: row['jlpt'] as String?,
                ))
            .toList(),
        offline: true,
      );
    }
  }

  Future<List<Map<String, dynamic>>> kanjiBranches() async {
    try {
      final response = await _api.getJson('/api/v1/kanji/graph');
      final tree = response['data'] as Map<String, dynamic>?;
      return ((tree?['children'] as List<dynamic>?) ?? const []).cast<Map<String, dynamic>>();
    } on DioException {
      final rows = await _db.allKanji();
      return [
        {
          'name': 'Offline cache',
          'children': rows.map((row) => {'name': row['character']}).toList(),
        }
      ];
    }
  }

  Future<List<Map<String, dynamic>>> grammarPoints() async {
    try {
      final response = await _api.getJson('/api/v1/grammar');
      final data = response['data'] as Map<String, dynamic>?;
      return ((data?['points'] as List<dynamic>?) ?? const []).cast<Map<String, dynamic>>();
    } on DioException {
      final rows = await _db.allGrammar();
      return rows.map((row) => row.map((k, v) => MapEntry(k, v as dynamic))).toList();
    }
  }

  /// Builds a quiz deck from the offline pack so it also works with no network.
  Future<List<Map<String, dynamic>>> quizDeck() async {
    try {
      final response = await _api.getJson('/api/v1/dict/offline');
      final pack = response['data'] as Map<String, dynamic>?;
      final rows = ((pack?['lexemes'] as List<dynamic>?) ?? const []).cast<Map<String, dynamic>>();
      if (rows.isNotEmpty) {
        final deck = rows.take(10).map((row) => {'q': '${row['lemma']}', 'a': '${row['reading']}'}).toList();
        return deck;
      }
    } on DioException {
      // fall through to the local cache
    }
    final cached = await _db.searchLexemes('');
    return cached.take(10).map((row) => {'q': '${row['lemma']}', 'a': '${row['reading']}'}).toList();
  }

  Future<String?> startTutorSession({String scenario = 'cafe', String level = 'N5'}) async {
    final response = await _api.postJson('/api/v1/tutor/session', {
      'scenario': scenario,
      'level': level,
    });
    return (response['data'] as Map<String, dynamic>?)?['id'] as String?;
  }

  /// Streams tutor tokens over SSE. Falls back to a queued outbox entry offline.
  Stream<({String event, Map<String, dynamic> data})> streamTutor({
    required String sessionId,
    required String text,
  }) async* {
    late Response<ResponseBody> response;
    try {
      response = await _api.dio.post<ResponseBody>(
        '/api/v1/tutor/stream',
        data: {'sessionId': sessionId, 'text': text},
        options: Options(responseType: ResponseType.stream),
      );
    } on DioException {
      await _db.queue('/api/v1/tutor/stream', {'sessionId': sessionId, 'text': text});
      yield (event: 'offline', data: {'text': 'Saved offline. It will sync later.'});
      return;
    }

    var buffer = '';
    await for (final chunk in response.data!.stream) {
      buffer += utf8.decode(chunk, allowMalformed: true);
      final frames = buffer.split('\n\n');
      buffer = frames.removeLast();
      for (final frame in frames) {
        final parsed = parseSseFrame(frame);
        if (parsed != null) yield parsed;
      }
    }
  }

  Future<int> shadowScore(String target, String heard) async {
    final response = await _api.postJson('/api/v1/tutor/shadow', {'target': target, 'heard': heard});
    return ((response['data'] as Map<String, dynamic>?)?['score'] as num?)?.toInt() ?? 0;
  }
}
