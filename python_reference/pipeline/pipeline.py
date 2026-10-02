"""
Pipeline entry point — wires ConfigurationManager → ViewsDataLoader →
ForecastingModelManager (thin façade) → stages → reconciliation → reporting.

Usage:
  python -m pipeline.pipeline --train --evaluate --forecast --report
  python -m pipeline.pipeline --monthly
  python -m pipeline.pipeline --ensemble hybrid_lynx --forecast --report
"""

import sys
from typing import Any, Dict, List, Optional

from .config.configuration_manager import ConfigurationManager
from .data.views_data_loader import ViewsDataLoader, to_month_id
from .managers.forecasting_model_manager import ForecastingModelManager
from .managers.ensemble_manager import EnsembleManager, EnsembleSpec
from .modules.logging.logging_config import configure_logging


def default_partitions(records: List[dict]) -> dict:
    """Auto-derive partitions from the data's date range."""
    if not records:
        raise ValueError("no records to derive partitions from")
    dates = [r["incident_date"] for r in records if r.get("incident_date")]
    mids = sorted(to_month_id(d) for d in dates)
    first, last = mids[0], mids[-1]
    span = last - first
    cal_start = first + int(span * 0.6)
    val_start = first + int(span * 0.8)
    return {
        "train_start": first, "train_end": cal_start - 1,
        "calibration_start": cal_start, "calibration_end": val_start - 1,
        "validation_start": val_start, "validation_end": last,
        "forecast_start": last + 1, "forecast_end": last + 48,
    }


def run_pipeline(records: List[dict],
                  model_name: str = "oman_border_default",
                  target: str = "detained_count",
                  level: str = "governorate",
                  horizon_months: int = 48,
                  train: bool = True, evaluate: bool = True,
                  forecast: bool = True, report: bool = True,
                  reference: Optional[List[dict]] = None) -> Dict[str, Any]:
    """Run the full MLOps pipeline on incident records."""
    logger = configure_logging(model_name=model_name)
    logger.info(f"Starting pipeline: model={model_name} target={target} level={level}")

    partitions = default_partitions(records)
    logger.info(f"Partitions derived: {partitions}")

    config = ConfigurationManager(
        meta={"model_name": model_name, "target": target, "level": level},
        partitions=partitions,
    ).with_hyperparameters({
        "forecasting": {"horizon_months": horizon_months},
    }).build()

    loader = ViewsDataLoader()
    data = loader.load(records, config.partitions, level=level, reference=reference)
    logger.info(f"Loaded {data['n_records']} records, drift={data['drift'].has_drift}")

    manager = ForecastingModelManager(config)
    results = manager.run(data, train=train, evaluate=evaluate,
                           forecast=forecast, report=report)
    logger.info(f"Pipeline complete: stages={results['stages']}")
    return results


def run_ensemble(records: List[dict], spec: EnsembleSpec,
                 target: str = "detained_count", level: str = "governorate") -> Dict[str, Any]:
    """Run an ensemble of member models and aggregate + reconcile."""
    logger = configure_logging(model_name=f"ensemble_{spec.name}")
    logger.info(f"Starting ensemble: {spec.name} members={spec.members}")

    member_forecasts = []
    for member in spec.members:
        result = run_pipeline(records, model_name=member, target=target,
                              level=level, train=True, evaluate=False,
                              forecast=True, report=False)
        member_forecasts.append(result["forecast"].__dict__
                                if hasattr(result["forecast"], "__dict__")
                                else {"projections": result["forecast"].projections})

    ensemble_mgr = EnsembleManager(spec)
    aggregated = ensemble_mgr.aggregate(member_forecasts)
    logger.info(f"Ensemble aggregated: {len(aggregated.get('projections', []))} projections")
    return aggregated


def main(argv: Optional[List[str]] = None):
    from .cli.args import ForecastingModelArgs
    args = ForecastingModelArgs.from_argv(argv or sys.argv[1:])

    # load records from local JSON (air-gapped)
    import json, os
    data_path = os.environ.get("INCIDENTS_PATH", "incidents.json")
    if not os.path.exists(data_path):
        print(f"[pipeline] no data file at {data_path} — set INCIDENTS_PATH")
        return 1
    with open(data_path, "r", encoding="utf-8") as f:
        records = json.load(f)

    if args.ensemble:
        spec = EnsembleSpec(name=args.ensemble,
                            members=[args.model_name, f"{args.model_name}_alt"],
                            reconcile=True)
        result = run_ensemble(records, spec, target=args.target, level=args.level)
        print(f"[pipeline] ensemble result: {len(result.get('projections', []))} projections")
    else:
        result = run_pipeline(records, model_name=args.model_name, target=args.target,
                               level=args.level, horizon_months=args.horizon_months,
                               train=args.train, evaluate=args.evaluate,
                               forecast=args.forecast, report=args.report)
        print(f"[pipeline] done: stages={result['stages']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())