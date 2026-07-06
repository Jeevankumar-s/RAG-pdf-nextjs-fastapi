import os
from redis import Redis
from dotenv import load_dotenv

load_dotenv()

redis_client = Redis.from_url(
    os.getenv("REDIS_URL"),
    decode_responses=True
)
