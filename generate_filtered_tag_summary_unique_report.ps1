param(
  [string]$InputDir = 'dist/PixivFiltered_2026-03-05',
  [string]$OutputFile,
  [string]$AllOutputFile
)

$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'generate_filtered_tag_summary_unique_report.js'
if (-not (Test-Path -Path $scriptPath)) {
  throw "Script not found: $scriptPath"
}

$nodeArgs = @($scriptPath, "--inputDir=$InputDir")
if ($OutputFile) {
  $nodeArgs += "--outputFile=$OutputFile"
}
if ($AllOutputFile) {
  $nodeArgs += "--allOutputFile=$AllOutputFile"
}

& node @nodeArgs
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
