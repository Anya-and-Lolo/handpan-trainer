$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$demoDirectory = Join-Path $projectRoot 'demo-songs'
$communityDirectory = Join-Path $projectRoot 'community-songs'
$catalogPath = Join-Path $PSScriptRoot 'song-catalog.js'

New-Item -ItemType Directory -Path $demoDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $communityDirectory -Force | Out-Null

function Get-SongSlug([string] $name) {
  $slug = $name.ToLowerInvariant() -replace '[^a-z0-9]+', '-'
  return $slug.Trim('-')
}

function Read-SongFolder([string] $directory, [string] $folder = 'demo') {
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
        $song | Add-Member -NotePropertyName id -NotePropertyValue ($folder + '-' + (Get-SongSlug $_.BaseName)) -Force
        $song | Add-Member -NotePropertyName builtIn -NotePropertyValue $true -Force
        $song | Add-Member -NotePropertyName folder -NotePropertyValue $folder -Force
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
  $songs = @(Read-SongFolder $demoDirectory 'demo')
  $community = @(Read-SongFolder $communityDirectory 'community')
  $json = if ($songs.Count) { ConvertTo-Json -InputObject @($songs) -Depth 20 -Compress } else { '[]' }
  $communityJson = if ($community.Count) { ConvertTo-Json -InputObject @($community) -Depth 20 -Compress } else { '[]' }
  $version = [DateTime]::UtcNow.Ticks.ToString()
  $javascript = "window.HANDPAN_CATALOG_VERSION = '$version';`r`nwindow.HANDPAN_DEMO_SONGS = $json;`r`nwindow.HANDPAN_COMMUNITY_SONGS = $communityJson;"
  [System.IO.File]::WriteAllText($catalogPath, $javascript, [System.Text.UTF8Encoding]::new($false))
  Write-Host "Song catalogue updated: $($songs.Count) demo, $($community.Count) community song(s)." -ForegroundColor Green
}

Write-SongCatalog
Write-Host ''
Write-Host 'Watching the demo-songs and community-songs folders for .handsong files.' -ForegroundColor Cyan
Write-Host 'Keep this window open while using the trainer. Press Ctrl+C to stop.'
Write-Host ''
Start-Process (Join-Path $projectRoot 'index.html')

$watchers = @()
$registrations = @()
foreach ($directory in @($demoDirectory, $communityDirectory)) {
  $watcher = [System.IO.FileSystemWatcher]::new($directory, '*.handsong')
  $watcher.IncludeSubdirectories = $false
  $watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, CreationTime'
  $watcher.EnableRaisingEvents = $true
  $watchers += $watcher
  $registrations += Register-ObjectEvent -InputObject $watcher -EventName Created
  $registrations += Register-ObjectEvent -InputObject $watcher -EventName Changed
  $registrations += Register-ObjectEvent -InputObject $watcher -EventName Deleted
  $registrations += Register-ObjectEvent -InputObject $watcher -EventName Renamed
}

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
  $watchers | ForEach-Object { $_.Dispose() }
}
