param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [string]$ColumnMap,
    [string]$Sheet,
    [int]$CodePage = 65001,
    [string]$Delimiter = ','
)

$ErrorActionPreference = 'Stop'
$culture = [Globalization.CultureInfo]::InvariantCulture

function Convert-Digits([string]$Value) {
    $result = [Text.StringBuilder]::new()
    foreach ($character in $Value.ToCharArray()) {
        $code = [int]$character
        if ($code -ge 0x660 -and $code -le 0x669) { $character = [char](48 + $code - 0x660) }
        if ($code -ge 0x6f0 -and $code -le 0x6f9) { $character = [char](48 + $code - 0x6f0) }
        [void]$result.Append($character)
    }
    return $result.ToString()
}

function Convert-IncidentDate($Value) {
    if ($Value -is [datetime]) { return $Value.ToString('yyyy-MM-dd', $culture) }
    $valueText = Convert-Digits ([string]$Value).Trim()
    if ($valueText -notmatch '^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})(?:[ T].*)?$') {
        throw 'expected a Gregorian YYYY-MM-DD or DD-MM-YYYY date (slashes also accepted)'
    }
    $dateText = $Matches[1].Replace('/', '-')
    $formats = [string[]]@('yyyy-M-d', 'd-M-yyyy')
    return [datetime]::ParseExact($dateText, $formats, $culture, [Globalization.DateTimeStyles]::None).ToString('yyyy-MM-dd', $culture)
}

function Convert-IncidentNumber([string]$Value, [string]$Field) {
    $valueText = (Convert-Digits $Value).Replace([string][char]0x66b, '.').Replace([string][char]0x66c, '')
    $number = [decimal]0
    if (-not [decimal]::TryParse($valueText, [Globalization.NumberStyles]::Float, $culture, [ref]$number)) {
        throw 'expected a finite number; use a dot or Arabic decimal separator'
    }
    if ($Field -eq 'detained_count') {
        if ($number -lt 0 -or [decimal]::Truncate($number) -ne $number -or $number -gt 9007199254740991) {
            throw 'must be a non-negative whole number within the safe integer range'
        }
        return $number.ToString('0', $culture)
    }
    $limit = 180
    if ($Field -eq 'latitude') { $limit = 90 }
    if ([math]::Abs($number) -gt $limit) { throw "must be between -$limit and $limit" }
    return $number.ToString($culture)
}

