"""Settings, read from AVATAR_* environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AVATAR_", env_file=".env")

    kokoro_model: Path = ROOT / "models" / "kokoro-v1.0.onnx"
    kokoro_voices: Path = ROOT / "models" / "voices-v1.0.bin"
    default_voice: str = "af_heart"
    rhubarb_binary: Path = ROOT / "bin" / "Rhubarb-Lip-Sync-1.14.0-macOS" / "rhubarb"
    rhubarb_recognizer: str = "phonetic"
    rhubarb_timeout_s: float = 20.0
    cache_dir: Path = ROOT / ".cache" / "speech"
    web_dir: Path = ROOT / "web"
    max_text_chars: int = 2000
    max_concurrent_jobs: int = 2
    rate_limit_per_minute: int = 30
    cors_origins: list[str] = []


def get_settings() -> Settings:
    return Settings()
