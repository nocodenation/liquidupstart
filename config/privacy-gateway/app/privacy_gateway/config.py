from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PRIVACY_GATEWAY_", frozen=True, extra="ignore"
    )

    upstream: str = "https://api.anthropic.com"
    openai_upstream: str = "https://api.openai.com"
    xai_upstream: str = "https://api.x.ai"
    request_timeout: float = 120.0
    log_level: str = "INFO"

    local_llm_enable: bool = False
    local_llm_api_base: str = Field(default="", validation_alias="LOCAL_LLM_API_BASE")
    local_llm_api_key: str = Field(default="", validation_alias="LOCAL_LLM_API_KEY")
    local_llm_model: str = ""

    gate_mode: str = "log"
    sufficiency_low: float = 0.8
    sufficiency_medium: float = 0.5

    semantic_enable: bool = False
    rewriter_model: str = ""
    judge_model: str = ""
    faithfulness_accept: float = 0.85
    faithfulness_surface: float = 0.70
    semantic_max_rounds: int = 5
