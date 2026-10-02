"""
Panel builder — converts loader rows into a (month_id, entity_id) MultiIndex
DataFrame suitable for the VIEWS-compatible models.

The models (baselines + stepshifters) all expect a panel DataFrame with a
MultiIndex of (month_id, entity_id) and one column per target. This module
aggregates raw incident rows into that panel.
"""

from typing import List, Optional

import pandas as pd


def rows_to_panel(rows: List[dict], target: str = "detained_count",
                  level: str = "governorate") -> pd.DataFrame:
    """
    Convert loader rows into a panel DataFrame.

    Aggregation per (month_id, entity_id):
      - 'incidents'       → count of rows
      - 'detained_count'   → sum of detained_count

    Returns a DataFrame indexed by (month_id, entity_id) with both columns.
    """
    if not rows:
        return pd.DataFrame(columns=["incidents", "detained_count"]).set_index(
            pd.MultiIndex.from_arrays([[], []], names=["month_id", "entity_id"]))

    df = pd.DataFrame(rows)
    if "month_id" not in df.columns or "entity_id" not in df.columns:
        raise ValueError("rows must contain month_id and entity_id")

    agg = df.groupby(["month_id", "entity_id"]).agg(
        incidents=("incident_id", "count") if "incident_id" in df.columns else ("month_id", "size"),
        detained_count=("detained_count", "sum") if "detained_count" in df.columns else ("month_id", "size"),
    )
    agg = agg.sort_index()
    # ensure target column exists
    if target not in agg.columns:
        if target == "detained_count":
            agg["detained_count"] = agg.get("detained_count", 0)
        elif target == "incidents":
            agg["incidents"] = agg.get("incidents", 0)
    return agg


def panel_for_target(panel: pd.DataFrame, target: str) -> pd.DataFrame:
    """Return a single-column panel for the requested target."""
    if target not in panel.columns:
        raise ValueError(f"target '{target}' not in panel columns {list(panel.columns)}")
    return panel[[target]].copy()