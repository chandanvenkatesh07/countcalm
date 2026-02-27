from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Portfolio Tracker MVP"
    database_url: str = "postgresql+psycopg2://portfolio:portfolio@db:5432/portfolio"
    cors_origins: str = "http://localhost:3000"


settings = Settings()
