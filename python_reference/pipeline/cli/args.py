"""
ForecastingModelArgs — dataclass-driven CLI argument system.

Flags: --train, --evaluate, --forecast, --report, --sweep, --prediction_store, --monthly
Validation prevents illegal combinations (e.g., evaluate with forecasting run type).
Monthly shortcut auto-configures production cycle.
"""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class ForecastingModelArgs:
    run_type: str = "calibration"     # calibration | forecasting
    train: bool = False
    evaluate: bool = False
    forecast: bool = False
    report: bool = False
    sweep: bool = False
    prediction_store: bool = False
    monthly: bool = False
    ensemble: Optional[str] = None
    saved: bool = False
    model_name: str = "RandomForestStepshifter"
    target: str = "detained_count"
    level: str = "governorate"
    horizon_months: int = 36
    horizon_days: int = 14

    def validate(self) -> List[str]:
        """Validate prevents illegal flag combinations."""
        issues: List[str] = []
        if self.run_type not in ("calibration", "forecasting"):
            issues.append(f"invalid run_type: {self.run_type}")

        # evaluate with forecasting run type is illegal
        if self.evaluate and self.run_type == "forecasting":
            issues.append("evaluate cannot run with forecasting run_type")

        if self.run_type == "calibration" and not (self.train or self.evaluate):
            issues.append("calibration run requires --train or --evaluate")

        if self.run_type == "forecasting" and not self.forecast:
            issues.append("forecasting run requires --forecast")

        if self.level not in ("priogrid", "governorate"):
            issues.append(f"invalid level: {self.level}")

        return issues

    def apply_monthly_shortcut(self) -> "ForecastingModelArgs":
        """Monthly shortcut auto-configures production cycle."""
        if self.monthly:
            self.run_type = "forecasting"
            self.forecast = True
            self.report = True
            self.prediction_store = True
        return self

    @classmethod
    def from_argv(cls, argv: List[str]) -> "ForecastingModelArgs":
        """Parse argv into ForecastingModelArgs (minimal CLI parser)."""
        args = cls()
        i = 0
        while i < len(argv):
            a = argv[i]
            if a == "--train": args.train = True
            elif a == "--evaluate": args.evaluate = True
            elif a == "--forecast": args.forecast = True
            elif a == "--report": args.report = True
            elif a == "--sweep": args.sweep = True
            elif a == "--prediction_store": args.prediction_store = True
            elif a == "--monthly": args.apply_monthly_shortcut()
            elif a == "--saved": args.saved = True
            elif a == "--ensemble": args.ensemble = argv[i + 1]; i += 1
            elif a == "--run_type": args.run_type = argv[i + 1]; i += 1
            elif a == "--model": args.model_name = argv[i + 1]; i += 1
            elif a == "--target": args.target = argv[i + 1]; i += 1
            elif a == "--level": args.level = argv[i + 1]; i += 1
            elif a == "--horizon_months": args.horizon_months = int(argv[i + 1]); i += 1
            elif a == "--horizon_days": args.horizon_days = int(argv[i + 1]); i += 1
            i += 1
        issues = args.validate()
        if issues:
            raise ValueError("CLI validation failed: " + "; ".join(issues))
        return args