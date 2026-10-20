import 'package:flutter/foundation.dart';

import '../../core/api_exception.dart';
import 'auth_repository.dart';
import 'models/auth_session.dart';

enum AuthStatus { unknown, working, authenticated, unauthenticated }

/// App-wide session state, exposed via Provider. Screens read
/// [status]/[session]/[errorMessage] and call [login]/[logout]/[restore] —
/// none of them talk to AuthRepository directly.
class AuthController extends ChangeNotifier {
  final AuthRepository repository;

  AuthController({required this.repository});

  AuthStatus status = AuthStatus.unknown;
  AuthSession? session;
  String? errorMessage;

  bool get isAuthenticated => status == AuthStatus.authenticated && session != null;

  Future<void> restore() async {
    status = AuthStatus.working;
    notifyListeners();
    try {
      session = await repository.restoreSession();
    } catch (_) {
      session = null;
    }
    status = session != null ? AuthStatus.authenticated : AuthStatus.unauthenticated;
    notifyListeners();
  }

  Future<bool> login(String username, String password) async {
    status = AuthStatus.working;
    errorMessage = null;
    notifyListeners();
    try {
      session = await repository.login(username, password);
      status = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } on WrongRoleException {
      errorMessage = 'This app is for Home Users and Collectors only.';
    } on ApiException catch (e) {
      errorMessage = e.message;
    }
    status = AuthStatus.unauthenticated;
    notifyListeners();
    return false;
  }

  Future<void> logout() async {
    final current = session;
    session = null;
    status = AuthStatus.unauthenticated;
    notifyListeners();
    if (current != null) {
      await repository.logout(current);
    }
  }
}
