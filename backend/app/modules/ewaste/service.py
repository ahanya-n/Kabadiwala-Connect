"""
E-waste submission + handover, the first idempotency-key consumer and the
first module driven by app/state_machines/ewaste_states.py. No endpoint
writes `status` directly — every change goes through `transition()`.

Phase 2 scope note: the item's lifecycle state lives on the
`e_waste_submissions` document itself. The architecture's separate
`e_waste_items` collection (with its immutable `reward_eligible_at` stamp)
is not created here — that field only matters once the Phase 9 reward batch
exists, so introducing the collection now would be an empty shell. This is
a deliberate Phase 2 scoping decision, documented in PROJECT_STATUS.md, not
a silent architecture change.
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from pymongo.errors import DuplicateKeyError

from app.core import audit, idempotency
from app.core.config import settings
from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.geo import haversine_distance_meters, is_valid_coordinate
from app.db.repositories import classifications_repo, collectors_repo, handovers_repo, submissions_repo, wards_repo
from app.modules.rrr_centres import service as rrr_centres_service
from app.modules.notifications import service as notifications_service
from app.state_machines.ewaste_states import transition

SUBMISSION_IDEMPOTENCY_SCOPE = "ewaste_submission_create"
HANDOVER_IDEMPOTENCY_SCOPE = "ewaste_handover"
ACCEPT_IDEMPOTENCY_SCOPE = "ewaste_collector_accept"
RECEIVE_IDEMPOTENCY_SCOPE = "ewaste_receive"
CLASSIFY_IDEMPOTENCY_SCOPE = "ewaste_classify"


def _naive_utc(dt: datetime) -> datetime:
    """Real MongoDB always returns naive-but-UTC datetimes (BSON has no
    timezone concept); normalize every timestamp to that shape before
    storing or comparing so behavior is identical against mongomock (which,
    unlike real Mongo, can hand back a tz-aware Python object as-is) and
    real MongoDB alike."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


async def create_submission(
    *,
    current_user: dict,
    ward_id: str,
    photo_file_id: str,
    home_lat: float | None,
    home_lng: float | None,
    home_ts: datetime | None,
    category: str | None = None,
    condition: str | None = None,
    approximate_weight_kg: float | None = None,
    price_estimate: dict | None = None,
    idempotency_key: str,
) -> dict:
    cached = await idempotency.get_cached_response(current_user["user_id"], idempotency_key, SUBMISSION_IDEMPOTENCY_SCOPE)
    if cached is not None:
        return cached

    ward = await wards_repo.find_by_ward_id(ward_id)
    if ward is None:
        raise not_found("WARD_NOT_FOUND", "No ward exists with this ward_id.")
    if category is not None and not category.strip():
        raise bad_request("CATEGORY_REQUIRED", "Material/category cannot be empty.")
    if condition is not None and not condition.strip():
        raise bad_request("CONDITION_REQUIRED", "Condition cannot be empty.")
    if approximate_weight_kg is not None and approximate_weight_kg <= 0:
        raise bad_request("INVALID_APPROXIMATE_WEIGHT", "Approximate weight must be greater than zero.")

    now = datetime.now(timezone.utc)
    submission_id = str(uuid4())

    status = transition("CREATED", "PHOTO_CAPTURED")
    status = transition(status, "WAITING_FOR_COLLECTION")

    doc = {
        "submission_id": submission_id,
        "home_user_id": current_user["user_id"],
        "ward_id": ward_id,
        "photo_file_id": photo_file_id,
        "category": category.strip() if category else None,
        "condition": condition.strip() if condition else None,
        "approximate_weight_kg": approximate_weight_kg,
        "price_estimate": price_estimate,
        "home_lat": home_lat,
        "home_lng": home_lng,
        "home_ts": _naive_utc(home_ts) if home_ts else _naive_utc(now),
        "status": status,
        "created_at": now,
        "updated_at": now,
    }
    await submissions_repo.insert_submission(doc)

    await notifications_service.create_notification(
        user_id=current_user["user_id"],
        event_key=f"submission:{submission_id}:created",
        notification_type=notifications_service.COLLECTION_REQUEST_CREATED,
        title_key="Collection request created",
        message_key="Your e-waste submission was successfully received.",
        related_entity_type="e_waste_submission",
        related_entity_id=submission_id,
        metadata={"status": status},
    )

    await audit.record(
        actor_id=current_user["user_id"],
        actor_role=current_user["role"],
        action="EWASTE_SUBMISSION_CREATED",
        entity_type="e_waste_submission",
        entity_id=submission_id,
        details={"status": status, "ward_id": ward_id},
    )

    response = {"submission_id": submission_id, "status": status}
    await idempotency.store_response(current_user["user_id"], idempotency_key, SUBMISSION_IDEMPOTENCY_SCOPE, response)
    return response


