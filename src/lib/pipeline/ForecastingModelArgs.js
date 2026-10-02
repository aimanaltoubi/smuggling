/**
 * ForecastingModelArgs — dataclass-driven CLI argument system.
 * Flags: --train, --evaluate, --forecast, --report, --sweep, --prediction_store, --monthly
 * Validation prevents illegal combinations (e.g., evaluate with forecasting run type).
 */

export default class ForecastingModelArgs {
  constructor(opts = {}) {
    this.run_type = opts.run_type || "calibration";
    this.train = opts.train || false;
    this.evaluate = opts.evaluate || false;
    this.forecast = opts.forecast || false;
    this.report = opts.report || false;
    this.sweep = opts.sweep || false;
    this.prediction_store = opts.prediction_store || false;
    this.monthly = opts.monthly || false;
    this.ensemble = opts.ensemble || null;
    this.saved = opts.saved || false;
    this.model_name = opts.model_name || "oman_border_default";
    this.target = opts.target || "detained_count";
    this.level = opts.level || "governorate";
    this.horizon_months = opts.horizon_months || 48;
    this.horizon_days = opts.horizon_days || 14;
  }

  validate() {
    const issues = [];
    if (!["calibration", "forecasting"].includes(this.run_type)) issues.push(`invalid run_type: ${this.run_type}`);
    if (this.evaluate && this.run_type === "forecasting") issues.push("evaluate cannot run with forecasting run_type");
    if (this.run_type === "calibration" && !(this.train || this.evaluate)) issues.push("calibration run requires train or evaluate");
    if (this.run_type === "forecasting" && !this.forecast) issues.push("forecasting run requires forecast");
    if (!["priogrid", "governorate"].includes(this.level)) issues.push(`invalid level: ${this.level}`);
    return issues;
  }

  applyMonthlyShortcut() {
    if (this.monthly) {
      this.run_type = "forecasting";
      this.forecast = true;
      this.report = true;
      this.prediction_store = true;
    }
    return this;
  }

  static fromArgv(argv) {
    const args = new ForecastingModelArgs();
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      switch (a) {
        case "--train": args.train = true; break;
        case "--evaluate": args.evaluate = true; break;
        case "--forecast": args.forecast = true; break;
        case "--report": args.report = true; break;
        case "--sweep": args.sweep = true; break;
        case "--prediction_store": args.prediction_store = true; break;
        case "--monthly": args.applyMonthlyShortcut(); break;
        case "--saved": args.saved = true; break;
        case "--ensemble": args.ensemble = argv[++i]; break;
        case "--run_type": args.run_type = argv[++i]; break;
        case "--model": args.model_name = argv[++i]; break;
        case "--target": args.target = argv[++i]; break;
        case "--level": args.level = argv[++i]; break;
        case "--horizon_months": args.horizon_months = parseInt(argv[++i], 10); break;
        case "--horizon_days": args.horizon_days = parseInt(argv[++i], 10); break;
      }
    }
    const issues = args.validate();
    if (issues.length) throw new Error("CLI validation failed: " + issues.join("; "));
    return args;
  }
}