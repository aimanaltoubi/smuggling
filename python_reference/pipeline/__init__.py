"""
Oman Border Forecasting — MLOps Pipeline (ViEWS-inspired).

A portable, air-gapped-ready pipeline that transforms raw geo-temporal
incident data into validated, reconciled, and documented forecasts.

Architecture mirrors views-pipeline-core: a thin ForecastingModelManager
façade delegates to independently testable stage classes, each receiving a
frozen context object. See ADR-045 for the decomposition rationale.

Stages:  Data Fetch → Train → Evaluate → Forecast → Reconcile → Report
"""

from .config.configuration_manager import ConfigurationManager
from .data.views_data_loader import ViewsDataLoader
from .data.model_path_manager import ModelPathManager
from .managers.forecasting_model_manager import ForecastingModelManager
from .managers.ensemble_manager import EnsembleManager
from .stages.training_stage import TrainingStage
from .stages.evaluation_stage import EvaluationStage
from .stages.forecasting_stage import ForecastingStage
from .stages.reporting_stage import ReportingStage
from .modules.reconciliation.reconciliation_module import ReconciliationModule
from .modules.validation.model_validation import ModelValidator
from .cli.args import ForecastingModelArgs

__all__ = [
    "ConfigurationManager",
    "ViewsDataLoader",
    "ModelPathManager",
    "ForecastingModelManager",
    "EnsembleManager",
    "TrainingStage",
    "EvaluationStage",
    "ForecastingStage",
    "ReportingStage",
    "ReconciliationModule",
    "ModelValidator",
    "ForecastingModelArgs",
]