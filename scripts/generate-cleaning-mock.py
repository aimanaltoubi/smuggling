"""Generate a synthetic Excel workbook for the offline cleaning workflow."""

from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.table import Table, TableStyleInfo

from clean_incidents import REQUIRED, clean_number


RECORD_COUNT = 120


def main():
    destination = Path(__file__).resolve().parents[1] / "public" / "mock-incidents.xlsx"
    if destination.exists():
        raise FileExistsError(f"Refusing to overwrite {destination}")
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Incidents"
    worksheet.append(list(REQUIRED) + ["ethnicity", "details"])
    worksheet["E1"].comment = Comment("Source N/Y northing in EPSG:3857 metres. Convert to latitude degrees; do not swap with easting.", "Incident Analytics")
    worksheet["F1"].comment = Comment("Source E/X easting in EPSG:3857 metres. Convert to longitude degrees; do not swap with northing.", "Incident Analytics")
    degree_sheet = workbook.create_sheet("WGS84 Preview")
    degree_sheet.append(list(REQUIRED) + ["ethnicity", "details"])
    categories = ("\u0627\u0644\u062a\u0633\u0644\u0644", "\u0627\u0644\u062a\u0647\u0631\u064a\u0628", "\u062a\u0633\u0644\u0644", "\u062a\u0647\u0631\u064a\u0628")
    for index in range(RECORD_COUNT):
        incident_date = datetime(2026, index % 12 + 1, 11 + index // 12, 13, 54, 46)
        if index == 4:
            incident_date = "2026-05-11 13:54:46"
        worksheet.append([
            f"{index + 1:04d}", incident_date,
            "\u0648\u0644\u0627\u064a\u0629 \u0645\u062d\u0636\u0629",
            "\u0645\u062d\u0627\u0641\u0638\u0629 \u0627\u0644\u0628\u0631\u064a\u0645\u064a - Al Buraymi Governorate",
            2792851.872, 6240057.303, categories[index % len(categories)],
            "\u0661" if index == 4 else index % 4 + 1,
            "\u0623\u062b\u064a\u0648\u0628\u064a\u0627",
            'Synthetic test record, "not operational".' if index != 11 else "Synthetic test record\nSecond line for CSV quoting.",
        ])
        degree_record = [cell.value for cell in worksheet[index + 2]]
        for column, field in ((4, "latitude"), (5, "longitude")):
            degree_record[column] = float(clean_number(degree_record[column], field, "web-mercator"))
        degree_sheet.append(degree_record)
        worksheet.cell(index + 2, 1).number_format = "@"
        worksheet.cell(index + 2, 2).number_format = "yyyy-mm-dd hh:mm:ss"
        degree_sheet.cell(index + 2, 1).number_format = "@"
        degree_sheet.cell(index + 2, 2).number_format = "yyyy-mm-dd hh:mm:ss"
        for column in (5, 6):
            worksheet.cell(index + 2, column).number_format = "0.000"
            degree_sheet.cell(index + 2, column).number_format = "0.00000000"
    worksheet.freeze_panes = "A2"
    degree_sheet.freeze_panes = "A2"
    table = Table(displayName="MockIncidents", ref=f"A1:J{RECORD_COUNT + 1}")
    table.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)
    worksheet.add_table(table)
    for column, width in zip("ABCDEFGHIJ", (16, 23, 24, 52, 20, 20, 19, 18, 18, 55)):
        worksheet.column_dimensions[column].width = width
        degree_sheet.column_dimensions[column].width = width
    for cell in worksheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="166534")
    for row in worksheet.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    notes = workbook.create_sheet("Read Me")
    for value in (
        "Synthetic cleaning mock - not operational data",
        f"The Incidents sheet has {RECORD_COUNT} synthetic records with the app's English headers.",
        "Source sheet Incidents uses EPSG:3857: latitude holds N/Y northing metres; longitude holds E/X easting metres. Do not swap the columns.",
        "The supplied coordinates are reused as a test fixture, not as proof of the real source CRS.",
        "Run the PowerShell cleaner with -Sheet Incidents -CoordinateSystem web-mercator.",
        f"Expected: {RECORD_COUNT} records, dates YYYY-MM-DD, canonical Arabic incident types, latitude 24.32328749 and longitude 56.05538849.",
        "WGS84 Preview contains already-converted degree values, not formulas. Clean that sheet with default WGS84 settings, without web-mercator conversion.",
        "The Windows PowerShell cleaner reads the local Excel file and converts locally with built-in math; no internet, Python, Excel installation, or extra packages are needed.",
        "Upload the generated CSV to the app, not this Excel workbook.",
        "For real data, confirm the source CRS before choosing a conversion.",
    ):
        notes.append([value])
    notes.column_dimensions["A"].width = 105
    for row in notes:
        row[0].alignment = Alignment(wrap_text=True, vertical="top")
        notes.row_dimensions[row[0].row].height = 32
    workbook.save(destination)
    workbook.close()
    print(f"Created {RECORD_COUNT} synthetic records: {destination}")


if __name__ == "__main__":
    main()