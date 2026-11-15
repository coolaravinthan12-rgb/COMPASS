"""Local folder storage (DEPLOY.md section 3). On Render's free tier anything written here lasts until the next restart."""
import os
from pathlib import Path

def _find_data_dir() -> Path:
    """DATA_DIR if set; otherwise the first folder that holds the demo data: next to main.py (Docker: /app/data),
    or one level up (running from the project folder: Compass/data), or the Docker default."""
    if os.getenv("DATA_DIR"):
        return Path(os.environ["DATA_DIR"])
    here = Path(__file__).resolve().parent
    for cand in (here / "data", here.parent / "data"):
        if (cand / "demo" / "grid.json").exists():
            return cand
    return Path("/app/data")


DATA_DIR = _find_data_dir()
MODELS_PREFIX = os.getenv("MODEL_VERSION_PREFIX", "models/")


def save_bytes(path: str, data: bytes) -> None:
    p = DATA_DIR / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)


def load_bytes(path: str) -> bytes | None:
    p = DATA_DIR / path
    return p.read_bytes() if p.exists() else None


def list_paths(prefix: str) -> list[str]:
    base = DATA_DIR / prefix
    return [str(p.relative_to(DATA_DIR)) for p in base.rglob("*") if p.is_file()] if base.exists() else []
