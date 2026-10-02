"""
ForecastingModelManager — thin façade that routes to pipeline stages.

Decomposed from a monolith into a ~delegating façade (ADR-045). Each stage
receives a frozen context object (immutable dataclass) rather than reaching
into the manager's internals, making every stage independently unit-testable.

Stages: TrainingStage → EvaluationStage → ForecastingStage → ReportingStage
"""

from dataclasses import dataclass
from typing import Any, Dict, Optional

from ..config.configuration_manager import MergedConfig
from ..data.model_path_manager import ModelPathManager
from ..stages.training_stage import TrainingStage
from ..stages.evaluation_stage import EvaluationStage
from ..stages.forecasting_stage import ForecastingStage
from ..stages.reporting_stage import ReportingStage
from ..modules.validation.model_validation import ModelValidator


@dataclass(frozen=True)
class StageContext:
    """Immutable context handed to each stage."""
    config: MergedConfig
    data: dict              # partitioned frame from ViewsDataLoader
    paths: Any              # ModelPaths
    run_id: str


class ForecastingModelManager:
    """Thin façade — routes to pipeline stages below."""

    def __init__(self, config: MergedConfig):
        self.config = config
        self.path_manager = ModelPathManager(
            config.model_name,
            config.deployment.get("artifact_root", "artifacts"),
        )
        self.validator = ModelValidator()
        self.training = TrainingStage()
        self.evaluation = EvaluationStage()
        self.forecasting = ForecastingStage()
        self.reporting = ReportingStage()

    def run(self, data: dict, run_id: Optional[str] = None,
            train: bool = True, evaluate: bool = True,
            forecast: bool = True, report: bool = True) -> Dict[str, Any]:
        """Execute the full pipeline (or selected stages)."""
        self.validator.validate_config(self.config)

        rid = run_id or "run_001"
        paths = self.path_manager.resolve(rid)
        ctx = StageContext(config=self.config, data=data, paths=paths, run_id=rid)

        results: Dict[str, Any] = {"run_id": rid, "stages": []}

        if train:
            results["train"] = self.training.execute(ctx)
            results["stages"].append("train")
        if evaluate:
            results["evaluate"] = self.evaluation.execute(ctx, results.get("train"))
            results["stages"].append("evaluate")
        if forecast:
            results["forecast"] = self.forecasting.execute(ctx, results.get("train"))
            results["stages"].append("forecast")
        if report:
            results["report"] = self.reporting.execute(ctx, results)
            results["stages"].append("report")

        return results

    # individual stage access (for independent testing / CLI flags)
    def train_only(self, data: dict, run_id: Optional[str] = None):
        ctx = self._ctx(data, run_id)
        return self.training.execute(ctx)

    def evaluate_only(self, data: dict, train_output, run_id: Optional[str] = None):
        ctx = self._ctx(data, run_id)
        return self.evaluation.execute(ctx, train_output)

    def forecast_only(self, data: dict, train_output, run_id: Optional[str] = None):
        ctx = self._ctx(data, run_id)
        return self.forecasting.execute(ctx, train_output)

    def report_only(self, data: dict, run_results: dict, run_id: Optional[str] = None):
        ctx = self._ctx(data, run_id)
        return self.reporting.execute(ctx, run_results)

    def _ctx(self, data: dict, run_id: Optional[str]) -> StageContext:
        rid = run_id or "run_001"
        return StageContext(config=self.config, data=data,
                            paths=self.path_manager.resolve(rid), run_id=rid)