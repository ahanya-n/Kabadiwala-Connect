import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/api_exception.dart';
import '../../core/idempotency_key_generator.dart';
import '../../core/location_service.dart';
import '../../core/photo_picker_service.dart';
import '../../features/auth/auth_controller.dart';
import '../../features/ewaste/ewaste_repository.dart';
import '../../features/ewaste/models/handover_result.dart';
import '../../features/ewaste/models/submission.dart';
import '../../shared/state_views.dart';
import '../../shared/submission_status.dart';

/// Confirms handover for one submission. The verification result shown at
/// the end is exactly what POST /handover returned — geo-verification
/// (GPS validity, timestamp sanity, distance, ward match) runs entirely
/// server-side using the existing Phase 2 logic; this screen never decides
/// or simulates VERIFIED/FLAGGED itself.
class CollectorHandoverScreen extends StatefulWidget {
  final Submission submission;
  const CollectorHandoverScreen({super.key, required this.submission});

  @override
  State<CollectorHandoverScreen> createState() =>
      _CollectorHandoverScreenState();
}

class _CollectorHandoverScreenState extends State<CollectorHandoverScreen> {
  final _photoPicker = PhotoPickerService();
  final _locationService = LocationService();
  final _weightController = TextEditingController();

  // One key per handover attempt, reused across retries of that same
  // attempt — same pattern as the Home User submission screen.
  late final String _idempotencyKey;

  XFile? _photo;
  Uint8List? _photoBytes;
  String? _photoFileId;
  bool _photoClassificationComplete = false;
  bool _pickingPhoto = false;
  String? _photoError;

  bool _locating = false;
  bool _resolvingLocation = false;
  String? _locationError;
  String? _locationName;
  double? _lat;
  double? _lng;

  bool _submitting = false;
  String? _submitError;
  HandoverResult? _result;

  @override
  void initState() {
    super.initState();
    _idempotencyKey = IdempotencyKeyGenerator.generate();
  }

