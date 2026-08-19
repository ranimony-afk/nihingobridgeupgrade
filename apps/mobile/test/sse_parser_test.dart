import 'package:flutter_test/flutter_test.dart';
import 'package:nihongo_bridge/core/repository.dart';

void main() {
  group('parseSseFrame', () {
    test('parses a token frame', () {
      final frame = parseSseFrame('event: token\ndata: {"text":"こん"}');
      expect(frame, isNotNull);
      expect(frame!.event, 'token');
      expect(frame.data['text'], 'こん');
    });

    test('parses an analysis frame with a score', () {
      final frame = parseSseFrame('event: analysis\ndata: {"score":72,"corrections":[]}');
      expect(frame!.event, 'analysis');
      expect(frame.data['score'], 72);
    });

    test('defaults the event name when absent', () {
      final frame = parseSseFrame('data: {"text":"hi"}');
      expect(frame!.event, 'message');
    });

    test('returns null for keepalive and malformed frames', () {
      expect(parseSseFrame(': keepalive'), isNull);
      expect(parseSseFrame('event: token\ndata: not-json'), isNull);
      expect(parseSseFrame(''), isNull);
    });
  });

  group('Lexeme', () {
    test('maps API json', () {
      final lexeme = Lexeme.fromJson({
        'id': 'lex-1',
        'lemma': '水',
        'reading': 'みず',
        'pos': 'noun',
        'jlpt': 'N5',
      });
      expect(lexeme.lemma, '水');
      expect(lexeme.reading, 'みず');
      expect(lexeme.jlpt, 'N5');
    });
  });
}
