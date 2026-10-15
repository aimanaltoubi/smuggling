# AGENTS.md

## Project Context

This is an offline incident analytics app. Keep changes focused on the user's request and preserve existing project conventions.

Start with `README.md` for local setup and CSV format.

## Key Files

- `src/`: frontend application source.
- `src/pages/Dashboard.jsx`: analytics dashboard and local CSV workflow.
- `src/lib/analytics/`: incident parsing, analysis, forecasting, and prediction.

## Working Notes

- Incident data is selected from a local CSV file and processed in the browser; it is not uploaded to a server.
- The app has no account or backend dependency.
- Run the relevant checks from `package.json` before finishing code changes.
