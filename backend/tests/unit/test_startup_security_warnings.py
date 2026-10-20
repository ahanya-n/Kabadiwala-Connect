"""Startup warns when optional admin seeding configuration is missing."""
import asyncio
import logging

import pytest

from app.core.config import settings
from app.main import _warn_if_admin_seed_unconfigured
from scripts.seed_admin import main as seed_admin


def test_warns_when_admin_seed_configuration_is_missing(monkeypatch, caplog):
    monkeypatch.setattr(settings, "admin_default_username", None)
    monkeypatch.setattr(settings, "admin_default_password", None)

    with caplog.at_level(logging.WARNING, logger="kabadiwala.startup"):
        _warn_if_admin_seed_unconfigured()

    assert len(caplog.records) == 1
    assert "ADMIN_DEFAULT_USERNAME" in caplog.text
    assert "ADMIN_DEFAULT_PASSWORD" in caplog.text


def test_no_warning_when_admin_seed_configuration_is_present(monkeypatch, caplog):
    monkeypatch.setattr(settings, "admin_default_username", "configured-user")
    monkeypatch.setattr(settings, "admin_default_password", "configured-password")

    with caplog.at_level(logging.WARNING, logger="kabadiwala.startup"):
        _warn_if_admin_seed_unconfigured()

    assert len(caplog.records) == 0


def test_admin_seeding_fails_if_credentials_are_missing(monkeypatch):
    monkeypatch.setattr(settings, "admin_default_username", None)
    monkeypatch.setattr(settings, "admin_default_password", None)

    with pytest.raises(RuntimeError, match="Set ADMIN_DEFAULT_USERNAME and ADMIN_DEFAULT_PASSWORD"):
        asyncio.run(seed_admin())
