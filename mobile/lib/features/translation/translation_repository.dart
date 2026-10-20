import '../../core/api_client.dart';
import 'translation_language.dart';

class TranslationBatchResult {
  final Map<String, String> translations;
  final bool cached;

  const TranslationBatchResult(this.translations, this.cached);
}

class TranslationRepository {
  final ApiClient apiClient;

  TranslationRepository({required this.apiClient});

  Future<TranslationBatchResult> translateBatch({
    required String accessToken,
    required String targetLanguage,
    required List<String> texts,
  }) async {
    final json = await apiClient.post(
      '/api/v1/translation/translate-batch',
      token: accessToken,
      body: {'target_language': targetLanguage, 'texts': texts},
    );
    final items = (json['translations'] as List<dynamic>? ?? [])
        .cast<Map<String, dynamic>>();
    return TranslationBatchResult(
      {
        for (final item in items)
          item['source_text'] as String: item['translated_text'] as String,
      },
      json['cached'] as bool? ?? false,
    );
  }

  Future<List<TranslationLanguage>> supportedLanguages(String accessToken) async {
    final json = await apiClient.get('/api/v1/translation/languages', token: accessToken);
    return (json['languages'] as List<dynamic>? ?? [])
        .map((item) => TranslationLanguage(
              item['code'] as String,
              item['name'] as String,
            ))
        .toList();
  }
}