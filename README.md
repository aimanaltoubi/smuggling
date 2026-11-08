# Oman Incident Analytics

Offline analytics for incident records supplied as a local CSV. The CSV is parsed in the app and is not uploaded. No account, backend, or internet connection is needed to analyze a file. Imported data remains in memory for the current app session; select the CSV again after restarting the app.

## Download the EXE from Windows CMD

On an internet-connected Windows PC, paste this entire line into Command Prompt to download the latest published self-contained installer:

```bat
if not exist "%USERPROFILE%\Desktop\OmanIncidentAnalytics" mkdir "%USERPROFILE%\Desktop\OmanIncidentAnalytics" & cd /d "%USERPROFILE%\Desktop\OmanIncidentAnalytics" & curl.exe --fail --location --output Oman-Incident-Analytics-Setup-x64.exe https://github.com/aimanaltoubi/smuggling/releases/latest/download/Oman-Incident-Analytics-Setup-x64.exe
```

Paste the command exactly as one line. Do not type `bat`; it is only the Markdown code-block label.

**Install v1.0.11 or newer for all updates described here**, including the detailed offline map, corrected border statistics, six-section pattern analysis, floating system assistant, models/pipeline guide, incomplete-final-month handling in seasonal forecasts, readable governorate labels, separate smuggling and infiltration tactical predictions with a graded risk grid, and background tactical computation that keeps the prediction tab responsive on large files. Installed copies do not update automatically: download and run the new installer.

This command downloads the latest successfully published installer. Copy that single installer EXE to a USB drive and transfer it to the offline PC. Run it there to install the complete app, including the map, model runtime, and 1.12 GB language model. The offline PC does not need CMD setup, Node.js, or internet access. A source-code push alone does not update the EXE: the versioned Windows release build must finish and publish its installer first.

## Forecast Models

The app's **النماذج وآلية العمل** tab explains model availability, automatic selection, pipeline stages, software components, strategic/tactical outputs, and offline architecture in Arabic. It is accessible before importing a dataset. It also distinguishes Python-only reference models from models that actually run in the Windows app, and explains validation limits and the role of the text generator.

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

Follow these four steps to turn your local Excel file into the CSV accepted by the app. **Use Command Prompt (CMD), not a PowerShell prompt**, for all commands below. If your prompt begins with `PS`, type `cmd.exe` first. Paste only the commands, not the `bat` code-block label.

The cleaner runs with Windows PowerShell 5.1, included with standard Windows 10/11. Cleaning and coordinate conversion are **fully offline**: no Python, Microsoft Excel installation, additional packages, account, or upload is required. Only the initial downloads need internet access.

### 1. Download the Cleaner

On an internet-connected Windows PC, paste these commands into CMD:

```bat
if not exist "%USERPROFILE%\Desktop\IncidentData" mkdir "%USERPROFILE%\Desktop\IncidentData"
cd /d "%USERPROFILE%\Desktop\IncidentData"
curl.exe --fail --location --output "clean_incidents.ps1" https://raw.githubusercontent.com/aimanaltoubi/smuggling/main/scripts/clean_incidents.ps1
```

This downloads [scripts/clean_incidents.ps1](scripts/clean_incidents.ps1) into `IncidentData` on your desktop, replacing a previous copy of the script if present. It is a separate preparation tool, not part of the installed app.

### 2. Place the Excel File Beside It

Copy your local workbook into that same folder and name the **copy** `incidents.xlsx`. Keep your original workbook unchanged. The first sheet must have these headers:

```text
incident_id incident_date location_name governorate latitude longitude incident_type detained_count ethnicity details
```

For a synthetic test instead of operational data, run this in CMD to download the 120-record mock as `incidents.xlsx`. It will not overwrite an existing workbook:

```bat
if not exist "%USERPROFILE%\Desktop\IncidentData\incidents.xlsx" curl.exe --fail --location --output "%USERPROFILE%\Desktop\IncidentData\incidents.xlsx" https://raw.githubusercontent.com/aimanaltoubi/smuggling/main/public/mock-incidents.xlsx
```

The mock's first sheet matches your source format, including Arabic text, `التسلل`, timestamps, and N/E coordinates in metres. It is not operational data. Its second sheet, `WGS84 Preview`, is an already-converted reference; use the **first sheet** for this workflow.

For a separate offline PC, transfer the whole `IncidentData` folder to that user's desktop using your approved transfer process. No download is required on the offline PC. Before cleaning, the folder contains:

```text
IncidentData\
    clean_incidents.ps1
    incidents.xlsx
```

### 3. Run the Cleaner

On the PC containing the workbook, paste this **complete command** into CMD:

```bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\Desktop\IncidentData\clean_incidents.ps1" -InputPath "%USERPROFILE%\Desktop\IncidentData\incidents.xlsx" -OutputPath "%USERPROFILE%\Desktop\IncidentData\incidents-clean.csv" -CoordinateSystem "web-mercator"
```

This command is for the supplied source format: **`latitude` holds N/Y northing in metres, and `longitude` holds E/X easting in metres, using Web Mercator (EPSG:3857)**. It converts those values to WGS84 latitude/longitude degrees, removes the time from dates, and normalizes `التسلل`/`التهريب` to `تسلل`/`تهريب`. Do not remove the `-CoordinateSystem "web-mercator"` part when processing this source or the mock. For real data, verify that its projection is EPSG:3857; N/E labels alone do not identify a projection.

The output path is explicit, so the CSV is created in `IncidentData`, not `C:\Windows\System32`, regardless of where CMD was opened. Only run scripts you have reviewed and trust. The execution-policy setting applies to this process only; organizational script restrictions still apply.

### 4. Import the Clean CSV

For the mock, expect **`Saved 120 records`**. Open the app's upload tab and select `incidents-clean.csv` from `IncidentData` on your desktop, **not the Excel file**. Compare with [public/mock-incidents-clean.csv](public/mock-incidents-clean.csv) if needed. The example coordinates become latitude `24.32328749` and longitude `56.05538849`.

The cleaner creates a new comma-separated UTF-8 CSV with a BOM. It never changes the source workbook, overwrites an existing output, silently drops invalid records, or deduplicates them. If `incidents-clean.csv` already exists, change only the output filename in step 3 to a new name, such as `incidents-clean-2.csv`. If validation fails, no CSV is written; correct the reported source issues and rerun. Extra columns are preserved.

### Other Input Formats

Keep the step 3 command and change only the relevant option:

- Already-converted WGS84 degree coordinates: replace `-CoordinateSystem "web-mercator"` with `-CoordinateSystem "wgs84"`. Never reconvert degree values as metres.
- Another Excel worksheet: add `-Sheet "Sheet1"`, using the actual sheet name. The first worksheet is used by default.
- Local CSV instead of Excel: change the input filename from `incidents.xlsx` to `incidents.csv`. The same coordinate-system rule applies.
- Arabic column headers: add `-ColumnMap "%USERPROFILE%\Desktop\IncidentData\columns.json"` after preparing the mapping below.

