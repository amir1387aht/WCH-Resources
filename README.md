# WCH-Resources

A collection of resources, drivers, templates, and development utilities gathered for **WCH (Nanjing Qinheng Microelectronics)** microcontrollers.

The goal of this repository is to keep useful WCH MCU development resources in one place, making it easier to start new projects without repeatedly searching through SDKs, examples, and configuration tools.

## 📁 Repository Structure

```text
WCH-Resources/
├── Drivers/
│   └── ch59x/
│       └── ...
│
├── Templates/
│   └── CH59X-BLE-TEMPLATE/
│       └── ...
│
├── wch-configurator.html
├── LICENSE
└── README.md
```

### Drivers

WCH MCU drivers collected and organized for easier reuse.

Currently includes resources for the **CH59x** series, with additional devices planned to be added over time.

### Templates

Ready-to-use project templates for WCH microcontrollers.

The repository currently includes:

* **CH59X BLE Template** — a starting point for CH59x Bluetooth Low Energy projects.

Templates are intended to provide a clean foundation for new projects while keeping the original WCH SDK structure and tooling where practical.

### WCH Configurator

`wch-configurator.html` is a local configuration utility for WCH devices.

It can be opened directly in a web browser without requiring a separate installation.

#### VS Code project export

The **VS Code project (.zip)** button next to *Download .c* exports a ready-to-use VS Code project for the selected chip. The **VS Code guide** button explains the steps.

The zip contains:

* `src/main.c` with the generated init code (every `src/*.c` file is built)
* `CMakeLists.txt` that builds against the official WCH EVT (drivers, startup, linker script, `libISP*.a`) and outputs `.elf`, `.hex` and `.bin`
* `.vscode/` with recommended extensions (C/C++, CMake Tools, Cortex-Debug, Serial Monitor), tasks, a Cortex-Debug launch config for WCH-Link and IntelliSense
* `tools/wch.ps1` (Windows) and `tools/wch.sh` (Linux/macOS), behind the VS Code tasks:
  * **WCH: Setup** finds MounRiver's toolchain and OpenOCD (and unpacks the toolchain from MounRiver's `.7z` if needed), installs CMake and Ninja (winget / brew / apt / dnf / Python, after asking), downloads the official EVT for the chip from `github.com/openwch`, and saves all paths
  * **WCH: Doctor** checks every tool and prints what is missing and how to fix it
  * **WCH: Build** (`Ctrl+Shift+B`), **WCH: Flash (OpenOCD / wlink)**, **WCH: Clean**. A failed step ends with a short explanation of the likely cause (wrong EVT, ISA/library mismatch, missing WCH-Link, read-protected chip, ...)
* `README.md` with a step-by-step VS Code guide (English + Persian) and a troubleshooting table

Steps: unzip, open the folder in VS Code, install the recommended extensions, run **WCH: Setup**, then `Ctrl+Shift+B` to build and `F5` to debug.

Tested on Windows with the MounRiver Studio GCC12 toolchain: setup + build from scratch for CH32V003, CH32V203, CH32V307, CH585 and CH592 (EVTs downloaded automatically from openwch).

## 🎯 Purpose

This repository is mainly intended for:

* WCH MCU development
* Rapid project initialization
* Reusable peripheral drivers
* BLE development
* Hardware bring-up
* Prototyping
* Keeping useful WCH resources under version control

Rather than being a complete replacement for the official WCH SDKs, this repository acts as a **practical collection of resources and project foundations**.

## 🔧 Supported Devices

Resources are currently focused on WCH's newer MCU families, including:

* CH59x
* Other WCH MCUs as resources are added

Support will expand over time as additional drivers, templates, and examples are collected.

## 🚀 Getting Started

Clone the repository:

```bash
git clone https://github.com/amir1387aht/WCH-Resources.git
cd WCH-Resources
```

Choose the appropriate template or driver for your MCU and integrate it into your development environment.

For WCH-specific project configuration and compilation details, refer to the documentation provided with the corresponding SDK.

## 📌 Philosophy

This repository is intentionally kept simple.

Resources should be:

* Easy to find
* Easy to reuse
* Easy to integrate
* Kept as close as possible to their original WCH implementation
* Organized so they can be used as a foundation for real projects

More WCH devices, drivers, examples, and utilities will be added as development progresses.

## 📜 License

This repository is released under the **MIT License** unless otherwise stated by the individual resources contained within it.

See [`LICENSE`](LICENSE) for the full license text.

---

**Maintained by Another**

*A personal collection of WCH MCU development resources.*
