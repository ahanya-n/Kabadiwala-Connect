import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/api_client.dart';
import 'core/auth_storage.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/auth_repository.dart';
import 'features/collector/collector_repository.dart';
import 'features/ewaste/ewaste_repository.dart';
import 'features/home_user/home_user_repository.dart';
import 'features/rewards/rewards_repository.dart';
import 'features/notifications/notifications_repository.dart';
import 'features/translation/translation_controller.dart';
import 'features/translation/translation_repository.dart';
import 'features/translation/translation_storage.dart';
import 'shared/theme.dart';
import 'screens/auth_gate.dart';

void main() {
  runApp(const KabadiwalaHomeUserApp());
}

class KabadiwalaHomeUserApp extends StatelessWidget {
  const KabadiwalaHomeUserApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<ApiClient>(create: (_) => ApiClient()),
        Provider<AuthStorage>(create: (_) => AuthStorage()),
        Provider<AuthRepository>(
          create: (ctx) => AuthRepository(
            apiClient: ctx.read<ApiClient>(),
            authStorage: ctx.read<AuthStorage>(),
          ),
        ),
        Provider<HomeUserRepository>(
          create: (ctx) => HomeUserRepository(apiClient: ctx.read<ApiClient>()),
        ),
        Provider<CollectorRepository>(
          create: (ctx) => CollectorRepository(apiClient: ctx.read<ApiClient>()),
        ),
        Provider<EwasteRepository>(
          create: (ctx) => EwasteRepository(apiClient: ctx.read<ApiClient>()),
        ),
        Provider<RewardsRepository>(
          create: (ctx) => RewardsRepository(apiClient: ctx.read<ApiClient>()),
        ),
        Provider<NotificationsRepository>(
          create: (ctx) => NotificationsRepository(apiClient: ctx.read<ApiClient>()),
        ),
        Provider<TranslationStorage>(create: (_) => TranslationStorage()),
        Provider<TranslationRepository>(
          create: (ctx) => TranslationRepository(apiClient: ctx.read<ApiClient>()),
        ),
        ChangeNotifierProvider<TranslationController>(
          create: (ctx) => TranslationController(
            repository: ctx.read<TranslationRepository>(),
            storage: ctx.read<TranslationStorage>(),
          )..initialize(),
        ),
        ChangeNotifierProvider<AuthController>(
          create: (ctx) => AuthController(repository: ctx.read<AuthRepository>())..restore(),
        ),
      ],
      child: MaterialApp(
        title: 'Kabadiwala Connect',
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        home: const AuthGate(),
      ),
    );
  }
}
