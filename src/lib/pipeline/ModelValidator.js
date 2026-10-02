/**
 * ModelValidator — structural & logical integrity checks (sniffer pattern, ADR-041).
 */

export default class ModelValidator {
  validateConfig(config) {
    const issues = [];
    if (!config.meta.target) issues.push("meta missing required key: target");
    if (!["priogrid", "governorate"].includes(config.level)) issues.push(`invalid level: ${config.level}`);

    const p = config.partitions;
    if (p.train_start > p.train_end) issues.push("train_start > train_end");
    if (p.forecast_start <= p.validation_end) issues.push("forecast_start must follow validation_end");
    if (!config.model_name.includes("-")) issues.push(`model_name should follow org-prefix convention, got ${config.model_name}`);

    if (issues.length) throw new Error("Configuration validation failed: " + issues.join("; "));
    return issues;
  }

  validateForecast(projections) {
    const issues = [];
    for (let i = 0; i < projections.length; i++) {
      const v = projections[i].value || 0;
      if (Number.isNaN(v) || !Number.isFinite(v)) issues.push(`projection ${i}: non-finite value ${v}`);
      if (v < 0) issues.push(`projection ${i}: negative value ${v}`);
      if (projections[i].month_id == null) issues.push(`projection ${i}: missing month_id`);
    }
    return [issues.length === 0, issues];
  }

  validateEnsemble(spec) {
    const issues = [];
    if (!spec.members || !spec.members.length) issues.push("ensemble has no members");
    if (spec.weights && spec.weights.length !== spec.members.length) issues.push("weights length != members length");
    return issues;
  }
}