async def list_my_submissions(home_user_id: str) -> list[dict]:
    docs = await submissions_repo.list_by_home_user(home_user_id)
    for d in docs:
        d.pop("_id", None)
    return docs


async def list_pending_for_collector(current_user: dict) -> list[dict]:
    """The collector's pending-collection queue: submissions awaiting
    handover in *their own* ward only. The ward comes from the collector's
    own profile, never from a client-supplied parameter — same ownership
    pattern as the COLLECTOR_OUTSIDE_ASSIGNED_AREA check in handover()
    below, so a collector can't browse another ward's queue by passing a
    different id."""
    collector_profile = await collectors_repo.find_by_user_id(current_user["user_id"])
    if collector_profile is None:
        raise not_found("COLLECTOR_PROFILE_NOT_FOUND", "No collector profile found for this account.")

    docs = await submissions_repo.list_pending_by_ward(collector_profile["ward_id"])
    for d in docs:
        d.pop("_id", None)
    return docs


async def list_assigned_for_collector(current_user: dict) -> list[dict]:
    docs = await submissions_repo.list_assigned_to_collector(current_user["user_id"])
    for d in docs:
        d.pop("_id", None)
    return docs


async def accept_submission(*, current_user: dict, submission_id: str, idempotency_key: str) -> dict:
    cached = await idempotency.get_cached_response(
        current_user["user_id"], idempotency_key, ACCEPT_IDEMPOTENCY_SCOPE
    )
    if cached is not None:
        return cached

    collector_profile = await collectors_repo.find_by_user_id(current_user["user_id"])
    if collector_profile is None:
        raise not_found("COLLECTOR_PROFILE_NOT_FOUND", "No collector profile found for this account.")
    submission = await submissions_repo.find_by_submission_id(submission_id)
    if submission is None:
        raise not_found("SUBMISSION_NOT_FOUND", "No submission exists with this submission_id.")
    if submission["ward_id"] != collector_profile["ward_id"]:
        raise forbidden("COLLECTOR_OUTSIDE_ASSIGNED_AREA", "This submission is outside your assigned ward.")
    if submission["status"] != "WAITING_FOR_COLLECTION":
        raise conflict("SUBMISSION_ALREADY_ASSIGNED", "This submission is no longer available for acceptance.")

    now = datetime.now(timezone.utc)
    accepted_status = transition("WAITING_FOR_COLLECTION", "COLLECTOR_ASSIGNED")
    accepted_status = transition(accepted_status, "COLLECTOR_ACCEPTED")
    claimed = await submissions_repo.assign_collector_if_waiting(
        submission_id, current_user["user_id"], accepted_status, now
    )
    if claimed is None:
        raise conflict("SUBMISSION_ALREADY_ASSIGNED", "This submission is no longer available for acceptance.")

    await notifications_service.create_notification(
        user_id=submission["home_user_id"],
        event_key=f"submission:{submission_id}:collector_accepted",
        notification_type=notifications_service.COLLECTION_REQUEST_ACCEPTED,
        title_key="Collection request accepted",
        message_key="A collector has accepted your collection request.",
        related_entity_type="e_waste_submission",
        related_entity_id=submission_id,
        metadata={"status": accepted_status},
    )

    await audit.record(
        actor_id=current_user["user_id"],
        actor_role=current_user["role"],
        action="EWASTE_COLLECTOR_ACCEPTED",
        entity_type="e_waste_submission",
        entity_id=submission_id,
        details={"status": "COLLECTOR_ACCEPTED"},
    )
    response = {
        "submission_id": submission_id,
        "status": "COLLECTOR_ACCEPTED",
        "assigned_collector_id": current_user["user_id"],
    }
    await idempotency.store_response(
        current_user["user_id"], idempotency_key, ACCEPT_IDEMPOTENCY_SCOPE, response
    )
    return response


