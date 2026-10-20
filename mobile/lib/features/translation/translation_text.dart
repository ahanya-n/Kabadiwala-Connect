import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import 'translation_controller.dart';

extension TranslationText on BuildContext {
  String tr(String source) => watch<TranslationController?>()?.text(source) ?? source;
}