# Yeni sürüm yayınlar: derler, imzalar, latest.json üretir ve GitHub Release oluşturur.
# Kullanım:  powershell -File scripts\release.ps1 [-Notes "Sürüm notu"]
# Önce src-tauri\tauri.conf.json, src-tauri\Cargo.toml ve package.json içindeki sürümü artırın.
param([string]$Notes = "")
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:Path += ";$env:USERPROFILE\.cargo\bin"

$repo = "atifereny/yarikonomi"
$conf = Get-Content src-tauri\tauri.conf.json -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $conf.version
$tag = "v$version"

# İmza anahtarı depoda tutulmaz; kullanıcı klasöründe durur
$keyPath = Join-Path $env:USERPROFILE ".tauri\yarikonomi.key"
if (-not (Test-Path $keyPath)) { throw "İmza anahtarı bulunamadı: $keyPath" }
$env:TAURI_SIGNING_PRIVATE_KEY = $keyPath
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

npm test
if ($LASTEXITCODE) { throw "Testler başarısız" }
npm run tauri build
if ($LASTEXITCODE) { throw "Derleme başarısız" }

$dir = "src-tauri\target\release\bundle\nsis"
$src = Get-ChildItem $dir -Filter "$($conf.productName)_${version}_x64-setup.exe" | Select-Object -First 1
if (-not $src) { throw "Kurulum dosyası bulunamadı" }
# GitHub ASCII olmayan karakterleri dosya adından siler; ASCII adla yüklenir
$out = "release-out"
New-Item -ItemType Directory -Force $out | Out-Null
$exeName = "Yarikonomi_${version}_x64-setup.exe"
Copy-Item $src.FullName "$out\$exeName" -Force
$sig = Get-ChildItem $dir -Filter "$($conf.productName)_${version}_x64-setup.exe.sig" | Select-Object -First 1
if (-not $sig) { throw "İmza dosyası bulunamadı" }
Copy-Item $sig.FullName "$out\$exeName.sig" -Force

$latest = [ordered]@{
  version   = $version
  notes     = $Notes
  pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = (Get-Content "$out\$exeName.sig" -Raw).Trim()
      url       = "https://github.com/$repo/releases/download/$tag/$exeName"
    }
  }
}
[IO.File]::WriteAllText("$PWD\$out\latest.json", ($latest | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding $false))

$notesText = if ($Notes) { $Notes } else { "Yarıkonomi $version" }
gh release create $tag "$out\$exeName" "$out\$exeName.sig" "$out\latest.json" --repo $repo --title "Yarıkonomi $version" --notes $notesText
if ($LASTEXITCODE) { throw "Release oluşturulamadı" }
Write-Host "Yayınlandı: https://github.com/$repo/releases/tag/$tag"
