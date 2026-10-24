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

## Clean Arabic Excel or CSV Data Offline

Use [scripts/clean_incidents.py](scripts/clean_incidents.py) before importing operational data. It reads `.xlsx` directly, so Arabic text does not pass through Excel's legacy CSV encoding. It also cleans existing CSV files. All processing stays on your PC; Microsoft Excel does not need to be installed.

The cleaner creates a **new comma-separated UTF-8 CSV with a BOM**, which the app accepts and Excel can recognize as Unicode. It never overwrites an existing file or changes the source. It validates every non-empty record before writing; if any record fails, it prints row/column errors, exits with a nonzero status, and writes no output. Fix the source and rerun, using a new output filename if a previous output already exists. No records are silently dropped or deduplicated. Extra columns are preserved.

### One-time Setup on Windows

The cleaner requires Python 3.10 or newer. This is a separate preparation tool, not part of the installed app. Copy [scripts/clean_incidents.py](scripts/clean_incidents.py) to the offline PC, retaining the `scripts` folder for the commands below. Run CMD from the folder containing `scripts` and your dataset.

On an internet-connected PC with Python, download the Excel reader and its dependency:

```bat
py -m pip download --only-binary=:all: --dest excel-wheels openpyxl==3.1.5
```

Transfer `excel-wheels` and, if needed, a Windows Python offline installer matching your offline PC to that PC using your approved transfer process. Install Python there, then install the Excel reader without internet:

```bat
py -m pip install --no-index --find-links=excel-wheels openpyxl==3.1.5
```

CSV-only cleaning uses Python's standard library and does not require `openpyxl`. Never upload operational datasets to an online converter.

### Run the Cleaner from CMD

For a workbook whose first row already contains the English headers listed above:

```bat
py scripts\clean_incidents.py "incidents.xlsx" "incidents-clean.csv"
```

The active worksheet is used by default. Select another worksheet explicitly when needed:

```bat
py scripts\clean_incidents.py "incidents.xlsx" "incidents-clean.csv" --sheet "Sheet1"
```

For an existing UTF-8 CSV, including dates such as `23-06-2025 13:87:02`:

```bat
py scripts\clean_incidents.py "incidents.csv" "incidents-clean.csv"
```

The date becomes `2025-06-23`. The time is deliberately ignored, even if invalid. Accepted Gregorian date forms are `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `YYYY/MM/DD`, and native Excel date cells, optionally with times. **Day-first is always used when the year is last**: `03/04/2025` means 3 April, not March 4. US month-first dates and Hijri calendar dates must be converted explicitly before running this tool; they cannot be reliably inferred. Unformatted Excel serial numbers are rejected: format those cells as actual Excel dates first.

### Map Arabic Column Headers

Arabic **cell contents stay Arabic**. Only headers must match the app's English schema. If your source has Arabic headers, create a UTF-8 JSON file named `columns.json` with the exact source header on the left and the app header on the right. This is an example; replace the left-hand names with the actual names in your workbook:

```json
{
	"رقم الواقعة": "incident_id",
	"تاريخ الواقعة": "incident_date",
	"الموقع": "location_name",
	"المحافظة": "governorate",
	"خط العرض": "latitude",
	"خط الطول": "longitude",
	"نوع الواقعة": "incident_type",
	"عدد المضبوطين": "detained_count",
	"الجنسية": "ethnicity",
	"التفاصيل": "details"
}
```

```bat
py scripts\clean_incidents.py "incidents.xlsx" "incidents-clean.csv" --column-map "columns.json"
```

Reuse the same mapping for future files with that schema. The tool does not guess header meanings, invent missing coordinates, translate categories, or change governorate names. `incident_type` must already contain `تهريب` or `تسلل`; other labels require a verified source correction. The first row must be the header, without preceding titles or merged header cells. Convert legacy `.xls` workbooks to `.xlsx` first. Replace Excel formulas/errors with verified values before conversion. Store identifiers as text in Excel to preserve leading zeros; digits already lost by Excel cannot be recovered by this tool.

### Encoding and Validation

- Arabic and Persian digits in dates, coordinates, and counts become ASCII digits. Arabic decimal/thousands separators are supported; use a dot for other decimal values. Leading/trailing whitespace is trimmed, while Arabic spelling and interior text are preserved.
- Missing required values, invalid calendar dates, out-of-range coordinates, invalid incident types, and negative/fractional detainee counts stop conversion. Blank records are ignored. Review the reported issues rather than filling them with guessed values.
- For a CSV **known** to use Windows Arabic encoding, add `--encoding cp1256`. For a semicolon-separated input, add `--delimiter ";"`. These options affect input only; output is always comma-separated UTF-8. Do not guess an encoding merely because decoding succeeds.
- If text already contains `???` or the Unicode replacement character, the cleaner flags possible data loss. Encoding changes cannot restore those characters: return to the original Excel workbook or an intact backup. Other pre-existing garbled text cannot always be detected automatically.
- If exporting manually from Excel, choose **CSV UTF-8 (Comma delimited)**, not legacy **CSV (Comma delimited)**. After cleaning, upload `incidents-clean.csv` directly; resaving it through a legacy encoding can damage Arabic again.

No cleaner can guarantee the factual accuracy of arbitrary datasets. This workflow validates the app's import requirements, not whether locations, classifications, or incident facts are correct. Inspect a representative sample and the row count before operational use.

Developer regression check (Python, `openpyxl`, and the project's Node dependencies installed):

```bash
python -m unittest discover -s scripts -p 'test_clean_incidents.py' -v
```

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