# --- RRR Centre queues + actions (Phase 5) -------------------------------
# Every one of these starts with require_approved_rrr(current_user), which
# raises RRR_NOT_APPROVED for a real-but-still-PENDING account — role
# alone is never sufficient, same principle as the collector ward-match
# check above. The RRR's own ward_id (from their profile, set once at
# registration and never client-suppliable) is what scopes every query and
# ownership check below — an RRR can't act on or browse another ward's
# items by passing a different id.


async def list_awaiting_receipt_for_rrr(current_user: dict) -> list[dict]:
    rrr_profile = await rrr_centres_service.require_approved_rrr(current_user)
    docs = await submissions_repo.list_by_ward_and_status(rrr_profile["ward_id"], "COLLECTED")
    for d in docs:
        d.pop("_id", None)
    return docs


async def receive(*, current_user: dict, submission_id: str, idempotency_key: str) -> dict:
    cached = await idempotency.get_cached_response(current_user["user_id"], idempotency_key, RECEIVE_IDEMPOTENCY_SCOPE)
    if cached is not None:
        return cached

    rrr_profile = await rrr_centres_service.require_approved_rrr(current_user)

    submission = await submissions_repo.find_by_submission_id(submission_id)
    if submission is None:
        raise not_found("SUBMISSION_NOT_FOUND", "No submission exists with this submission_id.")
    if submission["ward_id"] != rrr_profile["ward_id"]:
        raise forbidden("RRR_OUTSIDE_ASSIGNED_WARD", "This submission is outside your assigned ward.")
    if submission["status"] != "COLLECTED":
        raise bad_request(
            "SUBMISSION_NOT_COLLECTED",
            f"Submission is in status {submission['status']}, not eligible for receipt at an RRR centre.",
        )

    new_status = transition("COLLECTED", "AT_RRR")
    await submissions_repo.update_status(submission_id, new_status)

    await audit.record(
        actor_id=current_user["user_id"],
        actor_role=current_user["role"],
        action="EWASTE_RECEIVED_AT_RRR",
        entity_type="e_waste_submission",
        entity_id=submission_id,
        details={"status": new_status, "rrr_id": rrr_profile["rrr_id"]},
    )

    response = {"submission_id": submission_id, "status": new_status}
    await idempotency.store_response(current_user["user_id"], idempotency_key, RECEIVE_IDEMPOTENCY_SCOPE, response)
    return response


async def list_awaiting_classification_for_rrr(current_user: dict) -> list[dict]:
    """Phase 8: widened to also include NEEDS_REVIEW items (the AI side
    branch) alongside the original AT_RRR ones — both are eligible for
    the same manual classify() resolution, so RRR staff need to see both
    in one queue. Two queries merged rather than a new repo function,
    since list_by_ward_and_status already takes a single status."""
    rrr_profile = await rrr_centres_service.require_approved_rrr(current_user)
    at_rrr_docs = await submissions_repo.list_by_ward_and_status(rrr_profile["ward_id"], "AT_RRR")
    needs_review_docs = await submissions_repo.list_by_ward_and_status(rrr_profile["ward_id"], "NEEDS_REVIEW")
    docs = at_rrr_docs + needs_review_docs
    docs.sort(key=lambda d: d.get("created_at") or d.get("updated_at"), reverse=True)
    for d in docs:
        d.pop("_id", None)
    return docs


