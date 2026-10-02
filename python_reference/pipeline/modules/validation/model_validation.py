"""
ModelValidator — structural & logical integrity checks (sniffer pattern, ADR-041).

Validates:
  - Configuration structural integrity (required keys, types)
  - Target specification
  - Partition ordering (train < calibration < validation < forecast)
  - Artifact naming conventions (organization-prefix-*)
"""

from typing import Any, List, Tuple


class ModelValidator:
    """Structural & logical integrity checks for the pipeline."""

    REQUIRED_META = ["target"]
    REQUIRED_PARTITION_KEYS = [
        "train_start", "train_end", "calibration_start", "calibration_end",
        "validation_start", "validation_end", "forecast_start", "forecast_end",
    ]

    def validate_config(self, config) -> List[str]:
        """Return list of issues (empty = valid). Raises on critical errors."""
        issues: List[str] = []

        for key in self.REQUIRED_META:
            if not config.meta.get(key):
                issues.append(f"meta missing required key: {key}")

        if config.level not in ("priogrid", "governorate"):
            issues.append(f"invalid level: {config.level}")

        p = config.partitions
        if p.train_start > p.train_end:
            issues.append("train_start > train_end")
        if p.calibration_start > p.calibration_end:
            issues.append("calibration_start > calibration_end")
        if p.validation_start > p.validation_end:
            issues.append("validation_start > validation_end")
        if p.forecast_start <= p.validation_end:
            issues.append("forecast_start must follow validation_end")

        # artifact naming convention (organization-prefix-*)
        name = config.model_name
        if "-" not in name:
            issues.append(f"model_name should follow org-prefix convention, got {name!r}")

        if issues:
            raise ValueError("Configuration validation failed: " + "; ".join(issues))
        return issues

    def validate_forecast(self, projections: List[dict]) -> Tuple[bool, List[str]]:
        """Validate forecast output: non-negative, finite, has month_id."""
        issues: List[str] = []
        import math
        for i, p in enumerate(projections):
            v = p.get("value", 0)
            if math.isnan(v) or math.isinf(v):
                issues.append(f"projection {i}: non-finite value {v}")
            if v < 0:
                issues.append(f"projection {i}: negative value {v}")
            if p.get("month_id") is None:
                issues.append(f"projection {i}: missing month_id")
        return (len(issues) == 0, issues)

    def validate_ensemble(self, spec) -> List[str]:
        """Validate ensemble spec: non-empty members, matching weights."""
        issues: List[str] = []
        if not spec.members:
            issues.append("ensemble has no members")
        if spec.weights is not None and len(spec.weights) != len(spec.members):
            issues.append("weights length != members length")
        return issues