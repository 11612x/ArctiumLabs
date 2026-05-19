#!/usr/bin/env python3
"""Regenerate eca-zones.js from eca-zones-water.geojson."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "eca-zones-water.geojson"
DST = ROOT / "eca-zones.js"


def ring_from_geometry(geom: dict) -> list:
    gtype = geom["type"]
    if gtype == "Polygon":
        return geom["coordinates"][0]
    if gtype == "MultiPolygon":
        return geom["coordinates"][0][0]
    raise ValueError(f"unsupported geometry type: {gtype}")


def main() -> None:
    with SRC.open() as f:
        fc = json.load(f)

    zones = []
    for feat in fc.get("features", []):
        name = (feat.get("properties") or {}).get("name", "Unknown")
        ring = ring_from_geometry(feat["geometry"])
        polygon = [[float(c[0]), float(c[1])] for c in ring]
        zones.append({"name": name, "polygon": polygon})

    DST.write_text("window.ARCTIUM_ECA_ZONES=" + json.dumps(zones, separators=(",", ":")) + ";\n")
    print(f"Wrote {DST} ({len(zones)} zones, {DST.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
