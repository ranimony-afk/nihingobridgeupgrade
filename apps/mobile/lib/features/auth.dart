import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';

class AuthState {
  const AuthState({this.email, this.plan = 'free', this.signedIn = false, this.error});

  final String? email;
  final String plan;
  final bool signedIn;
  final String? error;
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._api) : super(const AuthState());

  final ApiClient _api;

  Future<void> restore() async {
    if (await _api.refresh()) {
      final me = await _api.getJson('/api/v1/auth/me');
      final data = me['data'] as Map<String, dynamic>?;
      state = AuthState(
        email: data?['email'] as String?,
        plan: (data?['plan'] as String?) ?? 'free',
        signedIn: data != null,
      );
    }
  }

  Future<void> login(String email, String password, {String? otp, String? challengeId}) async {
    try {
      final response = await _api.postJson('/api/v1/auth/login', {
        'email': email,
        'password': password,
        if (otp != null) 'otp': otp,
        if (challengeId != null) 'challengeId': challengeId,
      });
      final data = response['data'] as Map<String, dynamic>?;
      if (data == null) {
        state = const AuthState(error: 'Login failed');
        return;
      }
      if (data['requires2fa'] == true) {
        state = AuthState(email: email, error: '2fa:${data['challengeId']}');
        return;
      }
      await _api.saveTokens(data['accessToken'] as String, data['refreshToken'] as String);
      final user = data['user'] as Map<String, dynamic>?;
      state = AuthState(email: user?['email'] as String?, plan: (user?['plan'] as String?) ?? 'free', signedIn: true);
    } catch (error) {
      state = AuthState(error: error.toString());
    }
  }

  Future<void> logout() async {
    await _api.clear();
    state = const AuthState();
  }
}

final authProvider = StateNotifierProvider<AuthController, AuthState>(
  (ref) => AuthController(ref.watch(apiClientProvider)),
);

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _email = TextEditingController(text: 'student@nihongobridge.local');
  final _password = TextEditingController(text: 'bridge-audit');
  final _otp = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final challenge = auth.error?.startsWith('2fa:') == true ? auth.error!.substring(4) : null;

    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('NihongoBridge', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
          const SizedBox(height: 16),
          TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email')),
          TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
          if (challenge != null)
            TextField(controller: _otp, decoration: const InputDecoration(labelText: '2FA code')),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => ref.read(authProvider.notifier).login(
                  _email.text,
                  _password.text,
                  otp: _otp.text.isEmpty ? null : _otp.text,
                  challengeId: challenge,
                ),
            child: Text(challenge == null ? 'Sign in' : 'Verify 2FA'),
          ),
          if (auth.error != null && challenge == null)
            Padding(padding: const EdgeInsets.only(top: 12), child: Text(auth.error!)),
        ],
      ),
    );
  }
}
