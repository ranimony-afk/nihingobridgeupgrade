import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const kDefaultBaseUrl = String.fromEnvironment(
  'NB_API_BASE',
  defaultValue: 'http://10.0.2.2:3000',
);

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (ref) => const FlutterSecureStorage(),
);

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref.watch(secureStorageProvider));
});

/// Dio client for the NihongoBridge REST surface.
/// Access tokens live in memory, refresh tokens in secure storage.
class ApiClient {
  ApiClient(this._storage) {
    dio = Dio(
      BaseOptions(
        baseUrl: kDefaultBaseUrl,
        connectTimeout: const Duration(seconds: 8),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'accept': 'application/json'},
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (_accessToken != null) {
            options.headers['authorization'] = 'Bearer $_accessToken';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401 && !_refreshing) {
            final refreshed = await refresh();
            if (refreshed) {
              final retry = await dio.fetch(error.requestOptions);
              return handler.resolve(retry);
            }
          }
          handler.next(error);
        },
      ),
    );
  }

  late final Dio dio;
  final FlutterSecureStorage _storage;
  String? _accessToken;
  bool _refreshing = false;

  Future<void> saveTokens(String access, String refreshToken) async {
    _accessToken = access;
    await _storage.write(key: 'nb_refresh', value: refreshToken);
  }

  Future<void> clear() async {
    _accessToken = null;
    await _storage.delete(key: 'nb_refresh');
  }

  Future<bool> refresh() async {
    final token = await _storage.read(key: 'nb_refresh');
    if (token == null) return false;
    _refreshing = true;
    try {
      final response = await dio.post<Map<String, dynamic>>(
        '/api/v1/auth/refresh',
        options: Options(headers: {'x-refresh-token': token}),
      );
      final data = response.data?['data'] as Map<String, dynamic>?;
      if (data == null) return false;
      await saveTokens(data['accessToken'] as String, data['refreshToken'] as String);
      return true;
    } on DioException {
      return false;
    } finally {
      _refreshing = false;
    }
  }

  Future<Map<String, dynamic>> getJson(String path, {Map<String, dynamic>? query}) async {
    final response = await dio.get<Map<String, dynamic>>(path, queryParameters: query);
    return response.data ?? <String, dynamic>{};
  }

  Future<Map<String, dynamic>> postJson(String path, Map<String, dynamic> body) async {
    final response = await dio.post<Map<String, dynamic>>(path, data: body);
    return response.data ?? <String, dynamic>{};
  }
}
