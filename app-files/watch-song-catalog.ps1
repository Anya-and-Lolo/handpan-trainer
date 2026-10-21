$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$demoDirectory = Join-Path $projectRoot 'demo-songs'
$catalogPath = Join-Path $PSScriptRoot 'song-catalog.js'

New-Item -ItemType Directory -Path $demoDirectory -Force | Out-Null

function Get-SongSlug([string] $name) {
  $slug = $name.ToLowerInvariant() -replace '[^a-z0-9]+', '-'
  return $slug.Trim('-')
}

function Read-SongFolder([string] $directory) {
  $songs = @()
  Get-ChildItem -LiteralPath $directory -Filter '*.handsong' -File |
    Sort-Object Name |
    ForEach-Object {
      try {
        $document = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        $song = $document.song
        if ($null -eq $song -or -not $song.title -or -not $song.sequence -or -not $song.bpm) {
          Write-Warning "Skipped $($_.Name): the file does not contain a complete song."
          return
        }
        $song | Add-Member -NotePropertyName id -NotePropertyValue ('demo-' + (Get-SongSlug $_.BaseName)) -Force
        $song | Add-Member -NotePropertyName builtIn -NotePropertyValue $true -Force
        $song | Add-Member -NotePropertyName folder -NotePropertyValue 'demo' -Force
        if (-not $song.order) { $song | Add-Member -NotePropertyName order -NotePropertyValue 999 -Force }
        $songs += $song
      }
      catch {
        Write-Warning "Skipped $($_.Name): $($_.Exception.Message)"
      }
    }
  return @($songs | Sort-Object order, title)
}

function Write-SongCatalog {
  $songs = @(Read-SongFolder $demoDirectory)
  $json = if ($songs.Count) { ConvertTo-Json -InputObject @($songs) -Depth 20 -Compress } else { '[]' }
  $version = [DateTime]::UtcNow.Ticks.ToString()
  $javascript = "window.HANDPAN_CATALOG_VERSION = '$version';`r`nwindow.HANDPAN_DEMO_SONGS = $json;"
  [System.IO.File]::WriteAllText($catalogPath, $javascript, [System.Text.UTF8Encoding]::new($false))
  Write-Host "Song catalogue updated: $($songs.Count) demo song(s)." -ForegroundColor Green
}

Write-SongCatalog
Write-Host ''
Write-Host 'Watching the demo-songs folder for .handsong files.' -ForegroundColor Cyan
Write-Host 'Keep this window open while using the trainer. Press Ctrl+C to stop.'
Write-Host ''
Start-Process (Join-Path $projectRoot 'index.html')

$watcher = [System.IO.FileSystemWatcher]::new($demoDirectory, '*.handsong')
$watcher.IncludeSubdirectories = $false
$watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, CreationTime'
$watcher.EnableRaisingEvents = $true
$registrations = @(
  Register-ObjectEvent -InputObject $watcher -EventName Created
  Register-ObjectEvent -InputObject $watcher -EventName Changed
  Register-ObjectEvent -InputObject $watcher -EventName Deleted
  Register-ObjectEvent -InputObject $watcher -EventName Renamed
)

try {
  while ($true) {
    $event = Wait-Event -Timeout 1
    if ($null -ne $event) {
      Get-Event | Remove-Event
      Start-Sleep -Milliseconds 250
      Write-SongCatalog
    }
  }
}
finally {
  $registrations | ForEach-Object { Unregister-Event -SubscriptionId $_.SubscriptionId -ErrorAction SilentlyContinue }
  $watcher.Dispose()
}
