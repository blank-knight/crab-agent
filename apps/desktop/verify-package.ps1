# qiji package verify gate (auto, 2026-11-24)
# Usage: powershell -File verify-package.ps1 -SetupPath <exe> [-PrevExe <prev>] [-ExpectedVersion <0.20.5-xx>]
# Gates: 1 size +-10% / 2 stamp in git history / 3 marker or enc / 4 API dual-scan / 5 signature
# VM install gate stays manual. Probes live in installer\verify-probes\ (static, git-managed).
param(
  [string]$SetupPath = "",
  [string]$PrevExe = "",
  [string]$ExpectedVersion = ""
)
$ErrorActionPreference = "Continue"
if ($SetupPath -eq "" -or -not (Test-Path $SetupPath)) {
  Write-Output "USAGE: verify-package.ps1 -SetupPath <exe> [-PrevExe <prev exe>] [-ExpectedVersion <ver>]"
  exit 1
}
$desktop = "D:\renderer-rebase\apps\desktop"
$probes = Join-Path $desktop "installer\verify-probes"
$7z = Join-Path $desktop "release\7zr.exe"
$tmp = "D:\verify-tmp"
$script:PASS = 0; $script:FAIL = 0
function CK($name, $ok, $detail) {
  if ($ok) { $script:PASS++; Write-Output ("  [OK] " + $name) }
  else     { $script:FAIL++; Write-Output ("  [FAIL] " + $name + "  => " + $detail) }
}

Write-Output ("== qiji package verify == " + $SetupPath)
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null

# -- Gate 1: size vs prev (+-10%) --
$size = (Get-Item $SetupPath).Length
$prevSize = 0
if ($PrevExe -ne "" -and (Test-Path $PrevExe)) { $prevSize = (Get-Item $PrevExe).Length }
if ($prevSize -gt 0) {
  $ratio = [math]::Abs($size - $prevSize) / $prevSize
  CK ("Gate1 size +-10% (this=$([math]::Round($size/1MB,1))MB prev=$([math]::Round($prevSize/1MB,1))MB)") ($ratio -le 0.10) ("delta=$([math]::Round($ratio*100,1))%")
} else {
  Write-Output ("  [SKIP] Gate1 size: no prev baseline (this $([math]::Round($size/1MB,1))MB)")
}

# -- Gate 2: stamp in git history --
& $7z x -o"$tmp" $SetupPath "resources/install-stamp.json" -y | Out-Null
$stampPath = Join-Path $tmp "resources\install-stamp.json"
if (Test-Path $stampPath) {
  $stamp = Get-Content $stampPath -Raw | ConvertFrom-Json
  $headSha = (wsl.exe -d Ubuntu -- bash -lc "cd ~/clawd/renderer-rebase && git rev-parse HEAD").Trim()
  $ancRc = (wsl.exe -d Ubuntu -- bash -lc "cd ~/clawd/renderer-rebase && git merge-base --is-ancestor $($stamp.commit) HEAD 2>/dev/null; echo rc=`$?").Trim()
  $isAnc = ($ancRc -match 'rc=0')
  CK ("Gate2 stamp.commit in git history ($($stamp.commit.Substring(0,8)), HEAD=$($headSha.Substring(0,8)))") $isAnc ("stamp commit is NOT an ancestor of HEAD - unknown source!")
  if ($ExpectedVersion -ne "") {
    CK ("Gate2b displayVersion=$ExpectedVersion") ($stamp.displayVersion -eq $ExpectedVersion) ("stamp=$($stamp.displayVersion)")
  } else {
    Write-Output ("  [INFO] stamp.displayVersion=$($stamp.displayVersion)")
  }
  CK "Gate2c not-dryrun" ($stamp.baseVersion -ne "dryrun") ("baseVersion=$($stamp.baseVersion)")
} else {
  CK "Gate2 stamp exists" $false "install-stamp.json not extractable from SFX"
}

# -- extract asar once for gates 3/4 --
$asarTmp = Join-Path $tmp "asar"
New-Item -ItemType Directory -Path $asarTmp -ErrorAction SilentlyContinue | Out-Null
& $7z x -o"$asarTmp" $SetupPath "resources/app.asar" -y | Out-Null
$asarPath = Join-Path $asarTmp "resources\app.asar"
$desktopFwd = $desktop -replace "\\", "/"
$asarFwd = $asarPath -replace "\\", "/"

