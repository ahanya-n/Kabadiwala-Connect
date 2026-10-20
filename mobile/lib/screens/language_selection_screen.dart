import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../features/auth/auth_controller.dart';
import '../features/translation/translation_controller.dart';
import '../features/translation/translation_language.dart';
import '../features/translation/translation_text.dart';

class LanguageSelectionScreen extends StatelessWidget {
  const LanguageSelectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<TranslationController>();
    final token = context.read<AuthController>().session?.accessToken;
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('Select language'))),
      body: ListView.builder(
        itemCount: TranslationLanguage.supported.length,
        itemBuilder: (context, index) {
          final language = TranslationLanguage.supported[index];
          return RadioListTile<String>(
            title: Text(language.name),
            value: language.code,
            groupValue: controller.selectedLanguage,
            onChanged: token == null
                ? null
                : (value) async {
                    if (value == null) return;
                    await controller.selectLanguage(value, token);
                    if (context.mounted) Navigator.of(context).pop();
                  },
          );
        },
      ),
    );
  }
}