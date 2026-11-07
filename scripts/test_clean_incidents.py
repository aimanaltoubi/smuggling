import contextlib
import csv
from datetime import datetime
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from clean_incidents import REQUIRED, clean_date, clean_table, main


class CleaningTests(unittest.TestCase):
    def record(self):
        return ["001", "23-06-2025 13:87:02", "\u0635\u062d\u0627\u0631", "\u0634\u0645\u0627\u0644 \u0627\u0644\u0628\u0627\u0637\u0646\u0629", "\u0662\u0664\u066b\u0663", "56.7", "\u062a\u0647\u0631\u064a\u0628", "\u0663"]

    def test_date_formats_and_invalid_time(self):
        for value in ("23-06-2025 13:87:02", "23/06/2025", "2025-06-23T12:00:00Z", "\u0662\u0663-\u0660\u0666-\u0662\u0660\u0662\u0665", datetime(2025, 6, 23)):
            self.assertEqual(clean_date(value), "2025-06-23")
        self.assertEqual(clean_date("03/04/2025"), "2025-04-03")
        for value in ("31-02-2025", "06-23-2025", "not a date", "45831"):
            with self.assertRaises(ValueError):
                clean_date(value)

    def test_mapping_digits_and_text_preservation(self):
        headers = list(REQUIRED) + ["details"]
        headers[1] = "\u0627\u0644\u062a\u0627\u0631\u064a\u062e"
        details = 'Arabic text, "quoted"\nnext line'
        _, rows = clean_table([headers, self.record() + [details]], {headers[1]: "incident_date"})
        self.assertEqual(rows[0]["incident_id"], "001")
        self.assertEqual(rows[0]["latitude"], "24.3")
        self.assertEqual(rows[0]["detained_count"], "3")
        self.assertEqual(rows[0]["location_name"], self.record()[2])
        self.assertEqual(rows[0]["details"], details)

    def test_invalid_rows_are_not_silently_accepted(self):
        for field, value in (("latitude", "91"), ("longitude", "NaN"), ("detained_count", "-1"), ("detained_count", "1.5"), ("incident_type", "unknown"), ("location_name", "???"), ("governorate", "")):
            record = self.record()
            record[list(REQUIRED).index(field)] = value
            with self.assertRaisesRegex(ValueError, field):
                clean_table([list(REQUIRED), record], {})
        with self.assertRaisesRegex(ValueError, "duplicate"):
            clean_table([list(REQUIRED) + ["incident_date"]], {})

    def test_definite_article_incident_types(self):
        for category in ("\u062a\u0647\u0631\u064a\u0628", "\u062a\u0633\u0644\u0644"):
            record = self.record()
            record[6] = "\u0627\u0644" + category
            _, rows = clean_table([REQUIRED, record], {})
            self.assertEqual(rows[0]["incident_type"], category)

    def test_projected_coordinates_require_explicit_crs(self):
        record = self.record()
        record[1], record[4], record[5], record[6] = "2026-05-11 13:54:46", "2792851.872", "6240057.303", "\u0627\u0644\u062a\u0633\u0644\u0644"
        with self.assertRaisesRegex(ValueError, "verified source CRS"):
            clean_table([REQUIRED, record], {})
        _, rows = clean_table([REQUIRED, record], {}, "web-mercator")
        self.assertAlmostEqual(float(rows[0]["latitude"]), 24.321, places=2)
        self.assertAlmostEqual(float(rows[0]["longitude"]), 56.055, places=2)
        self.assertEqual(rows[0]["incident_date"], "2026-05-11")
        self.assertEqual(rows[0]["incident_type"], "\u062a\u0633\u0644\u0644")
        for field in (4, 5):
            for value in ("NaN", "Infinity", "20037509", "-20037509"):
                invalid = record.copy()
                invalid[field] = value
                with self.assertRaises(ValueError):
                    clean_table([REQUIRED, invalid], {}, "web-mercator")

    def test_web_mercator_origin_and_negative_coordinates(self):
        record = self.record()
        for latitude, longitude in (("0", "0"), ("-2792851.872", "-6240057.303")):
            record[4], record[5] = latitude, longitude
            _, rows = clean_table([REQUIRED, record], {}, "web-mercator")
            if latitude == "0":
                self.assertEqual(float(rows[0]["latitude"]), 0)
                self.assertEqual(float(rows[0]["longitude"]), 0)
            else:
                self.assertAlmostEqual(float(rows[0]["latitude"]), -24.321, places=2)
                self.assertAlmostEqual(float(rows[0]["longitude"]), -56.055, places=2)

    def test_csv_cli_and_app_importer(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.csv", Path(directory) / "clean.csv"
            with source.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle)
                writer.writerows([REQUIRED, self.record()])
            original = source.read_bytes()
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(source), str(output)]), 0)
            self.assertEqual(source.read_bytes(), original)
            self.assertTrue(output.read_bytes().startswith(b"\xef\xbb\xbf"))
            self.assertIn(self.record()[2], output.read_text(encoding="utf-8-sig"))
            result = subprocess.run([
                "node", "--input-type=module", "-e",
                "import { readFileSync } from 'node:fs'; "
                "import { parseIncidentCsv } from './src/lib/analytics/csvImport.js'; "
                "const result = await parseIncidentCsv({text: async () => readFileSync(process.argv[1], 'utf8')}); "
                "console.log(JSON.stringify(result));", str(output),
            ], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, check=True)
            result = json.loads(result.stdout)
            self.assertEqual(result["errors"], [])
            self.assertEqual(len(result["rows"]), 1)
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(main([str(source), str(output)]), 1)

    def test_invalid_input_does_not_write_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.csv", Path(directory) / "clean.csv"
            source.write_text(",".join(REQUIRED) + "\n" + ",".join(self.record()).replace("23-06-2025", "31-02-2025"), encoding="utf-8")
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(main([str(source), str(output)]), 1)
            self.assertFalse(output.exists())

    def test_projected_csv_cli_and_app_importer(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.csv", Path(directory) / "clean.csv"
            record = self.record()
            record[1], record[4], record[5], record[6] = "2026-05-11 13:54:46", "2792851.872", "6240057.303", "\u0627\u0644\u062a\u0633\u0644\u0644"
            with source.open("w", encoding="utf-8", newline="") as handle:
                csv.writer(handle).writerows([REQUIRED, record])
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(main([str(source), str(output)]), 1)
            self.assertFalse(output.exists())
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(source), str(output), "--coordinate-system", "web-mercator"]), 0)
            result = subprocess.run([
                "node", "--input-type=module", "-e",
                "import { readFileSync } from 'node:fs'; "
                "import { parseIncidentCsv } from './src/lib/analytics/csvImport.js'; "
                "const result = await parseIncidentCsv({text: async () => readFileSync(process.argv[1], 'utf8')}); "
                "console.log(JSON.stringify(result));", str(output),
            ], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, check=True)
            imported = json.loads(result.stdout)
            self.assertEqual(imported["errors"], [])
            self.assertEqual(len(imported["rows"]), 1)

    def test_legacy_csv_encoding_delimiter_and_mapping(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.csv", Path(directory) / "clean.csv"
            mapping = Path(directory) / "columns.json"
            headers = list(REQUIRED)
            headers[1] = "\u0627\u0644\u062a\u0627\u0631\u064a\u062e"
            mapping.write_text(json.dumps({headers[1]: "incident_date"}), encoding="utf-8")
            record = self.record()
            record[4], record[7] = "24.3", "3"
            with source.open("w", encoding="cp1256", newline="") as handle:
                csv.writer(handle, delimiter=";").writerows([headers, record])
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(source), str(output), "--encoding", "cp1256", "--delimiter", ";", "--column-map", str(mapping)]), 0)
            with output.open(encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(rows[0]["location_name"], record[2])
            self.assertEqual(rows[0]["incident_date"], "2025-06-23")

    def test_excel_conversion(self):
        try:
            from openpyxl import Workbook
        except ImportError:
            self.skipTest("openpyxl is not installed")
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.xlsx", Path(directory) / "clean.csv"
            workbook = Workbook()
            workbook.active.append(list(REQUIRED))
            record = self.record()
            record[1] = datetime(2025, 6, 23, 13, 2)
            workbook.active.append(record)
            workbook.save(source)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(source), str(output)]), 0)
            with output.open(encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(rows[0]["incident_date"], "2025-06-23")
            self.assertEqual(rows[0]["location_name"], record[2])

    def test_excel_sheet_selection_and_formula_rejection(self):
        try:
            from openpyxl import Workbook
        except ImportError:
            self.skipTest("openpyxl is not installed")
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.xlsx", Path(directory) / "clean.csv"
            workbook = Workbook()
            worksheet = workbook.create_sheet("Incidents")
            worksheet.append(list(REQUIRED))
            worksheet.append(self.record())
            workbook.save(source)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(source), str(output), "--sheet", "Incidents"]), 0)
            worksheet["H2"] = "=1+2"
            workbook.save(source)
            output = output.with_name("formula.csv")
            with contextlib.redirect_stderr(io.StringIO()) as errors:
                self.assertEqual(main([str(source), str(output), "--sheet", "Incidents"]), 1)
            self.assertIn("H2", errors.getvalue())
            self.assertFalse(output.exists())

    def test_shipped_excel_mock(self):
        source = Path(__file__).resolve().parents[1] / "public" / "mock-incidents.xlsx"
        expected = source.with_name("mock-incidents-clean.csv")
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "clean.csv"
            original = source.read_bytes()
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(source), str(output), "--sheet", "Incidents", "--coordinate-system", "web-mercator"]), 0)
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(output.read_bytes(), expected.read_bytes())
            with output.open(encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 120)
            self.assertEqual(len({row["incident_id"] for row in rows}), 120)
            self.assertEqual(rows[4]["incident_date"], "2026-05-11")
            self.assertEqual(rows[4]["latitude"], "24.32328749")
            self.assertEqual(rows[4]["longitude"], "56.05538849")
            preview_output = Path(directory) / "preview.csv"
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main([str(source), str(preview_output), "--sheet", "WGS84 Preview"]), 0)
            self.assertEqual(preview_output.read_bytes(), expected.read_bytes())


