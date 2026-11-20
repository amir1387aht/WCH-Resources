# WCH Configurator: Desktop (Windows and Linux)

An offline desktop version of the **WCH Configurator** for Windows and Linux, made by **Amir1387aht (Another)**.
Source / GitHub: <https://github.com/amir1387aht/WCH-Resources>

It does everything the web tool does: pick a family and chip (CH32V / CH32F / CH32X / CH32L / CH57x / CH58x / CH59x), configure the peripherals, get the C init code, and use **Download .c** or **VS Code project (.zip)**. The app works offline.

## Download (no install)

Releases: <https://github.com/zamanimahdi/WCH-Resources/releases/latest>

**Windows 10/11 x64**: get **`WCH-Configurator.exe`** and double-click it. You do not need Python. It uses the Microsoft Edge **WebView2** runtime, which comes with Windows 10 and 11. The exe is not code-signed, so Windows SmartScreen may show *"Windows protected your PC"*. Click **More info → Run anyway**.

**Linux x86_64** (Ubuntu 22.04, Debian 12, Fedora 36 or newer): get **`WCH-Configurator-linux-x86_64.tar.gz`**, then:

```bash
tar -xzf WCH-Configurator-linux-x86_64.tar.gz
```

```bash
./WCH-Configurator
```

Qt WebEngine is inside the file. If it does not start, install the Qt system libraries (Ubuntu/Debian):

```bash
sudo apt install libxcb-cursor0 libxkbcommon-x11-0 libegl1 libnss3
```

Open a project directly: `WCH-Configurator <project folder or file.wchproj>`. The exported project's VS Code task **WCH: Open in Configurator** does this on Windows (it looks for the exe in Desktop, Downloads and Documents, or uses `wch.configuratorExe` from `.vscode/settings.json`).

Let an AI assistant work in the window: `WCH-Configurator --mcp-port 9222`, then run the MCP server with `node mcp/wch-mcp.mjs --attach 9222` (Windows, and the Qt build on Linux). The port listens on 127.0.0.1 only, and this mode uses its own WebView data folder, so it can run next to a normally started copy. See [AI assistants (MCP)](../README.md#ai-assistants-mcp).

## How it works

The app is a small Python shell ([`wch_configurator.py`](wch_configurator.py)) built on [pywebview](https://pywebview.flowrl.com/). It opens the repository's own [`index.html`](../index.html) in a native window, and it does not change that file. All generator logic stays in one place, so the desktop app gives the same code and the same VS Code project as the web tool. The shell adds:

- a **toolbar with icons**:

  | Tool | Shortcut | What it does |
  | --- | --- | --- |
  | New | Ctrl+N | Start an empty project (asks first if there is a configuration). |
  | Open | Ctrl+O | Open a project file (`.wchproj`). Its folder becomes the project folder. |
  | Save / Save As | Ctrl+S / Ctrl+Shift+S | Save the whole configuration (chip, package, pins, peripherals, clock, Bluetooth, USB) to `<name>.wchproj` in the project folder. |
  | Generate code | Ctrl+G | Write the VS Code project into the project folder. Code inside USER CODE sections and your own files are kept; changed files are backed up in `.wch-backup/`. |
  | Example | | Load the example configuration. |
  | Copy code | Ctrl+Shift+C | Copy the generated C code. |
  | Save .c | Ctrl+Shift+E | Save the generated C file. |
  | VS Code project | Ctrl+E | Export the ready-to-build VS Code project (.zip). |
  | Guide | F1 | How to use the exported project. |
  | Source / GitHub, About | | Repository link and the original credit. |

  Tools that the loaded `index.html` does not support are hidden.
- an app icon (`icon.ico`, made by `make_icon.py`)
- native **Save as** dialogs for *Download .c* and *VS Code project (.zip)*, and folder access for **Generate code** (only inside the chosen project folder)
- links (GitHub, e-mail, WCH sites) that open in your normal browser
- the original credit, *Made by Amir1387aht (Another)*, in the toolbar, the window title and the **About** dialog
- a clipboard fallback for **Copy**

**Network use:** none while you configure and generate. Fonts fall back to system fonts when offline. The exported VS Code project's **WCH: Setup** task still downloads the official WCH EVT inside VS Code when you run it. That is part of the exported project, not this app.

## Run from source

```bash
py -3.12 -m venv .venv
```

```bash
.venv\Scripts\python -m pip install -r desktop\requirements.txt
```

```bash
.venv\Scripts\python desktop\wch_configurator.py
```

## Build the Linux version yourself

On Linux x86_64 with Python 3.10 or newer:

```bash
bash desktop/build_linux.sh
```

The result is `desktop/dist/WCH-Configurator` (PyInstaller, one file, Qt WebEngine bundled). Build on the oldest distribution you want to support, because glibc is not bundled. The release build runs on GitHub Actions (Ubuntu 22.04), including the self-test in a virtual display: see `.github/workflows/desktop-linux.yml` on the `desktop-app` branch of the fork.

## Build the .exe yourself

Requirements: Windows 10/11, Python 3.12 (python.org), and for the default Nuitka build a C compiler. Visual Studio 2022 or Build Tools with *Desktop development with C++* works. Without one, Nuitka downloads MinGW-w64 on first use.

```bash
powershell -ExecutionPolicy Bypass -File desktop\build.ps1
```

The result is `desktop\dist\WCH-Configurator.exe`. Options:

| Option | Meaning |
| --- | --- |
| `-Tool pyinstaller` | Use PyInstaller instead of Nuitka. No C compiler needed. |
| `-IndexHtml <path>` | Embed a different `index.html` (for example, from another branch). Default: the repo's `index.html`. |
| `-Python "py -3.12"` | The Python launcher command used to create the build venv. |
| `-Version 1.0.0` | Version written into the exe's file properties. |

The script creates its own venv in `desktop\build\`, installs `pywebview` and the build tool, and builds one no-console exe. The exe's file properties carry the author credit.

**Smoke test** (no dialogs: it loads the example, saves the `.c`, the `.zip` and the project into a folder, generates the project there, adds a line of user code, generates again and checks the line is still there, then closes and writes `selftest.json`):

```bash
powershell -Command "$env:WCH_SELFTEST_DIR='C:\temp\wchtest'; mkdir -Force $env:WCH_SELFTEST_DIR; Start-Process -Wait desktop\dist\WCH-Configurator.exe"
```

## Protection against reverse engineering: honest note

This is **best-effort hardening, not real protection**. No Python app can be made impossible to reverse engineer.

- The Nuitka build compiles the Python shell to native code, with no console, no docstrings or asserts, and link-time optimisation. That makes casual inspection harder than a plain bytecode bundle.
- `index.html`, which holds the generator, is bundled as a data file. It is also public in this repository under the MIT license.
- Any program that runs on a user's PC can be inspected by someone determined enough.

The real protection for this work is the **license and the visible credit**. The author's name is in the window title, the Source / GitHub bar, the About dialog, the exe's file properties, and every generated file.
