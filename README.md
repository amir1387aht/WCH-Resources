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
