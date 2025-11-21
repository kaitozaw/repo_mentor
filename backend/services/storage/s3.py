from backend.config import AWS_REGION, BUCKET_NAME, LOCAL_AWS, LOCAL_S3_ROOT
from pathlib import Path
from typing import Any, Dict, Optional, Set
import boto3, json

_s3 = boto3.client("s3", region_name=AWS_REGION)

def list_json_stems(prefix: str) -> Set[str]:
    if LOCAL_AWS:
        base: Path = LOCAL_S3_ROOT / prefix
        if not base.exists():
            return set()
        return {p.stem for p in base.glob("*.json")}

    commit_ids: Set[str] = set()
    continuation_token: Optional[str] = None

    while True:
        params: Dict[str, Any] = {
            "Bucket": BUCKET_NAME,
            "Prefix": prefix,
        }
        if continuation_token:
            params["ContinuationToken"] = continuation_token

        res = _s3.list_objects_v2(**params)
        for obj in res.get("Contents", []):
            key = obj["Key"]
            if not key.endswith(".json"):
                continue
            commit_ids.add(Path(key).stem)

        if not res.get("IsTruncated"):
            break
        continuation_token = res.get("NextContinuationToken")

    return commit_ids

def read_json(key: str) -> Optional[Dict[str, Any]]:
    if LOCAL_AWS:
        path = LOCAL_S3_ROOT / key
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    
    try:
        obj = _s3.get_object(Bucket=BUCKET_NAME, Key=key)
        return json.loads(obj["Body"].read().decode("utf-8"))
    except _s3.exceptions.NoSuchKey:
        return None

def read_text(key: str) -> Optional[str]:
    if LOCAL_AWS:
        path = LOCAL_S3_ROOT / key
        if not path.exists():
            return None
        return path.read_text(encoding="utf-8")

    try:
        obj = _s3.get_object(Bucket=BUCKET_NAME, Key=key)
        return obj["Body"].read().decode("utf-8")
    except _s3.exceptions.NoSuchKey:
        return None

def write_bytes(key: str, data: bytes) -> None:
    if LOCAL_AWS:
        path = LOCAL_S3_ROOT / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    else:
        _s3.put_object(
            Bucket=BUCKET_NAME,
            Key=key,
            Body=data,
            ContentType="application/octet-stream",
        )

def write_json(key: str, data: Dict[str, Any]) -> None:
    if LOCAL_AWS:
        path = LOCAL_S3_ROOT / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    else:
        _s3.put_object(
            Bucket=BUCKET_NAME,
            Key=key,
            Body=json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
        )

def write_text(key: str, data: str) -> None:
    if LOCAL_AWS:
        path = LOCAL_S3_ROOT / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data, encoding="utf-8")
    else:
        _s3.put_object(
            Bucket=BUCKET_NAME,
            Key=key,
            Body=data.encode("utf-8"),
            ContentType="text/plain; charset=utf-8",
        )