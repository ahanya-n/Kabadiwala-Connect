/// The real result of `POST /ewaste/submissions/{id}/handover` — mirrors
/// the backend's HandoverResponse exactly. `verificationResult` and
/// `status` are always the backend's actual returned values; this app
/// never fabricates a "VERIFIED"/"COLLECTED" outcome client-side.
class HandoverResult {
  final String submissionId;
  final String status;
  final String verificationResult;
  final double? distanceM;
  final List<String> reasons;

  const HandoverResult({
    required this.submissionId,
    required this.status,
    required this.verificationResult,
    this.distanceM,
    this.reasons = const [],
  });

  bool get isVerified => verificationResult == 'VERIFIED';

  factory HandoverResult.fromJson(Map<String, dynamic> json) => HandoverResult(
        submissionId: json['submission_id'] as String,
        status: json['status'] as String,
        verificationResult: json['verification_result'] as String,
        distanceM: (json['distance_m'] as num?)?.toDouble(),
        reasons: (json['reasons'] as List<dynamic>? ?? []).map((r) => r as String).toList(),
      );
}
