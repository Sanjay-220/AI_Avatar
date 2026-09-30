"""Reject oversized request bodies before they are buffered and parsed."""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_BODY_BYTES = 64 * 1024


class _TooLarge(Exception):
    pass


async def _reject(send: Send) -> None:
    await send({"type": "http.response.start", "status": 413,
                "headers": [(b"content-type", b"application/json")]})
    await send({"type": "http.response.body", "body": b'{"detail":"Request body too large"}'})


class BodySizeLimit:
    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and int(declared) > self.max_bytes:
            await _reject(send)
            return
        seen = 0

        async def counting_receive() -> Message:
            nonlocal seen
            message = await receive()
            seen += len(message.get("body", b""))
            if seen > self.max_bytes:
                raise _TooLarge
            return message

        try:
            await self.app(scope, counting_receive, send)
        except _TooLarge:
            await _reject(send)
