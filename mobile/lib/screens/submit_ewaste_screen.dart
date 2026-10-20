import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../core/api_exception.dart';
import '../core/idempotency_key_generator.dart';
import '../core/location_service.dart';
import '../core/photo_picker_service.dart';
import '../features/auth/auth_controller.dart';
import '../features/ewaste/ewaste_repository.dart';
import '../features/ewaste/models/submission.dart';
import '../features/safety/safety_service.dart';
import '../features/translation/translation_text.dart';
import '../shared/state_views.dart';
import '../shared/submission_status.dart';

class SubmitEwasteScreen extends StatefulWidget {
  final String wardId;
  const SubmitEwasteScreen({super.key, required this.wardId});

  @override
  State<SubmitEwasteScreen> createState() => _SubmitEwasteScreenState();
}

class _SubmitEwasteScreenState extends State<SubmitEwasteScreen> {
  final _photoPicker = PhotoPickerService();
  final _locationService = LocationService();
  final _categoryController = TextEditingController();
  final _weightController = TextEditingController();
  final _safetyService = SafetyService();
  String? _selectedCondition;
  bool _safetyAcknowledged = false;

  // Generated once per submission attempt and reused across retries of
  // that SAME attempt, so a slow-network double-tap on Submit can't create
  // two separate submissions server-side.
  late final String _idempotencyKey;

  XFile? _photo;
  Uint8List? _photoBytes;
  bool _pickingPhoto = false;
  String? _photoError;
  PhotoClassificationResult? _photoClassification;
  PriceEstimate? _priceEstimate;
  bool _estimatingPrice = false;
  String? _priceError;

  bool _locating = false;
  bool _resolvingLocation = false;
  String? _locationError;
  String? _locationName;
  double? _lat;
  double? _lng;

  bool _submitting = false;
  String? _submitError;
  SubmissionCreateResult? _result;

  @override
  void initState() {
    super.initState();
    _idempotencyKey = IdempotencyKeyGenerator.generate();
  }

