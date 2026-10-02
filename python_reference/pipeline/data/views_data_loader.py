"""
ViewsDataLoader — queryset-driven data fetch with drift detection and partition slicing.

Queryset: defines feature/target extraction logic for the Incident entity.
Raw fetch: retrieves incident records (from local JSON or the platform SDK).
Drift check: compares the current fetch distribution against a reference snapshot.
Partition slice: splits the MultiIndex (month_id, entity_id) frame by month ranges.

month_id follows the ViEWS convention: months since Jan 1960.
  month_id = (year - 1960) * 12 + month
"""

import json
import os
from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

try:
    import pandas as pd
except ImportError:
    pd = None  # graceful: works without pandas using plain dicts


def to_month_id(d) -> int:
    """Convert a date/datetime/string to a ViEWS month_id."""
    if isinstance(d, str):
        parts = d.split("-")
        y, m = int(parts[0]), int(parts[1])
    elif isinstance(d, (date,)):
        y, m = d.year, d.month
    else:
        raise TypeError(f"Cannot convert {type(d)} to month_id")
    return (y - 1960) * 12 + m


def month_id_to_date(mid: int) -> date:
    y = 1960 + (mid - 1) // 12
    m = ((mid - 1) % 12) + 1
    return date(y, m, 1)


@dataclass(frozen=True)
class DriftReport:
    has_drift: bool
    details: Dict[str, Any]


class ViewsDataLoader:
    """Queryset → Raw Fetch → Drift Check → Partition slice."""

    def __init__(self, queryset: Optional[dict] = None):
        # queryset defines filters + transformation chains
        self.queryset = queryset or {"entity": "Incident", "filters": {}}

    # --- raw fetch ---
    def fetch_raw(self, records: List[dict]) -> List[dict]:
        """Accept pre-loaded incident records (from SDK or local JSON)."""
        return [r for r in records if self._matches_queryset(r)]

    def fetch_from_file(self, path: str) -> List[dict]:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Queryset data file not found: {path}")
        with open(path, "r", encoding="utf-8") as f:
            return self.fetch_raw(json.load(f))

    def _matches_queryset(self, record: dict) -> bool:
        filters = self.queryset.get("filters", {})
        for key, expected in filters.items():
            if record.get(key) != expected:
                return False
        return True

    # --- normalize to (month_id, entity_id) frame ---
    def to_frame(self, records: List[dict], level: str = "governorate") -> List[dict]:
        """Build rows indexed by (month_id, entity_id)."""
        rows = []
        for r in records:
            mid = to_month_id(r["incident_date"])
            entity_id = r.get("governorate", "unknown") if level == "governorate" else self._prioid(r)
            rows.append({
                "month_id": mid,
                "entity_id": entity_id,
                "incident_type": r.get("incident_type"),
                "detained_count": r.get("detained_count", 0),
                "latitude": r.get("latitude"),
                "longitude": r.get("longitude"),
                "raw": r,
            })
        return rows

    @staticmethod
    def _prioid(r: dict) -> str:
        lat, lng = r.get("latitude"), r.get("longitude")
        if lat is None or lng is None:
            return "unknown"
        col = int((lng + 180) / 0.5) + 1
        row = int((lat + 90) / 0.5) + 1
        return f"pg{(row - 1) * 720 + col}"

    # --- drift detection ---
    def check_drift(self, current: List[dict], reference: Optional[List[dict]] = None) -> DriftReport:
        """
        Compare current fetch against a reference snapshot.
        Detects: record-count shift, date-range shift, type-distribution shift.
        """
        if reference is None or not reference:
            return DriftReport(has_drift=False, details={"note": "no reference snapshot"})

        cur_count = len(current)
        ref_count = len(reference)
        count_ratio = cur_count / ref_count if ref_count else 0

        def type_dist(records):
            d = {}
            for r in records:
                t = r.get("incident_type", "unknown")
                d[t] = d.get(t, 0) + 1
            return d

        cur_types = type_dist(current)
        ref_types = type_dist(reference)
        all_types = set(cur_types) | set(ref_types)
        type_drift = 0.0
        for t in all_types:
            cp = cur_types.get(t, 0) / max(1, cur_count)
            rp = ref_types.get(t, 0) / max(1, ref_count)
            type_drift += abs(cp - rp)
        type_drift /= max(1, len(all_types))

        has_drift = (abs(count_ratio - 1.0) > 0.3) or (type_drift > 0.15)
        return DriftReport(has_drift=has_drift, details={
            "count_ratio": round(count_ratio, 3),
            "type_drift": round(type_drift, 3),
            "current_type_dist": cur_types,
            "reference_type_dist": ref_types,
        })

    # --- partition slice ---
    def partition(self, rows: List[dict], partitions) -> Dict[str, List[dict]]:
        """Slice rows by partition month ranges."""
        return {
            "train": [r for r in rows if partitions.train_start <= r["month_id"] <= partitions.train_end],
            "calibration": [r for r in rows if partitions.calibration_start <= r["month_id"] <= partitions.calibration_end],
            "validation": [r for r in rows if partitions.validation_start <= r["month_id"] <= partitions.validation_end],
            "forecast": [r for r in rows if r["month_id"] >= partitions.forecast_start],
        }

    def load(self, records: List[dict], partitions, level: str = "governorate",
             reference: Optional[List[dict]] = None) -> dict:
        """Full pipeline: fetch → drift → frame → partition."""
        raw = self.fetch_raw(records)
        drift = self.check_drift(raw, reference)
        frame = self.to_frame(raw, level)
        slices = self.partition(frame, partitions)
        return {
            "raw": raw,
            "frame": frame,
            "partitions": slices,
            "drift": drift,
            "n_records": len(raw),
        }