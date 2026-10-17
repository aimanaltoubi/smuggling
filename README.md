# Oman Incident Analytics

Offline analytics for incident records supplied as a local CSV. The CSV is parsed in the app and is not uploaded. No account, backend, or internet connection is needed to analyze a file. Imported data remains in memory for the current app session; select the CSV again after restarting the app.

## Download the EXE from Windows CMD

On an internet-connected Windows PC, paste this entire line into Command Prompt to download the latest published self-contained installer:

```bat
if not exist "%USERPROFILE%\Desktop\OmanIncidentAnalytics" mkdir "%USERPROFILE%\Desktop\OmanIncidentAnalytics" & cd /d "%USERPROFILE%\Desktop\OmanIncidentAnalytics" & curl.exe --fail --location --output Oman-Incident-Analytics-Setup-x64.exe https://github.com/aimanaltoubi/smuggling/releases/latest/download/Oman-Incident-Analytics-Setup-x64.exe
```

Paste the command exactly as one line. Do not type `bat`; it is only the Markdown code-block label.

The currently published `v1.0.1` release predates the self-contained installer. The next versioned release will publish `Oman-Incident-Analytics-Setup-x64.exe`; this command will then follow newer releases automatically. Copy that single installer EXE to a USB drive and transfer it to the offline PC. Run it there to install the complete app, including the map, model runtime, and 1.12 GB language model. The offline PC does not need CMD setup, Node.js, or internet access.

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

## Windows Offline Installer

The Windows x64 setup EXE contains the app, Electron runtime, local map assets, llama.cpp CPU runtime, and Qwen model. It is a single file for transfer to the offline PC. Its download/install size is about 1.2 GB; allow at least 3 GB of free disk space while installing. The bundled basemap includes Natural Earth 1:10m country outlines and OpenStreetMap coastlines, governorate boundaries, principal roads, and major-place labels. It has no online tiles, does not include every local street, and is not an authoritative operational boundary reference. Natural Earth country data is public domain. OpenStreetMap data is credited to [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) and available under the Open Database License (ODbL).

To refresh the bundled map from an internet-connected development machine, run `npm run map:build` and commit the updated `public/offline-oman-map.svg`.

### Optional offline forecast explanations

Qwen 2.5 1.5B Instruct (Q4_K_M) runs through the bundled llama.cpp CPU runtime and generates short Arabic explanations in the strategic and tactical tabs. It receives forecast results and validation facts only; it cannot change forecasts. Its text may still be wrong and is commentary, not evidence. The model is Apache-2.0 licensed. No extra files or post-install downloads are needed.

The Windows release workflow builds the model-inclusive installer when a `v*` version tag is pushed. The current `v1.0.3` release does not include the latest map changes. After they are pushed, create `v1.0.4` from the repository:

```bat
git tag v1.0.4
git push origin v1.0.4
```

Use a new version tag for each release. The workflow can also be run manually from GitHub Actions; a manual run provides the installer as a downloadable workflow artifact.

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

The installer is written to `release\Oman-Incident-Analytics-Setup-x64.exe`. Copy that file to a USB drive, then to the offline PC and run it there. The app is installed with its local model/runtime and can be launched from the desktop shortcut or Start menu.
Windows SmartScreen may warn that the installer is unsigned.

### Run from source or build a web bundle

```bash
npm ci
npm run dev
npm run build
```

For offline browser use instead of the EXE, build while dependencies are available, then serve the `dist` directory over localhost on the offline PC.