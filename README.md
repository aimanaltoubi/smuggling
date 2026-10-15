# Oman Incident Analytics

Offline analytics for incident records supplied as a local CSV. The CSV is parsed in the app and is not uploaded. No account, backend, or internet connection is needed to analyze a file. Imported data remains in memory for the current app session; select the CSV again after restarting the app.

## Download the EXE from Windows CMD

On an internet-connected Windows PC, run these commands in Command Prompt to download the latest published portable EXE:

```bat
if not exist "%USERPROFILE%\Desktop\OmanIncidentAnalytics" mkdir "%USERPROFILE%\Desktop\OmanIncidentAnalytics"
cd /d "%USERPROFILE%\Desktop\OmanIncidentAnalytics"
curl.exe --fail --location --output Oman-Incident-Analytics-x64.exe https://github.com/aimanaltoubi/smuggling/releases/latest/download/Oman-Incident-Analytics-x64.exe
```

Copy only the command lines into CMD. Do not type `bat`; it is only the Markdown code-block label.

The public `v1.0.1` release is available now; this command downloads its EXE and will follow newer releases automatically. Then copy `Oman-Incident-Analytics-x64.exe` to a USB drive and transfer it to the offline PC. The offline PC does not need CMD setup, Node.js, or internet access; double-click the EXE to start the app.

## Forecast Models

### Monthly strategic forecast

The strategic forecast aggregates incidents and detainees by month and governorate, then projects up to 48 months. Its default `AutoTunedModel` evaluates 17 candidate configurations using rolling time-based validation:

- Recent averages over 3, 6, or 12 months, plus a last-observation baseline.
- Seasonal climatology over 24 or 36 months.
- A seasonal trend model and four damped Holt trend configurations.
- Six lagged-feature ridge models using recent, seasonal, or trend features.

Candidates are scored at 1-, 3-, and 6-month horizons. The selected model or ensemble must improve on a recent/seasonal baseline during internal validation; otherwise the baseline is retained. Experimental forecast intervals are based on held-out residuals. They are not guaranteed probability intervals. The 48-month projection is **not fully validated**: the evaluation workflow measures 1, 3, and 6 months.

### Tactical forecast

The tactical forecast runs the monthly pipeline separately for incident counts and detainee counts at governorate level, then converts monthly totals into daily rates. A recent-activity weight is tuned independently for each target from earlier time windows and blends the pipeline rate with the previous 30 days.

The prediction tab reports a 14-day expected total and daily profile; the map can compare 14- and 30-day windows. The highest expected day, a governorate ranking, a location, and a likely incident type are also reported. The evaluation additionally tests 7-day windows. The type is selected from recent incident-type frequency; the location is the latest observed location for the top-ranked governorate. The risk score is a relative ranking, not a calibrated probability. These outputs should be treated as planning estimates, not event-level guarantees.

### Forecast evaluation

The Evaluation tab supports uploaded data and controlled synthetic use cases. Synthetic tests cover stable seasonal activity, gradual growth, and a sudden volume/geography/type shift, with three deterministic random seeds per use case. Monthly backtests score incidents and detainees for all incidents and each incident type. Tactical tests score 7-, 14-, and 30-day totals, daily counts, type, governorate/top-three ranking, location, peak timing, and detainee rate against held-out future records.

WAPE and MASE describe error; skill compares error with a simple seasonal or recent-rate baseline (positive is better, negative is worse). Synthetic performance checks whether the model responds to known patterns; it does not establish accuracy on real incidents. Use the uploaded-data evaluation before operational use.

## CSV Format

The first row must use these English column names:

Required: `incident_id`, `incident_date` (`YYYY-MM-DD`), `location_name`, `governorate`, `latitude`, `longitude`, `incident_type` (`تهريب` or `تسلل`), `detained_count`.

Optional: `ethnicity`, `details`.

Use the upload tab to select the CSV. The app validates required values, coordinates, dates, and incident types before analysis.

Download the reproducible four-year synthetic sample from [`public/sample-incidents.csv`](public/sample-incidents.csv), or use the full-data download link in the app's upload tab. It contains no operational incident data; its seeded pattern has summer peaks, winter lows, five governorates, and mixed incident types. It is long enough to exercise forecasting and evaluation workflows.

## Windows Portable EXE

The Windows x64 portable executable bundles the app, Electron runtime, and local Cesium assets. Build it on an internet-connected Windows PC, then copy the EXE to the offline PC. The offline PC does not need Node.js, npm, or an internet connection. The map uses a bundled schematic base map with no online tiles; it is for orientation, not authoritative boundary reference.

### Optional offline forecast explanations

The app can use Qwen 2.5 1.5B Instruct (Q4_K_M, approximately 1.12 GB) with the llama.cpp Windows CPU runtime to produce short Arabic explanations of the forecasts shown in the strategic and tactical tabs. The model receives forecast results and validation facts only. It does not create or modify forecast numbers, and its explanations can still be wrong; treat them as commentary, not additional evidence. The normal analytics app works without these optional files.

On an internet-connected Windows PC, download the runtime and model into the same folder as the EXE:

```bat
cd /d "%USERPROFILE%\Desktop\OmanIncidentAnalytics"
if not exist llama-runtime mkdir llama-runtime
curl.exe --fail --location --output llama-runtime.zip https://github.com/ggml-org/llama.cpp/releases/download/b11662/llama-b11662-bin-win-cpu-x64.zip
powershell -NoProfile -Command "Expand-Archive -LiteralPath 'llama-runtime.zip' -DestinationPath 'llama-runtime' -Force"
curl.exe --fail --location --output qwen2.5-1.5b-instruct-q4_k_m.gguf https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf
```

Copy the EXE, the `llama-runtime` folder, and the `.gguf` model file together to the offline PC. The app starts the CPU model locally when present; first startup can take a few minutes. The model is Apache-2.0 licensed. This adds about 1.12 GB of model storage plus the small runtime ZIP (about 20 MB compressed); no model is embedded in the EXE.

The Windows release workflow publishes the EXE when a `v*` version tag is pushed. To create a release after the project changes are pushed to GitHub, run from the repository:

```bat
git tag v1.0.0
git push origin v1.0.0
```

Use a new version tag for each release. For example, after the next release changes are pushed to GitHub, run `git tag v1.0.2` and `git push origin v1.0.2`. The workflow can also be run manually from GitHub Actions; a manual run provides the EXE as a downloadable workflow artifact.

### Build the EXE from CMD

On an internet-connected Windows 10/11 x64 PC, install Git and Node.js 22.12 or newer, then run:

```bat
if not exist "%USERPROFILE%\source" mkdir "%USERPROFILE%\source"
cd /d "%USERPROFILE%\source"
git clone https://github.com/aimanaltoubi/smuggling.git
cd smuggling
npm ci
npm run package:win
```

The portable executable is written to `release\Oman-Incident-Analytics-x64.exe`. Copy that file to a USB drive, then to the offline PC. To run it from CMD:

```bat
cd /d E:\OmanIncidentAnalytics
Oman-Incident-Analytics-x64.exe
```

You can also double-click the EXE. On first launch, Windows SmartScreen may warn that the app is unsigned. The portable build is not code-signed.

### Run from source or build a web bundle

```bash
npm ci
npm run dev
npm run build
```

For offline browser use instead of the EXE, build while dependencies are available, then serve the `dist` directory over localhost on the offline PC.