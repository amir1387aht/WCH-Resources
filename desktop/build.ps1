<#
  Build WCH Configurator Desktop as ONE Windows .exe.

  Original tool: WCH Configurator, made by Amir1387aht (Another)
  https://github.com/amir1387aht/WCH-Resources

  Usage (PowerShell, from anywhere):
    powershell -ExecutionPolicy Bypass -File desktop\build.ps1
    powershell -ExecutionPolicy Bypass -File desktop\build.ps1 -Tool pyinstaller
    powershell -ExecutionPolicy Bypass -File desktop\build.ps1 -IndexHtml C:\path\to\index.html

  Output: desktop\dist\WCH-Configurator.exe

  -Tool nuitka (default): compiles the Python code to C and then to native code
       with MSVC (or a MinGW that Nuitka downloads on first use). Needs a C compiler.
  -Tool pyinstaller: fallback, no C compiler needed, but the Python bytecode inside
       is easy to extract and decompile.

  About reverse engineering (please read): this is best-effort hardening only.
  Nuitka turns the Python code into native machine code, which is much harder to
  read than PyInstaller bytecode, and we build without console, without
  docstrings/asserts and with LTO. But a one-file exe is still unpacked to a temp
  folder at run time, index.html (the generator itself) ships as a plain data file,
  and anything that runs on the user's PC can be inspected. Nothing here makes the
  program "uncrackable".
#>
param(
  [ValidateSet('nuitka', 'pyinstaller')] [string]$Tool = 'nuitka',
  [string]$Python = 'py -3.12',
  [string]$IndexHtml = '',
  [string]$Version = '1.2.0'
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
if (-not $IndexHtml) { $IndexHtml = Join-Path $repo 'index.html' }
if (-not (Test-Path $IndexHtml)) { throw "index.html not found: $IndexHtml" }

$build = Join-Path $here 'build'
$dist  = Join-Path $here 'dist'
$venv  = Join-Path $build 'venv'
New-Item -ItemType Directory -Force $build, $dist | Out-Null

# 1) private build venv. -Python may be a launcher command ("py -3.12") or a
#    direct path to an existing python.exe (then that interpreter is used as-is).
if ($Python -match 'python(w)?\.exe$' -and (Test-Path $Python)) {
  $py = $Python
  Write-Host "-> using interpreter $py" -ForegroundColor Cyan
} else {
  if (-not (Test-Path "$venv\Scripts\python.exe")) {
    Write-Host '-> creating build venv' -ForegroundColor Cyan
    $exe, $pyArgs = $Python -split ' '
    & $exe @pyArgs -m venv $venv
    if ($LASTEXITCODE) { throw 'could not create venv (install Python 3.12 from python.org)' }
  }
  $py = "$venv\Scripts\python.exe"
}
# packaging 25+ fails on some Python builds while building sdists; pin it for this venv
$env:PIP_CONSTRAINT = Join-Path $here 'constraints.txt'
& $py -m pip install --disable-pip-version-check -q -r (Join-Path $here 'requirements.txt') $Tool
if ($LASTEXITCODE) { throw 'pip install failed' }

# 2) stage sources: the app + the exact index.html to embed
$stage = Join-Path $build 'stage'
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item (Join-Path $here 'wch_configurator.py') $stage
Copy-Item $IndexHtml (Join-Path $stage 'index.html')
$icon = Join-Path $here 'icon.ico'
$out = Join-Path $dist 'WCH-Configurator.exe'
Remove-Item -Force $out -ErrorAction SilentlyContinue

Push-Location $stage
try {
  if ($Tool -eq 'nuitka') {
    $a = @(
      '-m', 'nuitka', 'wch_configurator.py',
      '--onefile', '--assume-yes-for-downloads',
      '--windows-console-mode=disable',
      '--include-data-files=index.html=index.html',
      '--python-flag=no_docstrings', '--python-flag=no_asserts', '--python-flag=no_site',
      '--lto=yes',
      '--company-name=Amir1387aht (Another)',
      '--product-name=WCH Configurator',
      "--file-version=$Version", "--product-version=$Version",
      '--file-description=WCH Configurator Desktop - by Amir1387aht (Another)',
      '--copyright=Amir1387aht (Another) - github.com/amir1387aht/WCH-Resources',
      '--onefile-tempdir-spec={CACHE_DIR}/WCH-Configurator/{VERSION}',
      "--output-dir=$build\nuitka", '--output-filename=WCH-Configurator.exe'
    )
    if (Test-Path $icon) { $a += "--windows-icon-from-ico=$icon" }
    & $py @a
    if ($LASTEXITCODE) { throw 'nuitka build failed' }
    Copy-Item "$build\nuitka\WCH-Configurator.exe" $out
  } else {
    $a = @(
      '-m', 'PyInstaller', 'wch_configurator.py', '--onefile', '--noconsole', '--noconfirm',
      '--name', 'WCH-Configurator', '--add-data', 'index.html;.',
      '--distpath', $dist, '--workpath', "$build\pyi", '--specpath', "$build\pyi"
    )
    if (Test-Path $icon) { $a += @('--icon', $icon) }
    & $py -OO @a
    if ($LASTEXITCODE) { throw 'pyinstaller build failed' }
  }
} finally { Pop-Location }

$h = (Get-FileHash $out -Algorithm SHA256).Hash
Write-Host "`nOK -> $out" -ForegroundColor Green
Write-Host ("   {0:N1} MB, SHA256 {1}" -f ((Get-Item $out).Length / 1MB), $h)
