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

#### Pinout & Configuration view

The page works like the *Pinout & Configuration* view of STM32CubeMX:

* **Chip view**: the selected part is drawn as its real package (QFN / LQFP / TSSOP / SOP / QSOP / DFN) with every pin number and name, pin 1 marker and exposed pad. Pick the package in the *Package* list. Zoom with the mouse wheel or the +/− buttons, drag to pan, *Fit* to reset.
* **Click a pin** to get its menu: `Reset_State`, `GPIO_Input`, `GPIO_Output`, `GPIO_Analog`, `GPIO_EXTIx` and the alternate functions from the datasheet pin table (ADC channels, SPI, I²C, USART/UART, timer channels). Choosing one colors the pin by peripheral and adds or updates the matching entry in the configuration, so the generated C code follows. Functions that need a pin remap or that the generator does not cover are listed but greyed out. Each pin can get a user label (`LED`, `BUTTON`, ...), which becomes `#define LED_Pin` / `LED_GPIO_Port` in the code.
* **Conflicts and checks**: two functions on one pin, a function the datasheet does not list for that pin, or a pin that is not bonded out on the chosen package are shown in red on the chip and in the *Problems* tab.
* **Left panel**: categories (System Core, Analog, Timers, Connectivity, Wireless / USB) with the per-peripheral settings; click an entry in *Active configuration* to edit it. **Pin table** tab: every pin with its signal, label and datasheet functions.

All pinouts were transcribed from the official WCH datasheets (CH32V003DS0, CH32V006DS0, CH32V103DS0, CH32V203DS0, CH32V20x_30xDS0, CH32X035DS0, CH32L103DS0, CH32F103DS0, CH32F20xDS0, CH583DS1, CH573DS1, CH572DS1, CH585DS1, CH592DS1) and checked against both the pin table and the package drawing. The source table and page are shown under the chip. Packages that could not be checked against a pin table are marked **UNVERIFIED**; chips without a datasheet pinout (CH581) keep the logical port map.

#### Bluetooth LE and USB (CH57x / CH58x / CH59x)

The **Bluetooth LE** and **USB device** entries (*Wireless / USB* group in the left panel) appear for chips that have them:

* **BLE (peripheral):** device name, advertising interval, TX power, MTU, PHY after connect (1M / 2M / Coded where the library supports it), connection parameters, and security (no pairing, Just Works, or a 6-digit passkey with bonding). Add any number of **services and characteristics** (16-bit or 128-bit UUIDs) with Read / Write / Write-without-response / Notify / Indicate, max length, initial value, access level (open / encrypted / authenticated) and a user description. A ready-made **UART service** (Nordic-UART compatible) is one click away.
* **Callbacks:** for each characteristic you can turn on *on data received* (with your own function name), *before read* and *on subscribe*. Connect, disconnect, MTU, PHY and pairing callbacks are always generated. They all live in `src/app_callbacks.c`.
* **USB device (full speed):** CDC virtual COM port, HID keyboard, HID mouse and HID custom (64-byte reports), in any combination (composite device), with VID/PID and strings. Callbacks for received data, line coding, DTR/RTS and keyboard LEDs, plus send functions (`usb_cdc_write`, `usb_kbd_tap`, `usb_mouse_send`, `usb_hid_custom_send`).

The generated code uses the official WCH BLE library and usbdev driver from the EVT, and the VS Code export builds it automatically. Tested by building CH585, CH592, CH583 and CH572 projects.

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
