#!/usr/bin/env bash
# Oman Border Forecasting — MLOps pipeline runner.
# Mirrors views-models monthly_run.sh conventions.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

export PYTHONPATH="${PYTHONPATH:-}:$(pwd)"

# Run model
# ./run.sh --run_type calibration --train --evaluate --report --saved
# Run ensemble
# ./run.sh --ensemble hybrid_lynx --forecast --report
# Monthly production cycle
# ./run.sh --monthly

python -m pipeline.pipeline "$@"