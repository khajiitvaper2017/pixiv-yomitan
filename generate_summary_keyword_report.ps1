param(
  [string]$InputDir = 'dist/Pixiv_2026-03-05',
  [string]$OutputFile,
  [string]$DuplicateOutputFile,
  [string]$KeywordPattern
)

$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'generate_summary_keyword_report.js'
if (-not (Test-Path -Path $scriptPath)) {
  throw "Script not found: $scriptPath"
}

$nodeArgs = @($scriptPath, "--inputDir=$InputDir")
if ($OutputFile) {
  $nodeArgs += "--outputFile=$OutputFile"
}
if ($DuplicateOutputFile) {
  $nodeArgs += "--duplicateOutputFile=$DuplicateOutputFile"
}
if ($KeywordPattern) {
  $nodeArgs += "--keywordPattern=$KeywordPattern"
}

& node @nodeArgs
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
