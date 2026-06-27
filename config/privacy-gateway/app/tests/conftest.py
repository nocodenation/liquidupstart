import pytest

from privacy_gateway.core.detection.detector import Detector
from privacy_gateway.core.detection.language import LanguageRouter
from privacy_gateway.core.detection.presidio import SUPPORTED_LANGUAGES


@pytest.fixture(scope="session")
def detector():
    return Detector()


@pytest.fixture(scope="session")
def router():
    return LanguageRouter(SUPPORTED_LANGUAGES)


class FakeLocalLLMClient:
    def __init__(self, responses):
        self._responses = responses
        self.calls = []

    def chat(self, messages, temperature=0.0, max_tokens=1024):
        self.calls.append(messages)
        r = self._responses
        if callable(r):
            return r(messages)
        if isinstance(r, list):
            return r[min(len(self.calls) - 1, len(r) - 1)]
        return r


@pytest.fixture
def make_app(detector):
    from privacy_gateway.api.app import create_app
    from privacy_gateway.core.gateway import Gateway
    from privacy_gateway.core.vault.store import Vault

    def _make(upstream):
        return create_app(gateway=Gateway(detector, Vault()), upstream=upstream)

    return _make