For example, `23-06-2025 13:87:02` becomes `2025-06-23`. The time is deliberately ignored, even if invalid. Accepted Gregorian date forms are `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `YYYY/MM/DD`, and native Excel date cells, optionally with times. **Day-first is always used when the year is last**: `03/04/2025` means 3 April, not March 4. US month-first dates and Hijri calendar dates must be converted explicitly before running this tool; they cannot be reliably inferred. Unformatted Excel serial numbers are rejected: format those cells as actual Excel dates first.

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

Place the mapping in `IncidentData` beside the workbook, then add the column-map option listed under **Other Input Formats** to the complete step 3 command.

Reuse the same mapping for future files with that schema. The tool does not guess header meanings, invent missing coordinates, translate categories, or change governorate names. `incident_type` accepts `تهريب` or `تسلل` and normalizes the definite-article variants `التهريب` and `التسلل` to those app values; other labels require a verified source correction. The first row must be the header, without preceding titles or merged header cells. Convert legacy `.xls` workbooks to `.xlsx` first. Replace Excel formulas/errors with verified values before conversion. Store identifiers as text in Excel to preserve leading zeros; digits already lost by Excel cannot be recovered by this tool.

### Projected Coordinates

By default, `latitude` and `longitude` must be WGS84 decimal degrees, not metres. Values such as `2792851.872` and `6240057.303` are outside that range and resemble projected coordinates. Confirm the coordinate reference system (CRS) with the dataset provider or GIS export settings before converting; the numbers alone do not identify it reliably.

The complete step 3 command selects Web Mercator (EPSG:3857), with northing (Y) in `latitude` and easting (X) in `longitude`.

This converts all coordinates in the file from metres to WGS84 degrees. The example above becomes approximately `24.323` latitude and `56.055` longitude. This interpretation is conditional on the confirmed source CRS, not proof of the incident's location. Do not use this option for UTM, another projection, or mixed coordinate systems; export those sources as WGS84 decimal degrees with a trusted offline GIS tool first. If the X/Y columns are reversed, correct the headers or column mapping first. The Python cleaner supports the same conversion with `--coordinate-system web-mercator`.

The conversion itself is **fully offline**: the PowerShell script reads your local Excel workbook and uses built-in math. It makes no network requests and needs no Python, `pyproj`, JavaScript library, Microsoft Excel installation, or additional packages on the offline Windows PC. Download or transfer the script beforehand; the operational workbook never needs to leave that PC.

For the supplied N/E values, the mapping under the Web Mercator interpretation is:

| Source column | Source axis and value (metres) | Cleaned column and value (degrees) |
| --- | --- | --- |
| `latitude` | N/Y northing: `2792851.872` | `latitude`: `24.32328749` |
| `longitude` | E/X easting: `6240057.303` | `longitude`: `56.05538849` |

Do not swap these source columns: northing converts to latitude, and easting converts to longitude. The source headers describe the intended output axes, but the original cell values are still metres until conversion.

### Encoding and Validation

- Arabic and Persian digits in dates, coordinates, and counts become ASCII digits. Arabic decimal/thousands separators are supported; use a dot for other decimal values. Leading/trailing whitespace is trimmed, while Arabic spelling and interior text are preserved.
- Missing required values, invalid calendar dates, out-of-range coordinates, invalid incident types, and negative/fractional detainee counts stop conversion. Blank records are ignored. Review the reported issues rather than filling them with guessed values.
- For a CSV **known** to use Windows Arabic encoding, add `-CodePage 1256`. For a semicolon-separated input, add `-Delimiter ";"`. These options affect input only; output is always comma-separated UTF-8. Do not guess an encoding merely because decoding succeeds.
- If text already contains `???` or the Unicode replacement character, the cleaner flags possible data loss. Encoding changes cannot restore those characters: return to the original Excel workbook or an intact backup. Other pre-existing garbled text cannot always be detected automatically.
- If exporting manually from Excel, choose **CSV UTF-8 (Comma delimited)**, not legacy **CSV (Comma delimited)**. After cleaning, upload `incidents-clean.csv` directly; resaving it through a legacy encoding can damage Arabic again.

No cleaner can guarantee the factual accuracy of arbitrary datasets. This workflow validates the app's import requirements, not whether locations, classifications, or incident facts are correct. Inspect a representative sample and the row count before operational use.

Developer note: [scripts/test_clean_incidents.py](scripts/test_clean_incidents.py) tests both cleaners, generates Excel fixtures, and checks the output against the app importer. Those developer tests use Python, `openpyxl`, Node dependencies, and PowerShell (auto-detected or set through `POWERSHELL_EXE`); none of those additional developer dependencies is needed to run the PowerShell cleaner on the offline Windows PC. The earlier [Python cleaner](scripts/clean_incidents.py) remains available for environments that already have Python, but it is not required for this Windows workflow.

## Windows Offline Installer

The incident map uses **Leaflet 2D offline vector tiles**, not Cesium or WebGL. Bundled geometry includes **165,336 road segments**, local streets, urban land-use areas, waterways, vegetation, and country outlines. Detail is rendered locally at each zoom level, rather than stretching one overview image. A separate OpenStreetMap dataset contains **2,723 named places in Oman**, including 27 cities, 46 towns, 1,932 villages, hamlets, suburbs, and neighbourhoods. Arabic names are used where available, with the source name as fallback. Major places appear at wider views; smaller places and named streets appear at closer zooms, with overlapping labels suppressed. Local Arabic/English place search, scale, incident popups, and risk-grid views are included. The map is constrained to the Oman region. No online tile server, account, API key, or internet connection is required. It is not satellite imagery or a complete street-level survey; OpenStreetMap coverage may omit places or contain errors.

The **border view uses geographic lines**, not rectangular sectors or latitude cutoffs. Oman–UAE, Oman–Saudi Arabia, and Oman–Yemen borders are derived from shared national boundary ways in OpenStreetMap; the physical coastline is downloaded separately. Each incident is counted against its nearest line only when it lies **within 25 km**. Interior incidents outside that limit remain unassigned. This is a stated proximity rule, not proof that an incident crossed a border. These are reference boundaries, not an authoritative operational survey; obtain approved boundary data for decisions requiring that level of certainty.

The Windows x64 setup EXE contains the app, Electron runtime, local map assets, llama.cpp CPU runtime, and Qwen model. It is a single file for transfer to the offline PC. Its download/install size is about 1.2 GB; allow at least 3 GB of free disk space while installing. The bundled basemap includes Natural Earth 1:10m country outlines and OpenStreetMap coastlines, governorate boundaries, principal roads, and major-place labels. It has no online tiles, does not include every local street, and is not an authoritative operational boundary reference. Natural Earth country data is public domain. OpenStreetMap data is credited to [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) and available under the Open Database License (ODbL).

To refresh the bundled map data on an internet-connected development machine, run `npm run map:build` and commit [public/offline-oman-geography.json](public/offline-oman-geography.json), [src/lib/analytics/omanBoundaries.json](src/lib/analytics/omanBoundaries.json), [src/lib/analytics/omanPlaces.json](src/lib/analytics/omanPlaces.json), and the optional overview [public/offline-oman-map.svg](public/offline-oman-map.svg). Focused refresh options are `--geography-only`, `--boundaries-only`, and `--places-only`, passed to `node scripts/generate-offline-map.js`. Run `node --test scripts/test_border_analytics.mjs` to check the border proximity logic. These are preparation steps; the installed app reads the bundled data without network access.

### Optional offline forecast explanations

Qwen 2.5 1.5B Instruct (Q4_K_M) runs through the bundled llama.cpp CPU runtime in the strategic and tactical tabs. **تقرير تحليلي** produces six sections: النتائج الرئيسية، تحليل الأنماط التاريخية، قراءة مسار التوقع ومقارنته بالتاريخ، التحليل الجغرافي وتركيب الحوادث، تقييم النموذج وعدم اليقين، والدلالات. Calculations—not the language model—provide calendar-aligned means, variability, zero periods, descriptive recurrence, peaks, recent-window changes, forecast comparisons, and yearly totals. Assumed zero months follow the model's reporting-window convention; incomplete reporting can change interpretation. Descriptive repetition is not a formal significance test or confirmed annual seasonality. Daily forecasts are not compared directly with monthly totals. Select **شرح موجز** for a short explanation instead. Reports can be exported as UTF-8 Markdown and generation can be cancelled.

The generator receives summaries of the selected local CSV records, forecast outputs, and validation facts. It does **not** retrieve GDELT, news, or external intelligence sources, and it does not send the operational records to an online service. Raw incident narratives are excluded. Checks reject mixed-language/internal-field leakage, repeated field narration, unsupported numbers or ISO dates, inconsistent forecast ranges, unsupported source or corridor claims, truncated output, and incomplete report structure. If model text fails these checks, it is not displayed. A deterministic, fact-bound Arabic analysis is substituted and clearly labeled **تحليل مقيد بالحقائق**; the same provenance note is included in the exported Markdown.

### Floating System Assistant

The floating **مساعد النظام** button opens local Q&A about the system, loaded records, numerical patterns, and captured forecast panels. Answers come from verified calculations and curated system knowledge, not unrestricted language-model generation. Sources and scope are shown. Questions outside the available data, unsupported causal claims, and requests to invent facts are declined or clarified; global totals are not substituted for an unknown governorate or specific date. Conversation and captured forecast context are cleared when a new dataset is imported. The assistant makes no external requests and also works in browser development mode.

This bounded assistant cannot guarantee understanding every phrasing or answer every question; inspect its stated scope and source. Evaluate it with `node --test scripts/test_system_chat.mjs scripts/test_pattern_analysis.mjs scripts/test_report_generation.mjs`. The six-section reports, numerical-pattern engine, floating assistant, and system guide are included in installer v1.0.8 and newer; older versions do not contain these features.

Live evaluation of the bundled Qwen 1.5B model on three synthetic cases (smuggling summary, varying detainee forecast, single-type report) accepted **0/3 raw model outputs**. The model repeated instructions, misstated ranges or dates, or returned incomplete text. All **3/3 grounded replacements** passed the output checks. This is a small prompt-compliance evaluation, not evidence of model intelligence quality or forecast accuracy. Reproduce it with a local CPU model server using `node scripts/evaluate_explanations.mjs http://127.0.0.1:8099`; outputs and check results are saved in `build/explanation-evaluation.json`. No operational data is used.

The checks are not a complete semantic verification system. Accepted model text can still contain factual mistakes or unsupported interpretations, and a grounded template is not an independent intelligence assessment. Review every report against the charts and source records; it is commentary, not evidence, and cannot change forecasts. The model is Apache-2.0 licensed. No extra files or post-install downloads are needed on the offline PC. Use installer v1.0.8 or newer for the six-section analysis, floating assistant, and system guide. Browser development mode does not include the model service. Developer checks: `node --test scripts/test_report_generation.mjs`.

The Windows release workflow builds and publishes the model-inclusive installer when a new `v*` version tag is pushed. Before tagging, update the app version in [package.json](package.json), synchronize [package-lock.json](package-lock.json), and commit and push those changes. Use a new, matching version tag for each release. The latest-release download command updates only after that workflow succeeds and publishes the installer. The workflow can also be run manually from GitHub Actions; a manual run provides the installer as a downloadable workflow artifact rather than updating the public release download.

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