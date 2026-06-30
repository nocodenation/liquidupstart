from __future__ import annotations

from dataclasses import dataclass

FRAME_SEP = b"\n\n"


@dataclass
class SSEFrame:
    raw: bytes
    event: str | None
    data: str | None

    @classmethod
    def parse(cls, raw: bytes) -> "SSEFrame":
        event: str | None = None
        data_lines: list[str] = []
        for line in raw.split(b"\n"):
            if line.startswith(b"event:"):
                event = line[6:].strip().decode("utf-8", "replace")
            elif line.startswith(b"data:"):
                data_lines.append(line[5:].lstrip(b" ").decode("utf-8", "replace"))
        data = "\n".join(data_lines) if data_lines else None
        return cls(raw=raw, event=event, data=data)


class SSEFramer:
    def __init__(self) -> None:
        self._buf = b""

    def feed(self, chunk: bytes) -> list[SSEFrame]:
        self._buf += chunk
        frames: list[SSEFrame] = []
        while True:
            idx = self._buf.find(FRAME_SEP)
            if idx == -1:
                break
            cut = idx + len(FRAME_SEP)
            frames.append(SSEFrame.parse(self._buf[:cut]))
            self._buf = self._buf[cut:]
        return frames

    def flush(self) -> list[SSEFrame]:
        if not self._buf:
            return []
        raw, self._buf = self._buf, b""
        return [SSEFrame.parse(raw)]


def serialize_frame(event: str | None, data: str) -> bytes:
    parts = []
    if event is not None:
        parts.append(f"event: {event}")
    parts.append(f"data: {data}")
    return ("\n".join(parts) + "\n\n").encode("utf-8")