class PowerShellCleaningTests(unittest.TestCase):
    record = CleaningTests.record

    @classmethod
    def setUpClass(cls):
        cls.executable = os.environ.get("POWERSHELL_EXE") or shutil.which("pwsh") or shutil.which("powershell.exe")
        if not cls.executable:
            raise unittest.SkipTest("PowerShell is not available; set POWERSHELL_EXE to test it")

    def invoke(self, source, output, *options):
        script = Path(__file__).with_name("clean_incidents.ps1").resolve()
        return subprocess.run([
            self.executable, "-NoProfile", "-File", str(script),
            "-InputPath", str(source), "-OutputPath", str(output), *options,
        ], capture_output=True, text=True, encoding="utf-8")

    def test_shipped_excel_mock(self):
        source = Path(__file__).resolve().parents[1] / "public" / "mock-incidents.xlsx"
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "clean.csv"
            result = self.invoke(source, output, "-Sheet", "Incidents", "-CoordinateSystem", "web-mercator")
            self.assertEqual(result.returncode, 0, result.stderr)
            with output.open(encoding="utf-8-sig", newline="") as handle:
                actual = list(csv.DictReader(handle))
            with source.with_name("mock-incidents-clean.csv").open(encoding="utf-8-sig", newline="") as handle:
                expected = list(csv.DictReader(handle))
            self.assertEqual(actual, expected)
            preview_output = Path(directory) / "preview.csv"
            result = self.invoke(source, preview_output, "-Sheet", "WGS84 Preview")
            self.assertEqual(result.returncode, 0, result.stderr)
            with preview_output.open(encoding="utf-8-sig", newline="") as handle:
                self.assertEqual(list(csv.DictReader(handle)), expected)

    def test_csv_arabic_mapping_and_app_importer(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.csv", Path(directory) / "clean.csv"
            mapping = Path(directory) / "columns.json"
            headers = list(REQUIRED) + ["details"]
            headers[1] = "\u0627\u0644\u062a\u0627\u0631\u064a\u062e"
            mapping.write_text(json.dumps({headers[1]: "incident_date"}), encoding="utf-8")
            details = 'Arabic text, "quoted"\nnext line'
            with source.open("w", encoding="utf-8", newline="") as handle:
                csv.writer(handle).writerows([headers, self.record() + [details]])
            original = source.read_bytes()
            result = self.invoke(source, output, "-ColumnMap", str(mapping))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(source.read_bytes(), original)
            self.assertTrue(output.read_bytes().startswith(b"\xef\xbb\xbf"))
            with output.open(encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(rows[0]["incident_date"], "2025-06-23")
            self.assertEqual(rows[0]["latitude"], "24.3")
            self.assertEqual(rows[0]["detained_count"], "3")
            self.assertEqual(rows[0]["location_name"], self.record()[2])
            self.assertEqual(rows[0]["details"], details)
            result = subprocess.run([
                "node", "--input-type=module", "-e",
                "import { readFileSync } from 'node:fs'; "
                "import { parseIncidentCsv } from './src/lib/analytics/csvImport.js'; "
                "const result = await parseIncidentCsv({text: async () => readFileSync(process.argv[1], 'utf8')}); "
                "console.log(JSON.stringify(result));", str(output),
            ], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(result.stdout)["errors"], [])
            self.assertNotEqual(self.invoke(source, output).returncode, 0)

    def test_invalid_records_do_not_write_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.csv", Path(directory) / "clean.csv"
            for field, value in (("incident_date", "31-02-2025"), ("latitude", "91"), ("detained_count", "-1"), ("detained_count", "1.5"), ("location_name", "???"), ("incident_type", "unknown")):
                record = self.record()
                record[list(REQUIRED).index(field)] = value
                with source.open("w", encoding="utf-8", newline="") as handle:
                    csv.writer(handle).writerows([REQUIRED, record])
                result = self.invoke(source, output)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(field, result.stderr)
                self.assertFalse(output.exists())

    def test_projected_coordinates_and_definite_article(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.csv", Path(directory) / "clean.csv"
            for category in ("\u062a\u0647\u0631\u064a\u0628", "\u062a\u0633\u0644\u0644"):
                record = self.record()
                record[4], record[5], record[6] = "2792851.872", "6240057.303", "\u0627\u0644" + category
                with source.open("w", encoding="utf-8", newline="") as handle:
                    csv.writer(handle).writerows([REQUIRED, record])
                result = self.invoke(source, output)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("verified source CRS", result.stderr)
                self.assertNotIn("incident_type:", result.stderr)
                self.assertFalse(output.exists())
                result = self.invoke(source, output, "-CoordinateSystem", "web-mercator")
                self.assertEqual(result.returncode, 0, result.stderr)
                with output.open(encoding="utf-8-sig", newline="") as handle:
                    row = next(csv.DictReader(handle))
                self.assertAlmostEqual(float(row["latitude"]), 24.321, places=2)
                self.assertAlmostEqual(float(row["longitude"]), 56.055, places=2)
                self.assertEqual(row["incident_type"], category)
                self.assertEqual(row["detained_count"], "3")
                output.unlink()

    def test_legacy_encoding(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "source.csv", Path(directory) / "clean.csv"
            record = self.record()
            record[4], record[7] = "24.3", "3"
            with source.open("w", encoding="cp1256", newline="") as handle:
                csv.writer(handle, delimiter=";").writerows([REQUIRED, record])
            result = self.invoke(source, output, "-CodePage", "1256", "-Delimiter", ";")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(record[2], output.read_text(encoding="utf-8-sig"))

    def test_xlsx_dates_and_formula_rejection(self):
        try:
            from openpyxl import Workbook
            from openpyxl.utils.datetime import CALENDAR_MAC_1904
        except ImportError:
            self.skipTest("openpyxl is required only for generating Excel test fixtures")
        with tempfile.TemporaryDirectory() as directory:
            for calendar in (None, CALENDAR_MAC_1904):
                source, output = Path(directory) / "source.xlsx", Path(directory) / f"clean-{calendar is None}.csv"
                workbook = Workbook()
                if calendar:
                    workbook.epoch = calendar
                worksheet = workbook.create_sheet("Incidents")
                worksheet.append(list(REQUIRED))
                record = self.record()
                record[1] = datetime(2025, 6, 23, 13, 2)
                worksheet.append(record)
                workbook.save(source)
                result = self.invoke(source, output, "-Sheet", "Incidents")
                self.assertEqual(result.returncode, 0, result.stderr)
                with output.open(encoding="utf-8-sig", newline="") as handle:
                    rows = list(csv.DictReader(handle))
                self.assertEqual(rows[0]["incident_date"], "2025-06-23")
                self.assertEqual(rows[0]["location_name"], record[2])
                worksheet["H2"] = "=1+2"
                workbook.save(source)
                formula_output = output.with_name("formula.csv")
                result = self.invoke(source, formula_output, "-Sheet", "Incidents")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("H2", result.stderr)
                self.assertFalse(formula_output.exists())


if __name__ == "__main__":
    unittest.main()