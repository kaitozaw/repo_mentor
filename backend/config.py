from dotenv import load_dotenv
load_dotenv()

from pathlib import Path
import os

AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-2")
BUCKET_NAME = os.getenv("BUCKET_NAME", "repo-mentor")
LOCAL_AWS = os.getenv("LOCAL_AWS", "").lower() in ("1", "true", "yes", "stub")
LOCAL_S3_ROOT = Path("_local_s3")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")