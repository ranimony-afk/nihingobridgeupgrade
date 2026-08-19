import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppSettings {
  const AppSettings({this.dark = true, this.locale = 'en'});

  final bool dark;
  final String locale;

  AppSettings copyWith({bool? dark, String? locale}) =>
      AppSettings(dark: dark ?? this.dark, locale: locale ?? this.locale);
}

class SettingsController extends StateNotifier<AppSettings> {
  SettingsController() : super(const AppSettings()) {
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    state = AppSettings(
      dark: prefs.getBool('nb_dark') ?? true,
      locale: prefs.getString('nb_locale') ?? 'en',
    );
  }

  Future<void> setDark(bool value) async {
    state = state.copyWith(dark: value);
    (await SharedPreferences.getInstance()).setBool('nb_dark', value);
  }

  Future<void> setLocale(String value) async {
    state = state.copyWith(locale: value);
    (await SharedPreferences.getInstance()).setString('nb_locale', value);
  }
}

final settingsProvider = StateNotifierProvider<SettingsController, AppSettings>(
  (ref) => SettingsController(),
);

const supportedLocales = [Locale('en'), Locale('ja'), Locale('ta'), Locale('ml'), Locale('hi')];

const strings = <String, Map<String, String>>{
  'en': {
    'learn': 'Learn',
    'dictionary': 'Dictionary',
    'kanji': 'Kanji',
    'grammar': 'Grammar',
    'quiz': 'Quiz',
    'tutor': 'Tutor',
    'progress': 'Progress',
    'settings': 'Settings',
  },
  'ja': {
    'learn': '学習',
    'dictionary': '辞書',
    'kanji': '漢字',
    'grammar': '文法',
    'quiz': 'クイズ',
    'tutor': '会話',
    'progress': '進捗',
    'settings': '設定',
  },
  'ta': {
    'learn': 'கற்க',
    'dictionary': 'அகராதி',
    'kanji': 'கஞ்சி',
    'grammar': 'இலக்கணம்',
    'quiz': 'வினாடி',
    'tutor': 'உரையாடல்',
    'progress': 'முன்னேற்றம்',
    'settings': 'அமைப்பு',
  },
  'ml': {
    'learn': 'പഠിക്കുക',
    'dictionary': 'നിഘണ്ടു',
    'kanji': 'കാഞ്ജി',
    'grammar': 'വ്യാകരണം',
    'quiz': 'ക്വിസ്',
    'tutor': 'സംഭാഷണം',
    'progress': 'പുരോഗതി',
    'settings': 'ക്രമീകരണം',
  },
  'hi': {
    'learn': 'सीखें',
    'dictionary': 'शब्दकोश',
    'kanji': 'कانजी',
    'grammar': 'व्याकरण',
    'quiz': 'क्विज़',
    'tutor': 'संवाद',
    'progress': 'प्रगति',
    'settings': 'सेटिंग्स',
  },
};

String t(String locale, String key) => strings[locale]?[key] ?? strings['en']![key] ?? key;
