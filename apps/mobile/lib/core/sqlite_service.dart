import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

final sqliteProvider = Provider<SqliteService>((ref) => SqliteService());

/// Offline cache for dictionary, kanji, grammar, and queued progress.
class SqliteService {
  Database? _db;

  Future<Database> open() async {
    if (_db != null) return _db!;
    if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    }
    final dir = await getApplicationDocumentsDirectory();
    _db = await openDatabase(
      p.join(dir.path, 'nihongo_bridge.db'),
      version: 1,
      onCreate: (db, _) async {
        await db.execute('''
          CREATE TABLE lexemes (
            id TEXT PRIMARY KEY,
            lemma TEXT NOT NULL,
            reading TEXT NOT NULL,
            pos TEXT,
            jlpt TEXT
          )''');
        await db.execute('''
          CREATE TABLE kanji (
            character TEXT PRIMARY KEY,
            strokes INTEGER,
            jlpt TEXT,
            freq INTEGER,
            rare INTEGER
          )''');
        await db.execute('''
          CREATE TABLE grammar (
            slug TEXT PRIMARY KEY,
            title TEXT,
            structure TEXT,
            level TEXT,
            explanation TEXT
          )''');
        await db.execute('''
          CREATE TABLE outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )''');
        await db.execute('''
          CREATE TABLE downloads (
            id TEXT PRIMARY KEY,
            label TEXT,
            bytes INTEGER,
            saved_at INTEGER
          )''');
      },
    );
    return _db!;
  }

  Future<void> saveDictionaryPack(Map<String, dynamic> pack) async {
    final db = await open();
    final batch = db.batch();
    for (final row in (pack['lexemes'] as List<dynamic>? ?? <dynamic>[])) {
      final item = row as Map<String, dynamic>;
      batch.insert('lexemes', {
        'id': item['id'],
        'lemma': item['lemma'],
        'reading': item['reading'],
        'pos': item['pos'],
        'jlpt': item['jlpt'],
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    for (final row in (pack['kanji'] as List<dynamic>? ?? <dynamic>[])) {
      final item = row as Map<String, dynamic>;
      batch.insert('kanji', {
        'character': item['character'],
        'strokes': item['strokes'],
        'jlpt': item['jlpt'],
        'freq': item['freq'],
        'rare': (item['rare'] == true) ? 1 : 0,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
    await db.insert('downloads', {
      'id': 'dictionary-pack',
      'label': 'Dictionary offline pack',
      'bytes': jsonEncode(pack).length,
      'saved_at': DateTime.now().millisecondsSinceEpoch,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<void> saveGrammar(List<dynamic> points) async {
    final db = await open();
    final batch = db.batch();
    for (final row in points) {
      final item = row as Map<String, dynamic>;
      batch.insert('grammar', {
        'slug': item['slug'],
        'title': item['title'],
        'structure': item['structure'],
        'level': item['level'],
        'explanation': item['explanation'],
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    }
    await batch.commit(noResult: true);
  }

  Future<List<Map<String, Object?>>> searchLexemes(String query) async {
    final db = await open();
    return db.query(
      'lexemes',
      where: 'lemma LIKE ? OR reading LIKE ?',
      whereArgs: ['%$query%', '%$query%'],
      limit: 40,
    );
  }

  Future<List<Map<String, Object?>>> allKanji() async => (await open()).query('kanji', limit: 200);

  Future<List<Map<String, Object?>>> allGrammar() async => (await open()).query('grammar', limit: 200);

  Future<void> queue(String path, Map<String, dynamic> payload) async {
    final db = await open();
    await db.insert('outbox', {
      'path': path,
      'payload': jsonEncode(payload),
      'created_at': DateTime.now().millisecondsSinceEpoch,
    });
  }

  Future<List<Map<String, Object?>>> pending() async => (await open()).query('outbox', limit: 100);

  Future<void> clearQueued(int id) async {
    final db = await open();
    await db.delete('outbox', where: 'id = ?', whereArgs: [id]);
  }

  Future<List<Map<String, Object?>>> downloads() async => (await open()).query('downloads');
}