  @override
  void dispose() {
    _categoryController.dispose();
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
      final classification = await repository.classifyPhoto(
        accessToken: token,
        photoFileId: photoFileId,
      );
      if (!mounted) return;
      setState(() {
        _photoClassification = classification;
        if (classification.category != null) {
          _categoryController.text = classification.category!;
        }
        _safetyAcknowledged = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _photoError = 'Image prediction failed: ${e.message}');
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _photoError = 'Could not access the camera/gallery.';
        _pickingPhoto = false;
      });
    } finally {
      if (mounted) setState(() => _pickingPhoto = false);
    }
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

  Future<void> _reviewAndSubmit() async {
    if (_photo == null) {
      setState(() => _submitError = 'Please capture or select a photo first.');
      return;
    }
    if (_lat == null || _lng == null) {
      setState(() => _submitError = 'Please capture your location first.');
      return;
    }
    final category = _categoryController.text.trim();
    final weight = double.tryParse(_weightController.text.trim());
    if (_selectedCondition == null) {
      setState(() => _submitError = 'Please select the item condition.');
      return;
    }
    if (category.isEmpty) {
      setState(() => _submitError = 'Please enter a material or category.');
      return;
    }
    if (weight == null || weight <= 0) {
      setState(
        () => _submitError =
            'Please enter an approximate weight greater than zero.',
      );
      return;
    }
    if (_priceEstimate == null) {
      setState(() => _submitError = 'Please get a price estimate first.');
      return;
    }
    if (!_safetyAcknowledged) {
      setState(() => _submitError = 'Please review the safety measures first.');
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Review pickup request'),
        content: Text(
          'Category: $category\nApproximate weight: ${weight.toStringAsFixed(2)} kg\n'
          'Pickup location: ${_locationName ?? '${_lat!.toStringAsFixed(5)}, ${_lng!.toStringAsFixed(5)}'}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Edit'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Submit request'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _submit(category: category, weight: weight);
  }

  Future<void> _submit({
    required String category,
    required double weight,
  }) async {
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
      final repository = context.read<EwasteRepository>();
      final photoFileId = await repository.uploadPhoto(
        accessToken: token,
        file: _photo!,
      );
      final result = await repository.createSubmission(
        accessToken: token,
        wardId: widget.wardId,
        photoFileId: photoFileId,
        homeLat: _lat!,
        homeLng: _lng!,
        category: category,
        condition: _selectedCondition,
        approximateWeightKg: weight,
        priceEstimate: _priceEstimate,
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

  Future<void> _estimatePrice() async {
    final category = _categoryController.text.trim();
    final weight = double.tryParse(_weightController.text.trim());
    if (category.isEmpty) {
      setState(() => _priceError = 'Enter or confirm a material/category first.');
      return;
    }
    if (_selectedCondition == null) {
      setState(() => _priceError = 'Select the item condition first.');
      return;
    }
    if (weight == null || weight <= 0) {
      setState(() => _priceError = 'Enter an approximate weight greater than zero.');
      return;
    }
    final token = context.read<AuthController>().session?.accessToken;
    if (token == null) {
      setState(() => _priceError = 'Your session has expired. Please log in again.');
      return;
    }
    setState(() {
      _estimatingPrice = true;
      _priceError = null;
    });
    try {
      final estimate = await context.read<EwasteRepository>().estimatePrice(
        accessToken: token,
        productType: category,
        condition: _selectedCondition!,
        weightKg: weight,
        // The model requires a location, while the user flow captures GPS
        // after estimation. Ward is the server-assigned location fallback.
        location: _locationName ?? widget.wardId,
      );
      if (!mounted) return;
      setState(() => _priceEstimate = estimate);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _priceError = e.message);
    } finally {
      if (mounted) setState(() => _estimatingPrice = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_result != null) return _buildSuccessScreen(_result!);

    return Scaffold(
      appBar: AppBar(title: Text(context.tr('Submit E-Waste'))),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_submitError != null)
                InlineErrorBanner(message: _submitError!),
              Text(context.tr('Photo'), style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 8),
              _buildPhotoPreview(),
              if (_photoClassification != null)
                _buildClassificationResult(_photoClassification!),
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
                      key: const Key('pick_photo_camera_button'),
                      onPressed: _pickingPhoto
                          ? null
                          : () => _pickPhoto(ImageSource.camera),
                      icon: const Icon(Icons.camera_alt_outlined),
                      label: Text(context.tr('Camera')),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const Key('pick_photo_gallery_button'),
                      onPressed: _pickingPhoto
                          ? null
                          : () => _pickPhoto(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library_outlined),
                      label: Text(context.tr('Gallery')),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                context.tr('The selected image is uploaded before the submission is sent. Category and weight remain available as manual fallback.'),
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(color: Colors.grey),
              ),
              const Divider(height: 32),
              Text(
                context.tr('Material and quantity'),
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 8),
              TextField(
                key: const Key('submission_category_field'),
                controller: _categoryController,
                textInputAction: TextInputAction.next,
                onChanged: (_) => setState(() {
                  _priceEstimate = null;
                  _priceError = null;
                  _safetyAcknowledged = false;
                }),
                decoration: InputDecoration(
                  labelText: context.tr('Material/category'),
                  hintText: context.tr('e.g. mobile phones, cables'),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                key: const Key('submission_condition_dropdown'),
                initialValue: _selectedCondition,
                decoration: InputDecoration(
                  labelText: context.tr('Condition'),
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'New', child: Text('New')),
                  DropdownMenuItem(value: 'Like New', child: Text('Like New')),
                  DropdownMenuItem(value: 'Good', child: Text('Good')),
                  DropdownMenuItem(value: 'Used', child: Text('Used')),
                  DropdownMenuItem(value: 'Damaged', child: Text('Damaged')),
                  DropdownMenuItem(value: 'Non-Working', child: Text('Non-Working')),
                ],
                onChanged: (value) => setState(() {
                  _selectedCondition = value;
                  _priceEstimate = null;
                  _priceError = null;
                }),
                validator: (value) => value == null ? 'Select a condition.' : null,
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('submission_weight_field'),
                controller: _weightController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                onChanged: (_) => setState(() {
                  _priceEstimate = null;
                  _priceError = null;
                }),
                decoration: InputDecoration(
                  labelText: context.tr('Approximate weight (kg)'),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                key: const Key('get_price_estimate_button'),
                onPressed: _estimatingPrice ? null : _estimatePrice,
                icon: _estimatingPrice
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.calculate_outlined),
                label: Text(context.tr('Get Price Estimate')),
              ),
              if (_priceError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    _priceError!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              if (_priceEstimate != null) _buildPriceEstimate(_priceEstimate!),
              if (_categoryController.text.trim().isNotEmpty)
                _buildSafetyMeasures(),
              if (_safetyAcknowledged) ...[
                const Divider(height: 32),
                Text(context.tr('Location'), style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 8),
              if (_lat != null && _lng != null)
                  Text(
                    _locationName == null
                        ? '${context.tr('Captured:')} ${_lat!.toStringAsFixed(5)}, ${_lng!.toStringAsFixed(5)}'
                        : '${context.tr('Captured:')} $_locationName',
                  )
              else
                  Text(
                    context.tr('Not captured yet'),
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
                key: const Key('capture_location_button'),
                onPressed: _locating ? null : _captureLocation,
                icon: _locating
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.my_location),
                label: Text(
                  _resolvingLocation
                      ? context.tr('Finding city name...')
                      : context.tr('Use current location'),
                ),
              ),
              ],
              const SizedBox(height: 32),
              ElevatedButton(
                key: const Key('submit_ewaste_confirm_button'),
                onPressed: _submitting ? null : _reviewAndSubmit,
                child: _submitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(context.tr('Submit')),
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

  Widget _buildClassificationResult(PhotoClassificationResult result) {
    if (result.needsReview || result.category == null) {
      return Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Text(
          result.failureReason == null
                    ? context.tr('No confident e-waste object detected. You can enter the category manually.')
                    : '${context.tr('Prediction needs review:')} ${result.failureReason}',
          style: const TextStyle(color: Colors.orange),
        ),
      );
    }
    final confidence = result.confidence == null
        ? ''
        : ' ${(result.confidence! * 100).toStringAsFixed(1)}% confidence';
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text(
        '${context.tr('Detected:')} ${result.detectedClass ?? result.predictedCategory}$confidence '
        '(${result.objectCount} object${result.objectCount == 1 ? '' : 's'}, '
        '${result.boundingBoxes.length} bounding box${result.boundingBoxes.length == 1 ? '' : 'es'})',
        style: const TextStyle(color: Colors.green),
      ),
    );
  }

  Widget _buildPriceEstimate(PriceEstimate estimate) {
    return Card(
      key: const Key('price_estimate_card'),
      margin: const EdgeInsets.only(top: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.tr('Price Estimation'), style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text('${context.tr('Material:')} ${estimate.productType}'),
            Text('${context.tr('Condition:')} ${estimate.condition}'),
            Text('${context.tr('Weight:')} ${estimate.weightKg.toStringAsFixed(2)} kg'),
            const SizedBox(height: 8),
            Text(
              '${context.tr('Estimated price:')} ₹${estimate.minPrice.toStringAsFixed(2)} – '
              '₹${estimate.maxPrice.toStringAsFixed(2)} / kg',
            ),
            Text(
              '${context.tr('Estimated total:')} ₹${estimate.estimatedTotalValue.toStringAsFixed(2)}',
            ),
            Text('${context.tr('Trend:')} ${estimate.trend ?? context.tr('Unavailable')}'),
            const SizedBox(height: 8),
            Text(
              context.tr('Estimated value only. Final price may change after actual weight, condition verification, and recycler offer.'),
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSafetyMeasures() {
    final content = _safetyService.forCategory(_categoryController.text);
    return Card(
      key: const Key('safety_measures_card'),
      margin: const EdgeInsets.only(top: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.tr('Safety Measures'), style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text('${context.tr('Material:')} ${_categoryController.text.trim()}'),
            const SizedBox(height: 12),
            Text(
              context.tr(content.title),
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 4),
            ...content.instructions.map(
              (instruction) => Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('• '),
                    Expanded(child: Text(context.tr(instruction))),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                key: const Key('safety_continue_button'),
                onPressed: () => setState(() {
                  _safetyAcknowledged = true;
                  _submitError = null;
                }),
                child: Text(context.tr('Continue')),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSuccessScreen(SubmissionCreateResult result) {
    final info = submissionStatusInfo(result.status);
    return Scaffold(
      appBar: AppBar(title: Text(context.tr('Submission Sent'))),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.check_circle, color: Colors.green, size: 72),
              const SizedBox(height: 16),
              Text(
                context.tr('Submitted successfully'),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                '${context.tr('Submission ID:')} ${result.submissionId}',
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
              const SizedBox(height: 24),
              ElevatedButton(
                key: const Key('submission_done_button'),
                onPressed: () => Navigator.of(context).pop(),
                child: Text(context.tr('Done')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