async def classify(*, current_user: dict, submission_id: str, category: str, idempotency_key: str) -> dict:
    cached = await idempotency.get_cached_response(current_user["user_id"], idempotency_key, CLASSIFY_IDEMPOTENCY_SCOPE)
    if cached is not None:
        return cached

    rrr_profile = await rrr_centres_service.require_approved_rrr(current_user)

    submission = await submissions_repo.find_by_submission_id(submission_id)
    if submission is None:
        raise not_found("SUBMISSION_NOT_FOUND", "No submission exists with this submission_id.")
    if submission["ward_id"] != rrr_profile["ward_id"]:
        raise forbidden("RRR_OUTSIDE_ASSIGNED_WARD", "This submission is outside your assigned ward.")
    # Phase 8: manual classification also resolves a NEEDS_REVIEW item
    # (the AI side branch) — not just the original AT_RRR case. Same
    # function, same audit action, same append-only classification
    # record; only the accepted starting status widened.
    if submission["status"] not in ("AT_RRR", "NEEDS_REVIEW"):
        raise bad_request(
            "SUBMISSION_NOT_AT_RRR",
            f"Submission is in status {submission['status']}, not eligible for classification.",
        )

    new_status = transition(submission["status"], "CLASSIFIED")

    await classifications_repo.insert_classification(
        {
            # Phase 8: classification_id added additively for a uniform
            # audit trail across manual and AI attempts — the manual path
            # itself is otherwise byte-for-byte unchanged from Phase 5.
            "classification_id": str(uuid4()),
            "item_id": submission_id,
            "predicted_category": None,
            "confidence": None,
            "model_version": "unavailable",
            "confirmed_category": category,
            "confirmed_by": current_user["user_id"],
            "source": "MANUAL",
            "status": "ACCEPTED",
            "failure_reason": None,
            "created_at": datetime.now(timezone.utc),
        }
    )
    await submissions_repo.update_status_and_category(submission_id, new_status, category)

    await audit.record(
        actor_id=current_user["user_id"],
        actor_role=current_user["role"],
        action="EWASTE_CLASSIFIED",
        entity_type="e_waste_submission",
        entity_id=submission_id,
        details={"status": new_status, "category": category},
    )

    response = {"submission_id": submission_id, "status": new_status, "category": category}
    await idempotency.store_response(current_user["user_id"], idempotency_key, CLASSIFY_IDEMPOTENCY_SCOPE, response)
    return response


async def list_classified_for_rrr(current_user: dict) -> list[dict]:
    """CLASSIFIED-but-not-yet-lotted items in the caller's own ward — the
    pool a lot can be built from. Once lot creation moves an item to
    LOT_CREATED it naturally drops out of this list without any extra
    filtering."""
    rrr_profile = await rrr_centres_service.require_approved_rrr(current_user)
    docs = await submissions_repo.list_by_ward_and_status(rrr_profile["ward_id"], "CLASSIFIED")
    for d in docs:
        d.pop("_id", None)
    return docs


async def get_submission(submission_id: str, current_user: dict) -> dict:
    doc = await submissions_repo.find_by_submission_id(submission_id)
    if doc is None:
        raise not_found("SUBMISSION_NOT_FOUND", "No submission exists with this submission_id.")

    is_owner_home_user = current_user["role"] == "HOME_USER" and doc["home_user_id"] == current_user["user_id"]
    is_admin = current_user["role"] == "GOVERNMENT_ADMIN"
    if not (is_owner_home_user or is_admin):
        raise forbidden("NOT_RESOURCE_OWNER", "You do not have access to this submission.")

    doc.pop("_id", None)
    from app.db.repositories import classifications_repo

    classification = await classifications_repo.find_by_item_id(submission_id)
    if classification is not None:
        classification.pop("_id", None)
        doc["ai_classification"] = classification
    return doc