  @override
  void dispose() {
    _weightController.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto(ImageSource source) async {
    setState(() {
      _pickingPhoto = true;
      _photoError = null;
    });
    try {
      final file = await _photoPicker.pickPhoto(source: source);
      if (file == null) {
        if (mounted) setState(() => _pickingPhoto = false);
        return;
      }
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      setState(() {
        _photo = file;
        _photoBytes = bytes;
        _photoFileId = null;
        _photoClassificationComplete = false;
      });

      final token = context.read<AuthController>().session?.accessToken;
      if (token == null) {
        throw const ApiException(
          errorCode: 'INVALID_TOKEN',
          message: 'Your session has expired. Please log in again.',
        );
      }
      final repository = context.read<EwasteRepository>();
      final photoFileId = await repository.uploadPhoto(
        accessToken: token,
        file: file,
      );
      if (!mounted) return;
      setState(() => _photoFileId = photoFileId);

      await repository.classifyPhoto(
        accessToken: token,
        photoFileId: photoFileId,
      );
      if (!mounted) return;
      setState(() => _photoClassificationComplete = true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _photoError = 'Photo processing failed: ${e.message}');
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _photoError = 'Could not upload or classify the photo.';
      });
    }
    if (mounted) setState(() => _pickingPhoto = false);
  }

  Future<void> _captureLocation() async {
    setState(() {
      _locating = true;
      _resolvingLocation = false;
      _locationError = null;
    });
    try {
      final position = await _locationService.getCurrentLocation();
      if (!mounted) return;
      setState(() {
        _lat = position.latitude;
        _lng = position.longitude;
        _locationName = null;
        _resolvingLocation = true;
      });
      final locationName = await _locationService.getReadableLocation(position);
      if (!mounted) return;
      setState(() {
        _locationName = locationName;
        _resolvingLocation = false;
        if (locationName == null) {
          _locationError = 'Could not find a city name. Showing coordinates instead.';
        }
      });
    } on LocationException catch (e) {
      if (!mounted) return;
      setState(() => _locationError = e.message);
    } finally {
      if (mounted) {
        setState(() {
          _locating = false;
          _resolvingLocation = false;
        });
      }
    }
  }

  Future<void> _confirmHandover() async {
    if (_photo == null || _photoFileId == null || !_photoClassificationComplete) {
      setState(() => _submitError = 'Please capture or select a photo first.');
      return;
    }
    if (_lat == null || _lng == null) {
      setState(() => _submitError = 'Please capture your location first.');
      return;
    }
    final actualWeight = double.tryParse(_weightController.text.trim());
    if (actualWeight == null || actualWeight <= 0) {
      setState(
        () => _submitError = 'Please enter the actual collected weight.',
      );
      return;
    }

    setState(() {
      _submitting = true;
      _submitError = null;
    });
    final token = context.read<AuthController>().session?.accessToken;
    if (token == null) {
      setState(() {
        _submitting = false;
        _submitError = 'Your session has expired. Please log in again.';
      });
      return;
    }

    try {
      final result = await context.read<EwasteRepository>().handover(
        accessToken: token,
        submissionId: widget.submission.submissionId,
        photoFileId: _photoFileId!,
        collectorLat: _lat!,
        collectorLng: _lng!,
        actualWeightKg: actualWeight,
        idempotencyKey: _idempotencyKey,
      );
      if (!mounted) return;
      setState(() {
        _result = result;
        _submitting = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _submitError = e.message;
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_result != null) return _buildResultScreen(_result!);

    return Scaffold(
      appBar: AppBar(title: const Text('Confirm Handover')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text('Submission: ${widget.submission.submissionId}'),
                ),
              ),
              TextField(
                key: const Key('actual_weight_field'),
                controller: _weightController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Actual collected weight (kg)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              const SizedBox(height: 16),
              if (_submitError != null)
                InlineErrorBanner(message: _submitError!),
              Text(
                'Collector Photo',
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 8),
              _buildPhotoPreview(),
              if (_photoError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    _photoError!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const Key('handover_pick_photo_camera_button'),
                      onPressed: _pickingPhoto
                          ? null
                          : () => _pickPhoto(ImageSource.camera),
                      icon: const Icon(Icons.camera_alt_outlined),
                      label: const Text('Camera'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const Key('handover_pick_photo_gallery_button'),
                      onPressed: _pickingPhoto
                          ? null
                          : () => _pickPhoto(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library_outlined),
                      label: const Text('Gallery'),
                    ),
                  ),
                ],
              ),
              const Divider(height: 32),
              Text(
                'Your Location',
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 8),
              if (_lat != null && _lng != null)
                Text(
                  _locationName == null
                      ? 'Captured: ${_lat!.toStringAsFixed(5)}, ${_lng!.toStringAsFixed(5)}'
                      : 'Captured: $_locationName',
                )
              else
                const Text(
                  'Not captured yet',
                  style: TextStyle(color: Colors.grey),
                ),
              if (_locationError != null) ...[
                const SizedBox(height: 4),
                Text(
                  _locationError!,
                  style: const TextStyle(color: Colors.red),
                ),
              ],
              const SizedBox(height: 8),
              OutlinedButton.icon(
                key: const Key('handover_capture_location_button'),
                onPressed: _locating ? null : _captureLocation,
                icon: _locating
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.my_location),
                label: Text(
                  _resolvingLocation ? 'Finding city name...' : 'Use current location',
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Your location and timestamp are verified against the submission '
                'server-side (distance, GPS validity, timing) before this is marked collected.',
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(color: Colors.grey),
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                key: const Key('confirm_handover_button'),
                onPressed: _submitting ? null : _confirmHandover,
                child: _submitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Confirm Handover'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPhotoPreview() {
    if (_pickingPhoto) return const LoadingView();
    if (_photoBytes == null) {
      return Container(
        height: 160,
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Center(
          child: Text(
            'No photo selected',
            style: TextStyle(color: Colors.grey),
          ),
        ),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Image.memory(
        _photoBytes!,
        height: 160,
        fit: BoxFit.cover,
        width: double.infinity,
      ),
    );
  }

  Widget _buildResultScreen(HandoverResult result) {
    final info = submissionStatusInfo(result.status);
    return Scaffold(
      appBar: AppBar(title: const Text('Handover Result')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                result.isVerified
                    ? Icons.check_circle
                    : Icons.warning_amber_rounded,
                color: result.isVerified ? Colors.green : Colors.orange,
                size: 72,
              ),
              const SizedBox(height: 16),
              Text(
                result.isVerified
                    ? 'Handover verified'
                    : 'Handover flagged for review',
                style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Chip(
                label: Text(
                  info.label,
                  style: const TextStyle(color: Colors.white),
                ),
                backgroundColor: info.color,
              ),
              if (result.distanceM != null) ...[
                const SizedBox(height: 8),
                Text(
                  'Distance from submission: ${result.distanceM!.toStringAsFixed(1)} m',
                ),
              ],
              if (result.reasons.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  'Reasons: ${result.reasons.join(", ")}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.orange),
                ),
              ],
              const SizedBox(height: 24),
              ElevatedButton(
                key: const Key('handover_done_button'),
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('Done'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
