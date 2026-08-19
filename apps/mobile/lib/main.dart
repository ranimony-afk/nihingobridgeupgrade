import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/settings.dart';
import 'core/sync.dart';
import 'features/auth.dart';
import 'features/downloads.dart';
import 'features/progress.dart';
import 'features/study.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: NihongoBridgeApp()));
}

class NihongoBridgeApp extends ConsumerStatefulWidget {
  const NihongoBridgeApp({super.key});

  @override
  ConsumerState<NihongoBridgeApp> createState() => _NihongoBridgeAppState();
}

class _NihongoBridgeAppState extends ConsumerState<NihongoBridgeApp> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() async {
      final sync = ref.read(syncServiceProvider);
      await sync.initNotifications();
      await sync.registerBackgroundSync();
      await ref.read(authProvider.notifier).restore();
    });
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);
    return MaterialApp(
      title: 'Nihongo Bridge',
      debugShowCheckedModeBanner: false,
      themeMode: settings.dark ? ThemeMode.dark : ThemeMode.light,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF58CC02), useMaterial3: true),
      darkTheme: ThemeData(
        colorSchemeSeed: const Color(0xFF58CC02),
        brightness: Brightness.dark,
        useMaterial3: true,
      ),
      locale: Locale(settings.locale),
      supportedLocales: supportedLocales,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const AppShell(),
    );
  }
}

/// Bottom tabs on phones, NavigationRail on tablet/desktop widths.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final locale = ref.watch(settingsProvider).locale;
    if (!auth.signedIn) return const Scaffold(body: SafeArea(child: LoginPage()));

    final destinations = <({String label, IconData icon, Widget page})>[
      (label: t(locale, 'dictionary'), icon: Icons.menu_book, page: const DictionaryPage()),
      (label: t(locale, 'kanji'), icon: Icons.hub, page: const KanjiPage()),
      (label: t(locale, 'grammar'), icon: Icons.rule, page: const GrammarPage()),
      (label: t(locale, 'quiz'), icon: Icons.quiz, page: const QuizPage()),
      (label: t(locale, 'tutor'), icon: Icons.forum, page: const ConversationPage()),
      (label: t(locale, 'progress'), icon: Icons.insights, page: const ProgressPage()),
      (label: 'Downloads', icon: Icons.download, page: const DownloadsPage()),
      (label: t(locale, 'settings'), icon: Icons.settings, page: const SettingsPage()),
    ];

    final wide = MediaQuery.sizeOf(context).width >= 720;
    final body = destinations[_index].page;

    return Scaffold(
      appBar: AppBar(title: Text(destinations[_index].label)),
      body: SafeArea(
        child: wide
            ? Row(
                children: [
                  NavigationRail(
                    selectedIndex: _index,
                    onDestinationSelected: (value) => setState(() => _index = value),
                    labelType: NavigationRailLabelType.all,
                    destinations: [
                      for (final item in destinations)
                        NavigationRailDestination(icon: Icon(item.icon), label: Text(item.label)),
                    ],
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(child: body),
                ],
              )
            : body,
      ),
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: _index.clamp(0, 4),
              onDestinationSelected: (value) => setState(() => _index = value),
              destinations: [
                for (final item in destinations.take(5))
                  NavigationDestination(icon: Icon(item.icon), label: item.label),
              ],
            ),
    );
  }
}
