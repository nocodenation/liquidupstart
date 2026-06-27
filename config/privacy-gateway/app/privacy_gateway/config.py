from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PRIVACY_GATEWAY_", frozen=True, extra="ignore"
    )

    upstream: str = "https://api.anthropic.com"
    request_timeout: float = 120.0
    log_level: str = "INFO"

    local_llm_enable: bool = False
    local_llm_api_base: str = Field(default="", validation_alias="LOCAL_LLM_API_BASE")
    local_llm_api_key: str = Field(default="", validation_alias="LOCAL_LLM_API_KEY")
    local_llm_model: str = ""
