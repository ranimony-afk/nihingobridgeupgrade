import 'package:flutter_test/flutter_test.dart';
import 'package:nihongo_bridge/core/settings.dart';

void main() {
  group('localization', () {
    test('returns translated labels for supported locales', () {
      expect(t('en', 'dictionary'), 'Dictionary');
      expect(t('ja', 'dictionary'), '辞書');
      expect(t('ta', 'kanji'), 'கஞ்சி');
      expect(t('ml', 'grammar'), 'വ്യാകരണം');
      expect(t('hi', 'quiz'), 'क्विज़');
    });

    test('falls back to English for unknown locale or key', () {
      expect(t('fr', 'dictionary'), 'Dictionary');
      expect(t('en', 'unknown-key'), 'unknown-key');
    });

    test('ships five supported locales', () {
      expect(supportedLocales.length, 5);
      expect(supportedLocales.map((l) => l.languageCode), containsAll(['en', 'ja', 'ta', 'ml', 'hi']));
    });
  });

  group('AppSettings', () {
    test('copyWith preserves untouched fields', () {
      const base = AppSettings(dark: true, locale: 'ja');
      final next = base.copyWith(dark: false);
      expect(next.dark, false);
      expect(next.locale, 'ja');
    });
  });
}
