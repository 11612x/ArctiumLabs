#!/usr/bin/env python3
"""Static file server for Arctium Labs with /api/sofr (FRED SOFR proxy)."""

from __future__ import annotations

import http.server
import json
import socketserver
import urllib.error
import urllib.request
from pathlib import Path

PORT = 8080
ROOT = Path(__file__).resolve().parent
FRED_SOFR_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=SOFR"
BLANK_VALUES = frozenset({"", ".", "NA", "N/A", "null", "NULL"})


def parse_last_sofr_rate(csv_text: str) -> float | None:
    lines = [ln.strip() for ln in (csv_text or "").strip().splitlines() if ln.strip()]
    data_lines = [ln for ln in lines if not ln.upper().startswith("DATE")]

    for line in reversed(data_lines):
        comma = line.rfind(",")
        if comma < 0:
            continue
        raw = line[comma + 1 :].strip().strip('"')
        if raw in BLANK_VALUES:
            continue
        try:
            value = float(raw)
        except ValueError:
            continue
        if value == value:  # not NaN
            return value
    return None


def fetch_sofr_rate() -> float:
    req = urllib.request.Request(
        FRED_SOFR_URL,
        headers={"User-Agent": "ArctiumLabs/1.0 (+https://arctiumlabs.com)"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    rate = parse_last_sofr_rate(text)
    if rate is None:
        raise ValueError("No valid SOFR value in FRED CSV")
    return rate


class ArctiumRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        path = self.path.split("?", 1)[0].lower()
        if path.endswith(".html"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/api/sofr":
            self.handle_api_sofr()
            return
        super().do_GET()

    def handle_api_sofr(self) -> None:
        try:
            rate = fetch_sofr_rate()
            body = json.dumps({"rate": round(rate, 2)}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "public, max-age=3600")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError, TimeoutError) as err:
            payload = json.dumps({"error": str(err)}).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    def log_message(self, format: str, *args) -> None:
        if str(args[0]).startswith("GET /api/sofr"):
            return super().log_message(format, *args)
        super().log_message(format, *args)


def main() -> None:
    socketserver.TCPServer.allow_reuse_address = True
    try:
        httpd = socketserver.TCPServer(("", PORT), ArctiumRequestHandler)
    except OSError as err:
        if err.errno == 48:  # Address already in use (macOS)
            print(f"Port {PORT} is already in use. Stop the other server, e.g.:")
            print(f"  lsof -nP -iTCP:{PORT} -sTCP:LISTEN")
            print("  kill <PID>")
            raise SystemExit(1) from err
        raise
    with httpd:
        print(f"Serving {ROOT}")
        print(f"Open: http://127.0.0.1:{PORT}/")
        print("API:  http://127.0.0.1:{}/api/sofr".format(PORT))
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