function Read-ZipXml($Archive, [string]$Name) {
    $entry = $Archive.GetEntry($Name)
    if ($null -eq $entry) { throw "Excel component missing: $Name" }
    $stream = $entry.Open()
    $settings = [Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $reader = [Xml.XmlReader]::Create($stream, $settings)
    try {
        $document = [Xml.XmlDocument]::new()
        $document.XmlResolver = $null
        $document.PreserveWhitespace = $true
        $document.Load($reader)
        return ,$document
    } finally {
        $reader.Dispose()
        $stream.Dispose()
    }
}

function Read-ExcelRows([string]$Path) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $workbook = Read-ZipXml $archive 'xl/workbook.xml'
        $sheets = @($workbook.SelectNodes("/*[local-name()='workbook']/*[local-name()='sheets']/*[local-name()='sheet']"))
        if ($Sheet) { $sheets = @($sheets | Where-Object { $_.GetAttribute('name') -ceq $Sheet }) }
        if ($sheets.Count -eq 0) { throw 'No matching Excel worksheet found' }
        $relationshipId = $sheets[0].GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
        $relationships = Read-ZipXml $archive 'xl/_rels/workbook.xml.rels'
        $relationship = @($relationships.DocumentElement.ChildNodes | Where-Object { $_.GetAttribute('Id') -ceq $relationshipId })
        if ($relationship.Count -ne 1 -or $relationship[0].GetAttribute('TargetMode') -eq 'External') {
            throw 'Unsupported worksheet relationship'
        }
        $worksheetUri = [uri]::new([uri]'http://local/xl/workbook.xml', $relationship[0].GetAttribute('Target'))
        if ($worksheetUri.Host -ne 'local') { throw 'External worksheets are not supported' }
        $worksheet = Read-ZipXml $archive $worksheetUri.AbsolutePath.TrimStart('/')
        $strings = [Collections.Generic.List[string]]::new()
        if ($null -ne $archive.GetEntry('xl/sharedStrings.xml')) {
            $shared = Read-ZipXml $archive 'xl/sharedStrings.xml'
            foreach ($item in $shared.DocumentElement.ChildNodes) {
                $parts = @($item.SelectNodes(".//*[local-name()='t' and not(ancestor::*[local-name()='rPh'])]") | ForEach-Object { $_.InnerText })
                $strings.Add(($parts -join ''))
            }
        }
        $dateStyles = @{}
        if ($null -ne $archive.GetEntry('xl/styles.xml')) {
            $styles = Read-ZipXml $archive 'xl/styles.xml'
            $customFormats = @{}
            foreach ($format in $styles.SelectNodes("//*[local-name()='numFmt']")) {
                $customFormats[[int]$format.GetAttribute('numFmtId')] = $format.GetAttribute('formatCode')
            }
            $styleIndex = 0
            foreach ($style in $styles.SelectNodes("/*[local-name()='styleSheet']/*[local-name()='cellXfs']/*[local-name()='xf']")) {
                $formatId = [int]$style.GetAttribute('numFmtId')
                $isDate = ($formatId -ge 14 -and $formatId -le 22) -or ($formatId -ge 27 -and $formatId -le 36) -or ($formatId -ge 50 -and $formatId -le 58)
                if ($customFormats.ContainsKey($formatId)) {
                    $formatText = $customFormats[$formatId] -replace '"[^"]*"|\\.|\[[^\]]*\]', ''
                    $isDate = $formatText -match '[dy]'
                }
                if ($isDate) { $dateStyles[$styleIndex] = $true }
                $styleIndex++
            }
        }
        $properties = $workbook.SelectSingleNode("/*[local-name()='workbook']/*[local-name()='workbookPr']")
        $date1904 = $null -ne $properties -and $properties.GetAttribute('date1904') -in @('1', 'true')
        foreach ($row in $worksheet.SelectNodes("//*[local-name()='sheetData']/*[local-name()='row']")) {
            $cells = @{}
            foreach ($cell in $row.SelectNodes("./*[local-name()='c']")) {
                $reference = $cell.GetAttribute('r')
                if ($reference -notmatch '^([A-Z]+)[0-9]+$') { throw 'Unsupported Excel cell reference' }
                $columnIndex = 0
                foreach ($letter in $Matches[1].ToCharArray()) { $columnIndex = $columnIndex * 26 + [int]$letter - 64 }
                if ($columnIndex -gt 16384) { throw 'Excel column is out of range' }
                $type = $cell.GetAttribute('t')
                if ($type -eq 'e' -or $null -ne $cell.SelectSingleNode("./*[local-name()='f']")) {
                    throw "Excel cell ${reference}: replace formulas/errors with verified values first"
                }
                $valueNode = $cell.SelectSingleNode("./*[local-name()='v']")
                $value = ''
                if ($null -ne $valueNode) { $value = $valueNode.InnerText }
                if ($type -eq 's') { $value = $strings[[int]$value] }
                elseif ($type -eq 'inlineStr') {
                    $value = @($cell.SelectNodes(".//*[local-name()='t' and not(ancestor::*[local-name()='rPh'])]") | ForEach-Object { $_.InnerText }) -join ''
                }
                elseif ($type -in @('', 'n') -and $value -ne '' -and $dateStyles.ContainsKey([int]$cell.GetAttribute('s'))) {
                    $serial = [double]::Parse($value, $culture)
                    if ($date1904) { $serial += 1462 }
                    elseif ($serial -ge 60 -and $serial -lt 61) { throw "Excel cell ${reference}: invalid 1900 leap day" }
                    elseif ($serial -lt 60) { $serial++ }
                    $value = [datetime]::FromOADate($serial)
                }
                if ([string]$value -ne '') { $cells[$columnIndex - 1] = $value }
            }
            if ($cells.Count -gt 0) {
                [pscustomobject]@{ Number = [int]$row.GetAttribute('r'); Cells = $cells }
            }
        }
    } finally { $archive.Dispose() }
}

function Read-CsvRows([string]$Path) {
    Add-Type -AssemblyName Microsoft.VisualBasic
    $encoding = [Text.Encoding]::GetEncoding($CodePage, [Text.EncoderFallback]::ExceptionFallback, [Text.DecoderFallback]::ExceptionFallback)
    $parser = [Microsoft.VisualBasic.FileIO.TextFieldParser]::new($Path, $encoding, $true)
    try {
        $parser.SetDelimiters([string[]]@($Delimiter))
        $parser.HasFieldsEnclosedInQuotes = $true
        $parser.TrimWhiteSpace = $false
        while (-not $parser.EndOfData) {
            $number = $parser.LineNumber
            $values = $parser.ReadFields()
            $cells = @{}
            for ($index = 0; $index -lt $values.Length; $index++) { $cells[$index] = $values[$index] }
            [pscustomobject]@{ Number = $number; Cells = $cells; Width = $values.Length }
        }
    } finally { $parser.Dispose() }
}

