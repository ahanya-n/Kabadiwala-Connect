import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kabadiwala_mobile/core/api_client.dart';
import 'package:kabadiwala_mobile/features/translation/translation_controller.dart';
import 'package:kabadiwala_mobile/features/translation/translation_language.dart';
import 'package:kabadiwala_mobile/features/translation/translation_repository.dart';
import 'package:kabadiwala_mobile/features/translation/translation_storage.dart';

class _MemoryStorage implements TranslationKeyValueStore {
  final values = <String, String>{};

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> delete(String key) async => values.remove(key);
}

void main() {
  test('exposes exact IndicTrans2 language codes', () {
    expect(TranslationLanguage.byCode('hin_Deva')?.name, 'Hindi');
    expect(TranslationLanguage.byCode('kan_Knda')?.name, 'Kannada');
    expect(TranslationLanguage.byCode('kas_Arab')?.name, 'Kashmiri (Arabic)');
    expect(TranslationLanguage.byCode('not_supported'), isNull);
  });

  test('repository sends a batch translation request and preserves order', () async {
    final repository = TranslationRepository(
      apiClient: ApiClient(
        baseUrl: 'http://test',
        client: MockClient((request) async {
          expect(request.url.path, '/api/v1/translation/translate-batch');
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(body['target_language'], 'hin_Deva');
          return http.Response.bytes(
            utf8.encode(
              jsonEncode({
                'translations': [
                  {'source_text': 'Home', 'translated_text': 'घर'},
                  {'source_text': 'Continue', 'translated_text': 'जारी रखें'},
                ],
                'cached': false,
              }),
            ),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      ),
    );
    final result = await repository.translateBatch(
      accessToken: 'token',
      targetLanguage: 'hin_Deva',
      texts: ['Home', 'Continue'],
    );
    expect(result.translations['Home'], 'घर');
    expect(result.translations['Continue'], 'जारी रखें');
  });

  test('controller falls back to source text when translation is unavailable', () async {
    final controller = TranslationController(
      repository: TranslationRepository(
        apiClient: ApiClient(
          baseUrl: 'http://test',
          client: MockClient((_) async => http.Response('{}', 503)),
        ),
      ),
      storage: TranslationStorage(storage: _MemoryStorage()),
    );
    await controller.selectLanguage('hin_Deva', 'token');
    expect(controller.text('Safety Measures'), 'Safety Measures');
    expect(controller.errorMessage, isNotNull);
  });
}