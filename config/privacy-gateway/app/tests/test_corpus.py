import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

CORPUS = Path(__file__).resolve().parent.parent / "corpus"
DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def load_cases():
    cases = []
    for labels_path in sorted(CORPUS.glob("*/*.labels.json")):
        base = labels_path.name[: -len(".labels.json")]
        request_path = labels_path.parent / f"{base}.request.json"
        cases.append(
            (
                f"{labels_path.parent.name}/{base}",
                json.loads(request_path.read_text(encoding="utf-8")),
                json.loads(labels_path.read_text(encoding="utf-8")),
            )
        )
    return cases


CASES = load_cases()


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class EchoUpstream:
    def __init__(self):
        self.received = None
        self.sent = None

    async def forward(self, path, query, headers, json_body):
        self.received = json_body
        blob = json.dumps(json_body.get("messages", []), ensure_ascii=False)
        blob += json.dumps(json_body.get("system", ""), ensure_ascii=False)
        m = DATE_RE.search(blob)
        ref_number = int(m.group().replace("-", "")) if m else 0
        surrogate_date = m.group() if m else ""
        self.sent = {
            "id": "m",
            "type": "message",
            "role": "assistant",
            "content": [
                {"type": "text", "text": blob},
                {
                    "type": "tool_use",
                    "id": "tu",
                    "name": "record",
                    "input": {
                        "echo": blob,
                        "ref_number": ref_number,
                        "surrogate_date": surrogate_date,
                    },
                },
            ],
        }
        return FakeResponse(200, self.sent)


@pytest.mark.parametrize("case", CASES, ids=[c[0] for c in CASES])
def test_zero_false_restore_and_egress(case, make_app):
    cid, request, labels = case
    up = EchoUpstream()
    client = TestClient(make_app(up))
    r = client.post("/anthropic/v1/messages", json=request)
    assert r.status_code == 200, cid

    anon = json.dumps(up.received, ensure_ascii=False)
    for original in labels["restorable"] + labels["non_restorable"]:
        assert original not in anon, f"{cid}: leaked to upstream: {original!r}"

    deanon = r.json()
    dumped = json.dumps(deanon, ensure_ascii=False)
    for original in labels["non_restorable"]:
        assert original not in dumped, f"{cid}: FALSE RESTORE of non-restorable {original!r}"

    sent_input = up.sent["content"][1]["input"]
    deanon_input = deanon["content"][1]["input"]
    assert deanon_input["ref_number"] == sent_input["ref_number"], f"{cid}: number mutated"
    if sent_input["surrogate_date"]:
        assert (
            deanon_input["surrogate_date"] == sent_input["surrogate_date"]
        ), f"{cid}: non-restorable surrogate date was restored"


def test_correct_restore_rate_and_regeneration(make_app):
    up = EchoUpstream()
    app = make_app(up)
    client = TestClient(app)
    restored = 0
    total = 0
    for cid, request, labels in CASES:
        r = client.post("/anthropic/v1/messages", json=request)
        dumped = json.dumps(r.json(), ensure_ascii=False)
        for original in labels["restorable"]:
            total += 1
            if original in dumped:
                restored += 1

    rate = restored / total
    metrics = app.state.gateway.metrics()
    regen_rate = metrics.regenerations / max(metrics.minted, 1)
    print(
        f"\ncorrect-restore rate: {rate:.3f} ({restored}/{total}) | "
        f"minted={metrics.minted} reused={metrics.reused} "
        f"regenerations={metrics.regenerations} regen_rate={regen_rate:.3f}"
    )
    assert rate >= 0.95, f"correct-restore rate {rate:.3f} below floor 0.95"
    assert regen_rate <= 1.0, f"regeneration rate {regen_rate:.3f} above ceiling 1.0"
