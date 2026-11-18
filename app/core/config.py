from pydantic_settings import BaseSettings, SettingsConfigDict

from urllib.parse import quote


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET_KEY: str
    GROQ_API_KEY: str

    # Cloudinary configuration
    CLOUDINARY_CLOUD_NAME: str
    CLOUDINARY_API_KEY: str
    CLOUDINARY_API_SECRET: str

    # Redis configuration
    REDIS_HOST: str
    REDIS_PORT: int
    REDIS_USERNAME: str
    REDIS_PASSWORD: str

    # CORS configuration
    CORS_ORIGINS: str

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()

REDIS_URL = (
    f"redis://{quote(settings.REDIS_USERNAME, safe='')}:"
    f"{quote(settings.REDIS_PASSWORD, safe='')}@"
    f"{settings.REDIS_HOST}:{settings.REDIS_PORT}/0"
)