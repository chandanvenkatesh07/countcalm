from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Trading Intelligence"
    database_url: str = "postgresql+psycopg2://trading:trading@db:5432/trading_intel"


settings = Settings()
