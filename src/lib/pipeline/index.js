/**
 * Oman Border Forecasting — MLOps Pipeline (ViEWS-inspired) — JS mirror.
 *
 * Portable TypeScript implementation that mirrors python_reference/pipeline/.
 * A thin ForecastingModelManager façade delegates to independently testable
 * stage classes, each receiving a frozen context object.
 *
 * Stages:  Data Fetch → Train → Evaluate → Forecast → Reconcile → Report
 */

export { default as ConfigurationManager } from "./ConfigurationManager";
export { default as ViewsDataLoader, toMonthId, monthIdToDate } from "./ViewsDataLoader";
export { default as ModelPathManager } from "./ModelPathManager";
export { default as ForecastingModelManager } from "./ForecastingModelManager";
export { default as EnsembleManager, EnsembleSpec } from "./EnsembleManager";
export { default as TrainingStage } from "./TrainingStage";
export { default as EvaluationStage } from "./EvaluationStage";
export { default as ForecastingStage } from "./ForecastingStage";
export { default as ReportingStage } from "./ReportingStage";
export { default as ReconciliationModule } from "./ReconciliationModule";
export { default as ModelValidator } from "./ModelValidator";
export { default as ForecastingModelArgs } from "./ForecastingModelArgs";
export { runPipeline, runEnsemble, defaultPartitions } from "./pipeline";
export { MODEL_REGISTRY, ENSEMBLES, listModels, availableModels, modelFamilies, getModel } from "./ModelCatalog";
export { rowsToPanel, panelByEntity, panelEntities, panelMonths } from "./PanelBuilder";
export { ZeroModel, LocfModel, AverageModel, ConflictologyModel, MixtureBaseline, frameToProjections } from "./Baselines";
export { pipelineStrategicForecast, pipelineTacticalPrediction } from "./PipelineBridge";