try {
    $source = (Resolve-Path -LiteralPath $InputPath).ProviderPath
    $destination = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
    if ($source -eq $destination -or [IO.File]::Exists($destination)) { throw 'Output must be a new file, different from the source' }
    if ([IO.Path]::GetExtension($destination) -ine '.csv') { throw 'Output filename must end in .csv' }
    if ($Delimiter.Length -ne 1) { throw 'Delimiter must be one character' }
    $mapping = @{}
    if ($ColumnMap) {
        $mapText = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $ColumnMap).ProviderPath, [Text.UTF8Encoding]::new($false, $true))
        $mapObject = ConvertFrom-Json $mapText
        if ($mapObject -isnot [pscustomobject]) { throw 'Column map must be a JSON object' }
        foreach ($property in $mapObject.PSObject.Properties) {
            if ($property.Value -isnot [string] -or -not $property.Value.Trim()) { throw 'Column map targets must be non-empty strings' }
            $mapping[$property.Name] = $property.Value
        }
    }
    $extension = [IO.Path]::GetExtension($source)
    if ($extension -ieq '.xlsx') { $table = @(Read-ExcelRows $source) }
    elseif ($extension -ieq '.csv') {
        if ($Sheet) { throw 'Sheet is only supported for Excel files' }
        $table = @(Read-CsvRows $source)
    }
    else { throw 'Input must be .xlsx or .csv; save legacy .xls as .xlsx first' }
    if ($table.Count -lt 2) { throw 'Input must contain a header and incident records' }
    $width = 1 + ($table[0].Cells.Keys | Measure-Object -Maximum).Maximum
    $headers = @()
    for ($index = 0; $index -lt $width; $index++) {
        $header = ([string]$table[0].Cells[$index]).Trim().TrimStart([char]0xfeff)
        if ($mapping.ContainsKey($header)) { $header = $mapping[$header] }
        if (-not $header -or $headers -contains $header) { throw 'Headers must be non-empty and unique after mapping' }
        $headers += $header
    }
    $required = @('incident_id', 'incident_date', 'location_name', 'governorate', 'latitude', 'longitude', 'incident_type', 'detained_count')
    foreach ($field in $required) {
        if ($headers -cnotcontains $field) { throw "Missing required column after mapping: $field" }
    }
    $types = @(
        -join ([char[]]@(0x62a, 0x647, 0x631, 0x64a, 0x628))
        -join ([char[]]@(0x62a, 0x633, 0x644, 0x644))
    )
    $cleaned = [Collections.Generic.List[object]]::new()
    $problems = [Collections.Generic.List[string]]::new()
    foreach ($record in $table[1..($table.Count - 1)]) {
        if (($record.Cells.Values | Where-Object { ([string]$_).Trim() }).Count -eq 0) { continue }
        $number = $record.Number
        if (($record.PSObject.Properties.Name -contains 'Width' -and $record.Width -ne $width) -or @($record.Cells.Keys | Where-Object { $_ -ge $width }).Count -gt 0) {
            $problems.Add("Row ${number}: column count does not match the header")
            continue
        }
        $row = [ordered]@{}
        for ($index = 0; $index -lt $width; $index++) {
            $value = ([string]$record.Cells[$index]).Trim()
            $row[$headers[$index]] = $value
            if ($value.Contains('???') -or $value.Contains([string][char]0xfffd)) { $problems.Add("Row ${number}, $($headers[$index]): possible lost text; recover from original workbook") }
        }
        foreach ($field in $required) {
            if (-not $row[$field]) { $problems.Add("Row ${number}, ${field}: required value is missing") }
        }
        try { $row['incident_date'] = Convert-IncidentDate $record.Cells[[array]::IndexOf($headers, 'incident_date')] }
        catch { $problems.Add("Row ${number}, incident_date: $($_.Exception.Message)") }
        foreach ($field in @('latitude', 'longitude', 'detained_count')) {
            try { $row[$field] = Convert-IncidentNumber $row[$field] $field }
            catch { $problems.Add("Row ${number}, ${field}: $($_.Exception.Message)") }
        }
        if ($types -cnotcontains $row['incident_type']) { $problems.Add("Row ${number}, incident_type: must be the Arabic value for smuggling or infiltration") }
        $cleaned.Add([pscustomobject]$row)
    }
    if ($cleaned.Count -eq 0 -and $problems.Count -eq 0) { throw 'Input has no incident records' }
    if ($problems.Count -gt 0) { throw ("No output written. Fix these issues and rerun:`n" + ($problems -join "`n")) }
    $csv = @($cleaned | ConvertTo-Csv -NoTypeInformation -Delimiter ',')
    $stream = [IO.File]::Open($destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    $writer = [IO.StreamWriter]::new($stream, [Text.UTF8Encoding]::new($true))
    try { foreach ($line in $csv) { $writer.WriteLine($line) } }
    finally { $writer.Dispose(); $stream.Dispose() }
    Write-Output "Saved $($cleaned.Count) records as UTF-8 CSV: $destination"
    exit 0
} catch {
    [Console]::Error.WriteLine("Cleaning failed: $($_.Exception.Message)")
    exit 1
}