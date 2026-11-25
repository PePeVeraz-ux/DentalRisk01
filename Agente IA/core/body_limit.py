import json


class BodyLimitMiddleware:
    """Bound the entire request, including chunked multipart bodies, before parsing."""
    def __init__(self, app, limit=3 * 1024 * 1024):
        self.app = app
        self.limit = limit

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] in {'GET', 'HEAD', 'OPTIONS'}:
            return await self.app(scope, receive, send)
        messages, total = [], 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            total += len(message.get('body', b''))
            if total > self.limit:
                content = json.dumps({'detail': 'Solicitud demasiado grande'}).encode()
                await send({'type':'http.response.start','status':413,
                            'headers':[(b'content-type',b'application/json'),(b'x-content-type-options',b'nosniff')]})
                await send({'type':'http.response.body','body':content})
                return
            messages.append(message)
            if not message.get('more_body', False):
                break
        iterator = iter(messages)
        async def replay():
            try:
                return next(iterator)
            except StopIteration:
                return await receive()
        await self.app(scope, replay, send)
