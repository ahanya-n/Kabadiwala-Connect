import 'package:flutter/foundation.dart';

import '../../core/api_exception.dart';
import 'translation_catalog.dart';
import 'translation_language.dart';
import 'translation_repository.dart';
import 'translation_storage.dart';

class TranslationController extends ChangeNotifier {
  final TranslationRepository repository;
  final TranslationStorage storage;

  TranslationController({required this.repository, required this.storage});

  String selectedLanguage = TranslationLanguage.english.code;
  bool loading = false;
  String? errorMessage;
  Map<String, Map<String, String>> _cache = {};

  bool get isEnglish => selectedLanguage == TranslationLanguage.english.code;

  String text(String source) {
    if (isEnglish) return source;
    return _cache[selectedLanguage]?[source] ?? source;
  }

  Future<void> initialize() async {
    selectedLanguage = await storage.loadLanguage() ?? TranslationLanguage.english.code;
    _cache = await storage.loadCache();
    notifyListeners();
  }

  Future<void> selectLanguage(String language, String? accessToken) async {
    if (TranslationLanguage.byCode(language) == null) return;
    selectedLanguage = language;
    errorMessage = null;
    await storage.saveLanguage(language);
    notifyListeners();
    if (isEnglish || accessToken == null) return;
    await translateCatalog(accessToken);
  }

  Future<void> translateCatalog(String accessToken) async {
    if (isEnglish || _hasCatalog()) return;
    loading = true;
    errorMessage = null;
    notifyListeners();
    try {
      final result = await repository.translateBatch(
        accessToken: accessToken,
        targetLanguage: selectedLanguage,
        texts: TranslationCatalog.texts,
      );
      _cache[selectedLanguage] = {
        ...?_cache[selectedLanguage],
        ...result.translations,
      };
      await storage.saveCache(_cache);
    } on ApiException catch (e) {
      errorMessage = e.message;
    } catch (_) {
      errorMessage = 'Translation unavailable. Showing English.';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  bool _hasCatalog() {
    final cached = _cache[selectedLanguage];
    return cached != null && TranslationCatalog.texts.every(cached.containsKey);
  }
}