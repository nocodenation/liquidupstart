class GatewayError(Exception):
    pass


class FailClosed(GatewayError):
    pass


class LLMUnavailable(GatewayError):
    pass