async def handover(
    *,
    current_user: dict,
    submission_id: str,
    photo_file_id: str,
    collector_lat: float | None,
    collector_lng: float | None,
    collector_ts: datetime | None,
    actual_weight_kg: float | None = None,
    idempotency_key: str,
) -> dict:
    cached = await idempotency.get_cached_response(current_user["user_id"], idempotency_key, HANDOVER_IDEMPOTENCY_SCOPE)
    if cached is not None:
        return cached

    submission = await submissions_repo.find_by_submission_id(submission_id)
    if submission is None:
        raise not_found("SUBMISSION_NOT_FOUND", "No submission exists with this submission_id.")

    # Duplicate-handover check runs before the status check: once a first
    # handover has been recorded, the submission's status has already moved
    # on (to COLLECTED or FLAGGED_FOR_REVIEW), so without this ordering a
    # second attempt would surface as a generic "wrong status" error instead
    # of the specific DUPLICATE_HANDOVER the architecture calls for. Also
    # enforced at the DB level (unique index on
    # collection_handovers.submission_id) as the actual race-safe guarantee
    # — this pre-check just gives a cleaner error on the common sequential path.
    existing_handover = await handovers_repo.find_by_submission_id(submission_id)
    if existing_handover is not None:
        raise conflict("DUPLICATE_HANDOVER", "A handover has already been recorded for this submission.")

    if submission["status"] != "WAITING_FOR_COLLECTION":
        if submission["status"] not in ("COLLECTOR_ASSIGNED", "COLLECTOR_ACCEPTED", "COLLECTING"):
            raise bad_request(
                "SUBMISSION_NOT_AWAITING_COLLECTION",
                f"Submission is in status {submission['status']}, not eligible for handover.",
            )

    collector_profile = await collectors_repo.find_by_user_id(current_user["user_id"])
    if collector_profile is None:
        raise not_found("COLLECTOR_PROFILE_NOT_FOUND", "No collector profile found for this account.")

    # Assignment/ward check (Section 8.5 of the architecture doc): a hard
    # authorization rejection, not a FLAGGED_FOR_REVIEW case — this collector
    # is simply not allowed to act on a submission outside their ward.
    if collector_profile["ward_id"] != submission["ward_id"]:
        raise forbidden(
            "COLLECTOR_OUTSIDE_ASSIGNED_AREA",
            "This submission is outside your assigned ward.",
        )

    if actual_weight_kg is not None and actual_weight_kg <= 0:
        raise bad_request("INVALID_ACTUAL_WEIGHT", "Actual weight must be greater than zero.")
    if submission["status"] in ("COLLECTOR_ASSIGNED", "COLLECTOR_ACCEPTED", "COLLECTING") and actual_weight_kg is None:
        raise bad_request("ACTUAL_WEIGHT_REQUIRED", "Actual collected weight is required after collector acceptance.")
    if submission.get("assigned_collector_id") not in (None, current_user["user_id"]):
        raise forbidden("COLLECTOR_ASSIGNMENT_MISMATCH", "This submission is assigned to another collector.")

    status = submission["status"]
    if status == "WAITING_FOR_COLLECTION":
        status = transition(status, "COLLECTOR_ASSIGNED")
        status = transition(status, "HANDOVER_PENDING")
    elif status == "COLLECTOR_ASSIGNED":
        status = transition(status, "HANDOVER_PENDING")
    elif status == "COLLECTOR_ACCEPTED":
        status = transition(status, "COLLECTING")
        status = transition(status, "HANDOVER_PENDING")
    elif status == "COLLECTING":
        status = transition(status, "HANDOVER_PENDING")

    now = datetime.now(timezone.utc)
    effective_collector_ts = _naive_utc(collector_ts) if collector_ts else _naive_utc(now)
    home_ts = _naive_utc(submission["home_ts"])

    reasons: list[str] = []
    if not is_valid_coordinate(submission["home_lat"], submission["home_lng"]):
        reasons.append("INVALID_HOME_GPS")
    if not is_valid_coordinate(collector_lat, collector_lng):
        reasons.append("INVALID_COLLECTOR_GPS")

    distance_m: float | None = None
    if not reasons:
        if effective_collector_ts < home_ts:
            reasons.append("TIMESTAMP_BEFORE_SUBMISSION")
        elif (effective_collector_ts - home_ts) > timedelta(hours=settings.max_handover_window_hours):
            reasons.append("TIMESTAMP_WINDOW_EXCEEDED")

        distance_m = haversine_distance_meters(
            submission["home_lat"], submission["home_lng"], collector_lat, collector_lng
        )
        if distance_m > settings.max_handover_distance_meters:
            reasons.append("DISTANCE_EXCEEDED")

    verified = len(reasons) == 0
    if verified:
        status = transition(status, "LOCATION_VERIFIED")
        status = transition(status, "COLLECTED")
    else:
        status = transition(status, "FLAGGED_FOR_REVIEW")

    handover_doc = {
        "submission_id": submission_id,
        "collector_id": current_user["user_id"],
        "rrr_id": collector_profile.get("rrr_id"),
        "photo_file_id": photo_file_id,
        "collector_lat": collector_lat,
        "collector_lng": collector_lng,
        "collector_ts": effective_collector_ts,
        "distance_m": distance_m,
        "verification_result": "VERIFIED" if verified else "FLAGGED",
        "failure_reasons": reasons,
        "actual_weight_kg": actual_weight_kg,
        "created_at": now,
    }
    try:
        await handovers_repo.insert_handover(handover_doc)
    except DuplicateKeyError as exc:
        raise conflict("DUPLICATE_HANDOVER", "A handover has already been recorded for this submission.") from exc

    await submissions_repo.update_collection_data(
        submission_id,
        new_status=status,
        actual_weight_kg=actual_weight_kg,
        collector_lat=collector_lat,
        collector_lng=collector_lng,
        collection_ts=effective_collector_ts,
        collection_photo_file_id=photo_file_id,
        collector_id=current_user["user_id"],
    )
    notification_type = (
        notifications_service.COLLECTION_COMPLETED
        if verified
        else notifications_service.COLLECTION_STATUS_CHANGED
    )
    await notifications_service.create_notification(
        user_id=submission["home_user_id"],
        event_key=f"submission:{submission_id}:handover:{status}",
        notification_type=notification_type,
        title_key="Collection completed" if verified else "Collection status updated",
        message_key=(
            "Your e-waste collection has been completed."
            if verified
            else "Your collection needs review before it can be completed."
        ),
        related_entity_type="e_waste_submission",
        related_entity_id=submission_id,
        metadata={"status": status},
    )
    if verified:
        # Phase 9: the authoritative, immutable reward-eligibility event
        # (architecture Section 6.1/12) — written exactly once, right here,
        # the moment the item first reaches COLLECTED. No later transition
        # (CLASSIFIED, LOT_CREATED, SOLD, COMPLETED, ...) ever touches this
        # field; the set-once precondition in the repo function is what
        # makes that a database-level guarantee, not just a convention.
        await submissions_repo.set_reward_eligible_at_if_unset(submission_id, _naive_utc(now))

    await audit.record(
        actor_id=current_user["user_id"],
        actor_role=current_user["role"],
        action="EWASTE_HANDOVER_RECORDED",
        entity_type="e_waste_submission",
        entity_id=submission_id,
        details={
            "verification_result": handover_doc["verification_result"],
            "status": status,
            "distance_m": distance_m,
            "reasons": reasons,
        },
    )

    response = {
        "submission_id": submission_id,
        "status": status,
        "verification_result": handover_doc["verification_result"],
        "distance_m": distance_m,
        "reasons": reasons,
        "actual_weight_kg": actual_weight_kg,
    }
    await idempotency.store_response(current_user["user_id"], idempotency_key, HANDOVER_IDEMPOTENCY_SCOPE, response)
    return response


async def list_all_submissions_for_admin(status: str | None = None) -> list[dict]:
    """Admin oversight (Phase 7): system-wide, not ward-scoped — the
    caller (router) already gates this to GOVERNMENT_ADMIN."""
    docs = await submissions_repo.list_all(status=status)
    for d in docs:
        d.pop("_id", None)
    return docs


async def list_all_handovers_for_admin(verification_result: str | None = None) -> list[dict]:
    docs = await handovers_repo.list_all(verification_result=verification_result)
    for d in docs:
        d.pop("_id", None)
    return docs
