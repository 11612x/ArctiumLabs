"""Emit shell_precargo_matrix.js from shell_precargo_matrix.json for offline file:// use."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "shell_precargo_matrix.json"
JS_PATH = ROOT / "shell_precargo_matrix.js"


def main() -> None:
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    JS_PATH.write_text(
        "/* Auto-generated from shell_precargo_matrix.json — enables offline file:// use */\n"
        "window.SHELL_PRECARGO_MATRIX = "
        + json.dumps(data, ensure_ascii=False)
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {JS_PATH.name} ({JS_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
