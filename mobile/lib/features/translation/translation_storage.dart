import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class TranslationKeyValueStore {
  Future<String?> read(String key);

  Future<void> write(String key, String value);

  Future<void> delete(String key);
}

class SecureTranslationKeyValueStore implements TranslationKeyValueStore {
  final FlutterSecureStorage storage;

  SecureTranslationKeyValueStore({FlutterSecureStorage? storage})
      : storage = storage ?? const FlutterSecureStorage();

  @override
  Future<String?> read(String key) => storage.read(key: key);

  @override
  Future<void> write(String key, String value) => storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => storage.delete(key: key);
}

class TranslationStorage {
  static const _languageKey = 'kc_translation_language';
  static const _cacheKey = 'kc_translation_cache';

  final TranslationKeyValueStore _storage;

  TranslationStorage({TranslationKeyValueStore? storage})
      : _storage = storage ?? SecureTranslationKeyValueStore();

  Future<String?> loadLanguage() => _storage.read(_languageKey);

  Future<void> saveLanguage(String code) => _storage.write(_languageKey, code);

  Future<Map<String, Map<String, String>>> loadCache() async {
    final raw = await _storage.read(_cacheKey);
    if (raw == null) return {};
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      return decoded.map(
        (language, values) => MapEntry(
          language,
          (values as Map<String, dynamic>).map(
            (source, translated) => MapEntry(source, translated as String),
          ),
        ),
      );
    } catch (_) {
      await _storage.delete(_cacheKey);
      return {};
    }
  }

  Future<void> saveCache(Map<String, Map<String, String>> cache) =>
      _storage.write(_cacheKey, jsonEncode(cache));
}