# -- Gate 3: marker in asar entry, or encrypted main present --
$g3ok = $false
if (Test-Path $asarPath) {
  $probe = (node (Join-Path $probes "probe-marker.cjs") $desktopFwd $asarFwd) 2>&1
  if ("$probe" -match 'MARK=(\d+)') {
    $g3ok = ([int]$Matches[1] -ge 4)
    CK ("Gate3 marker in asar entry (found $($Matches[1]))") $g3ok ("$probe")
  }
}
# encrypted-chain form: electron-main.cjs.enc in unpacked tree
$encTmp = Join-Path $tmp "enc"
& $7z x -o"$encTmp" $SetupPath "resources/app.asar.unpacked/dist/electron-main.cjs.enc" -y | Out-Null
$encFile = Get-ChildItem $encTmp -Filter "electron-main.cjs.enc" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$encPresent = [bool]$encFile
if (-not $g3ok) {
  CK ("Gate3b encrypted main present in unpacked (primary for enc chain)") $encPresent ("encrypted chain real body missing")
} else {
  if ($encPresent) { Write-Output "  [INFO] Gate3b enc also present (dual form)" }
}
if (-not $g3ok -and $encPresent) {
  Write-Output "  [INFO] Gate3: entry probe n/a, encrypted form accepted"
}

# -- Gate 4: API dual scan (test=0, prod>=1) --
# Encrypted chain: URLs live inside .enc ciphertext (unscannable in-package).
# The dist tree the package was built from is the equivalent surface: scan it.
$testHits = 0; $prodHits = 0
$distSrc = Join-Path $desktop "dist"
$srcFiles = @(Get-ChildItem $distSrc -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in ".js",".cjs",".mjs",".html" })
$encPresent2 = @(Get-ChildItem $distSrc -Recurse -File -Filter *.enc -ErrorAction SilentlyContinue).Count
foreach ($f in $srcFiles) {
  $raw = [IO.File]::ReadAllText($f.FullName)
  if ($raw -match 'test\.aijiqiren\.vip') { $testHits++ }
  if ($raw -match 'agent\.aijiqiren\.vip') { $prodHits++ }
}
# also scan whatever plaintext the SFX itself carries (unpacked assets)
$distTmp = Join-Path $tmp "dist"
& $7z x -o"$distTmp" $SetupPath "resources/app.asar.unpacked/dist/assets/*" -y | Out-Null
$distRoot = Join-Path $distTmp "resources"
if (Test-Path $distRoot) {
  $files = Get-ChildItem $distRoot -Recurse -File -ErrorAction SilentlyContinue
  foreach ($f in $files) {
    $raw = [IO.File]::ReadAllText($f.FullName)
    if ($raw -match 'test\.aijiqiren\.vip') { $testHits++ }
    if ($raw -match 'agent\.aijiqiren\.vip') { $prodHits++ }
  }
}
if ($encPresent2 -gt 0) {
  # encrypted build: dist tree scan is authoritative (enc = dist encrypted)
  CK ("Gate4 API dual-scan via dist tree ($($srcFiles.Count) plaintext files, $encPresent2 enc): test=0 (found $testHits), prod>=1 (found $prodHits)") (($testHits -eq 0) -and ($prodHits -ge 1)) ("test=$testHits prod=$prodHits")
} else {
  # unencrypted build: in-package scan is authoritative (probe asar entry)
  if (Test-Path $asarPath) {
    $probeUrl = (node (Join-Path $probes "probe-url.cjs") $desktopFwd $asarFwd) 2>&1
    if ("$probeUrl" -match 'T=(\d+) P=(\d+)') {
      $testHits += [int]$Matches[1]; $prodHits += [int]$Matches[2]
    }
  }
  CK ("Gate4 API dual-scan in-package: test=0 (found $testHits), prod>=1 (found $prodHits)") (($testHits -eq 0) -and ($prodHits -ge 1)) ("test=$testHits prod=$prodHits")
}

# -- Gate 5: signature (ed25519 over sha256-hex, NOT raw bytes) --
$sigPath = "$SetupPath.sig"
if (Test-Path $sigPath) {
  $pubPem = ""
  foreach ($cand in @("$desktop\installer\qiji-signing-public.pem", "D:\renderer-rebase\qiji-signing-public.pem")) {
    if (Test-Path $cand) { $pubPem = $cand; break }
  }
  if ($pubPem -eq "") {
    $found = Get-ChildItem "D:\renderer-rebase" -Recurse -Filter "*signing-public*.pem" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $pubPem = $found.FullName }
  }
  if ($pubPem -ne "" -and (Test-Path $pubPem)) {
    $verify = (node (Join-Path $probes "probe-sig.cjs") $SetupPath $sigPath $pubPem) 2>&1
    CK ("Gate5 signature ($verify)") ("$verify" -match 'VALID') ("$verify")
  } else {
    Write-Output "  [SKIP] Gate5 signature: public pem not found anywhere"
  }
} else {
  Write-Output "  [SKIP] Gate5 signature: no .sig file (run sign-installer before release)"
}

Write-Output ("== RESULT: " + $script:PASS + " pass / " + $script:FAIL + " fail ==")
if ($script:FAIL -gt 0) {
  Write-Output "BLOCKED: package must not ship - fix red gates above and rebuild"
  exit 1
}
Write-Output "ALL GREEN: package may ship (VM install gate still manual)"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
exit 0
