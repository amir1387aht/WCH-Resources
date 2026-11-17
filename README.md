# WCH-Resources

A collection of resources, drivers, templates and development tools for **WCH (Nanjing Qinheng Microelectronics)** microcontrollers. The main tool is the **WCH Configurator**, a CubeMX-style pin, clock and peripheral configurator that generates C init code and ready-to-build VS Code projects.

**[English](#english)** · **[فارسی](#فارسی)**

---

<a id="english"></a>

## English

### Contents

- [Repository structure](#repository-structure)
- [WCH Configurator](#wch-configurator)
  - [Supported chips](#supported-chips)
  - [Layout](#layout)
  - [Pinout & Configuration](#pinout--configuration)
  - [GPIO panel](#gpio-panel)
  - [Clock Configuration](#clock-configuration)
  - [Peripherals](#peripherals)
  - [Bluetooth LE and USB on CH5xx](#bluetooth-le-and-usb-on-ch5xx)
  - [Project Manager and code output](#project-manager-and-code-output)
  - [VS Code project export](#vs-code-project-export)
  - [Desktop app (Windows)](#desktop-app-windows)
- [Testing](#testing)
- [Limitations](#limitations)
- [Getting started](#getting-started)
- [License and credits](#license-and-credits)

### Repository structure

```text
WCH-Resources/
├── Drivers/ch59x/                  CH59x drivers
├── Templates/CH59X-BLE-TEMPLATE/   CH59x Bluetooth LE project template
├── index.html                      WCH Configurator (single file, runs in a browser)
├── desktop/                        Windows desktop app (pywebview shell + build scripts)
├── LICENSE
└── README.md
```

- **Drivers**: WCH MCU drivers collected for reuse. Currently the CH59x series.
- **Templates**: clean starting projects. Currently **CH59X BLE Template**.
- **index.html**: the WCH Configurator. Open it in any modern browser; nothing to install.
- **desktop/**: the same configurator as an offline Windows app. See [desktop/README.md](desktop/README.md).

### WCH Configurator

Pick a family and a chip, set pins, clocks and peripherals, and get C init code that uses the official WCH libraries (StdPeriph for CH32, the CH5xx SDK for CH57x/58x/59x). Everything runs locally in the page.

#### Supported chips

| Family | Chips | Library |
|---|---|---|
| CH32V | CH32V003, CH32V006, CH32V103, CH32V203, CH32V303, CH32V307 | StdPeriph EVT |
| CH32X | CH32X035 | StdPeriph EVT |
| CH32L | CH32L103 | StdPeriph EVT |
| CH32F | CH32F103, CH32F203 | StdPeriph EVT |
| CH57x | CH570, CH571, CH572, CH573 | CH5xx SDK |
| CH58x | CH581, CH582, CH583, CH585 | CH5xx SDK + BLE |
| CH59x | CH591, CH592 | CH5xx SDK + BLE |

Not every feature exists on every chip. See [Limitations](#limitations).

#### Layout

The page follows the STM32CubeMX layout:

- Three main tabs: **Pinout & Configuration**, **Clock Configuration** and **Project Manager**.
- The Pinout page has three columns: **Categories** (grouped or A→Z, with search) | **Mode and Configuration** | **Pinout view / System view**.
- **Light theme** (default) and **dark theme**. Switch with the Theme button; the choice is remembered.
- A peripheral appears in Categories only on chips that really have it (checked against the official EVTs).

#### Pinout & Configuration

- **Chip view**: the part is drawn as its real package (QFN / LQFP / TSSOP / SOP / QSOP / DFN) with pin numbers, names, the pin 1 marker and the exposed pad. Choose the package from the *Package* list.
- **Zoom and pan**: mouse wheel or +/−, drag to pan, *Fit* to reset. A manual zoom is kept when the window is resized.
- **Rotation**: rotate the chip in 90° steps with the rotate buttons or `R` / `Shift+R`. Pin labels stay readable.
- **Pin menu**: click a pin to get `Reset_State`, `GPIO_Input`, `GPIO_Output`, `GPIO_Analog`, `GPIO_EXTIx` and the alternate functions from the datasheet pin table (ADC, SPI, I²C, USART/UART, timer channels, and so on). The pin is colored by peripheral and the configuration and code follow. Functions that need a remap or are not generated are shown greyed out.
- **User label**: the label box starts with the pin name. **Set** becomes active only after you change it. Setting it back to the pin name removes the label. A label `LED` becomes `#define LED_Pin` / `LED_GPIO_Port`.
- **Add to configuration** keeps the form values, so similar entries are quick to add.
- **Checks**: two functions on one pin, a function the datasheet does not list for that pin, or a pin that is not bonded out on the chosen package is shown in red on the chip and in **Problems**.
- **System view**: a table of every pin with its signal, label and datasheet functions.

Pinouts were transcribed from the official datasheets (CH32V003DS0, CH32V006DS0, CH32V103DS0, CH32V203DS0, CH32V20x_30xDS0, CH32X035DS0, CH32L103DS0, CH32F103DS0, CH32F20xDS0, CH583DS1, CH573DS1, CH572DS1, CH585DS1, CH592DS1) and checked against both the pin table and the package drawing. The source table and page are shown under the chip.

#### GPIO panel

Like the CubeMX GPIO panel:

- A table of every GPIO/EXTI pin: **Pin Name, Signal, Output level, Mode, Pull, Speed/Drive, User Label**.
- Click a row to edit that pin below the table. Changes apply immediately.
- **Initial output level** (High/Low): `GPIO_WriteBit` on CH32, `GPIOx_SetBits` / `GPIOx_ResetBits` before `GPIOx_ModeCfg` on CH5xx, so the pin never glitches.
- An **Add pin** row adds a new GPIO without going through the chip view.

#### Clock Configuration

A clock tree drawn like CubeMX, with straight wires or single right angles, no crossings and no wire under a block. Click a block to set it.

- **CH32**: trees for CH32V003, V103, V203 / F203, V303, V307, X035 and L103. HSE/HSI, PLL source, PREDIV, PLL multiplier, system clock mux, AHB/APB1/APB2/ADC prescalers, USB prescaler where it exists. V307 includes PREDIV1 and the ×6.5 multiplier; X035 is HSI only.
- **CH5xx**: PLL / HSE / HSI dividers and the system clock mux mapped to `SetSysClock(CLK_SOURCE_*)`, with the options each chip really has (CH570, CH572, CH582, CH583, CH585, CH591, CH592; CH570/572 use their own names).
- **Limits**: datasheet maximums (SYSCLK, PLL output, APB, ADC, USB 48 MHz, HSE range) are checked and reported in **Problems**.
- **Code**: `SystemClock_Config()` follows each EVT's `system_*.c`; `HSE_VALUE` is passed to the build in exported projects. CH32V303 gets the `CH32V30x_D8` define.
- The real bus clocks feed the UART baud rate, timer, CAN bit timing and ADC settings.

#### Peripherals

| Category | Peripheral | Chips / notes |
|---|---|---|
| System Core | GPIO, EXTI | All chips |
| System Core | **IWDG** | CH32. Timeout from each chip's LSI; `IWDG_Feed()` helper |
| System Core | **WWDG** | CH32 (window from PCLK1, optional early-wakeup IRQ) and the CH5xx watchdog (reset and/or interrupt) |
| System Core | **DMA1** | CH32. Channel map from the EVT examples (ADC, SPI, USART, I²C), memory-to-memory helper, optional transfer-complete IRQ |
| Analog | ADC | All chips with an ADC |
| Analog | **DAC** | CH32V30x |
| Analog | **OPA** | V003, V20x, V30x, X035, L103 (including PGA) |
| Analog | **CMP** | X035, L103, CH570/572 |
| Timers | TIM (PWM, base) | All chips |
| Timers | **RTC** | CH32 calendar RTC (LSE with LSI fallback, second interrupt, alarm); CH5xx RTC timer/trigger |
| Connectivity | USART/UART, SPI, I²C | All chips that have them |
| Connectivity | **CAN** | V203, V303, V307 (CAN1/CAN2), L103. Bit timing from the real APB1 clock; bitrate, error and sample point shown; filters and RX interrupt |
| Wireless / USB | **USB CDC** (virtual COM) | CH32V103, V203, V303, V307 (USBFS/USBHS), X035, L103 |
| Wireless / USB | **Bluetooth LE**, **USB device** | CH5xx (see below) |
| Power | **Low-power modes** | CH32: sleep / stop / standby (AWU on V003/X035, WKUP pin, EXTI). CH5xx: idle / halt / sleep / shutdown with GPIO/RTC wake-up. Clock is restored after stop |

Invalid settings are reported in **Problems**: pin conflicts, a CAN bitrate that cannot be reached within 1 %, DMA channels used twice, watchdog values out of range, clock limits, and so on.

#### Bluetooth LE and USB on CH5xx

- **BLE peripheral**: device name, advertising interval, TX power, MTU, PHY after connect (1M / 2M / Coded where the library supports it), connection parameters, security (none, Just Works, or a 6-digit passkey with bonding).
- **Services and characteristics**: any number, 16-bit or 128-bit UUIDs, Read / Write / Write-without-response / Notify / Indicate, max length, initial value, access level (open / encrypted / authenticated) and user description. A Nordic-UART-compatible **UART service** is one click away.
- **Callbacks**: per characteristic *on data received*, *before read* and *on subscribe*; connect, disconnect, MTU, PHY and pairing callbacks are always generated. All in `src/app_callbacks.c`.
- **USB device (full speed)**: CDC virtual COM, HID keyboard, HID mouse and HID custom (64-byte reports), alone or as a composite device, with VID/PID and strings. Callbacks for received data, line coding, DTR/RTS and keyboard LEDs; send functions `usb_cdc_write`, `usb_kbd_tap`, `usb_mouse_send`, `usb_hid_custom_send`.

The code uses the official WCH BLE library (TMOS) and the usbdev driver from the EVT.

#### Project Manager and code output

- Cards for chip, package, library, clock and toolchain.
- The generated code with a file selector (`main.c`, `app_callbacks.c`, ...), **Copy code** and **Download .c**.
- **Problems** list (errors and warnings).
- **VS Code project (.zip)** and the **VS Code guide**.

#### VS Code project export

The zip contains:

- `src/main.c` with the generated init code (every `src/*.c` is built).
- `CMakeLists.txt` that builds against the official WCH EVT (drivers, startup, linker script, `libISP*.a`) and outputs `.elf`, `.hex` and `.bin`.
- `.vscode/` with recommended extensions (C/C++, CMake Tools, Cortex-Debug, Serial Monitor), tasks, a Cortex-Debug launch config for WCH-Link and IntelliSense settings.
- `tools/wch.ps1` (Windows) and `tools/wch.sh` (Linux/macOS), behind the VS Code tasks:
  - **WCH: Setup** finds the MounRiver toolchain and OpenOCD (unpacks the toolchain from MounRiver's `.7z` if needed), installs CMake and Ninja (winget / brew / apt / dnf / Python, after asking), downloads the official EVT for the chip from `github.com/openwch`, and saves all paths.
  - **WCH: Doctor** checks every tool and says what is missing and how to fix it.
  - **WCH: Build** (`Ctrl+Shift+B`), **WCH: Flash (OpenOCD / wlink)**, **WCH: Clean**. A failed step ends with a short explanation of the likely cause (wrong EVT, ISA/library mismatch, missing WCH-Link, read-protected chip, ...).
- `README.md` with a step-by-step guide (English + Persian) and a troubleshooting table.

Steps: unzip → open the folder in VS Code → install the recommended extensions → run **WCH: Setup** → `Ctrl+Shift+B` to build → `F5` to debug.

#### Desktop app (Windows)

An offline Windows build of the same page (pywebview + WebView2), with a toolbar (New, Open, Save / Save As `.wchproj`, Example, Copy code, Save .c, VS Code project, Guide, About), native Save dialogs and keyboard shortcuts. Download `WCH-Configurator.exe` from <https://github.com/zamanimahdi/WCH-Resources/releases/latest>. Details: [desktop/README.md](desktop/README.md).

### Testing

Exported VS Code projects were built with `riscv-wch-elf-gcc` 12 (MounRiver Studio) against the official openwch EVTs, with 0 errors and 0 warnings in `src/`:

| Chip | Configuration |
|---|---|
| CH32V307 @ 144 MHz | IWDG, WWDG, DMA, RTC, CAN, DAC, OPA, PWR, USBHS CDC |
| CH32V203 @ 144 MHz | IWDG, WWDG, DMA, RTC, CAN, OPA, PWR, USB CDC |
| CH32V303 | clock tree + example |
| CH32V003 @ 48 MHz | IWDG, WWDG, DMA, OPA, PWR |
| CH32X035 | IWDG, WWDG, DMA, OPA, CMP, PWR, USB CDC |
| CH32L103 @ 96 MHz | example + IWDG, WWDG, DMA, RTC, CAN, OPA, CMP, PWR, USB CDC |
| CH32V103 | IWDG, WWDG, DMA, RTC, PWR, USB CDC |
| CH592 | example + WWDG, RTC, PWR |
| CH585 | BLE + USB + WWDG, RTC, PWR |
| CH583 | BLE |
| CH572 | BLE + WWDG, RTC, CMP, PWR |

Setup + build from scratch (EVT downloaded automatically) was tested on Windows for CH32V003, CH32V203, CH32V307, CH585 and CH592. **Nothing was tested on real hardware.**

### Limitations

**General**

- Generated code is **build-tested only, not hardware-tested**. Check it against the datasheet and reference manual before using it in a product.
- The configurator covers common setups, not every register option. Complex cases (DMA chains, timer master/slave, input capture details, ADC injected groups, and so on) still need hand-written code.
- Pin conflicts and out-of-range values are reported in Problems, but the code is still generated. Fix every error before building.
- Pin remaps that are not modelled are shown greyed out in the pin menu.

**Chip coverage**

- **CH32F103 / CH32F203**: Cortex-M3 chips aimed at Keil. Pinout and code are generated, but the VS Code export does not match the F10x/F20x EVT folder layout and is not build-tested. CH32F103 has no clock tree.
- **CH32V006**: no public EVT, so no clock tree, no new modules and no auto EVT download.
- **CH571 / CH573**: no public SDK in openwch, so no auto EVT download and no WWDG/RTC modules.
- **CH581**: pinout (CH581F, QFN28) is from CH583DS1 V1.6; WCH removed CH581F from the datasheet in V1.9. The EVT linker script allows 448 KB, but CH581 has 192 KB for the application: keep the program below that.
- **UNVERIFIED packages**: CH573Q (LQFP32), CH571D (QFN20) and CH571K (ESSOP10) could not be checked against a pin table and are marked **UNVERIFIED**.
- **CH570 / CH572**: the timer and ADC generators do not match their SDK yet.
- **CH570** has no Bluetooth; **CH591** has no USB.

**Clock Configuration**

- Not modelled: CH32V203RB / V208 variants, V307 PLL2 / PLL3 and USBHS PLL details, L103 HCLK-ADC option and low-power HSI modes, X035 ADC prescaler (set in the ADC peripheral).
- Some limits were not checked against a PDF: V003 HSE range, LSI and ADC 24 MHz; X035 LSI; L103 HSE and ADC.

**Peripherals**

- **CH32V203 USBD** (the second controller on PA11/PA12) is not generated; only USBFS is. Small V203 packages (F6P6, G6U6) have no USBFS pins.
- USB callbacks run in the USB interrupt. Keep them short.
- **CH32L103 CAN**: filter setup is skipped (its driver has no `CAN_FilterInit`).
- **CH5xx RTC**: the BLE stack (TMOS) uses the RTC. With Bluetooth on, the RTC module generates nothing and Problems says so; use `tmos_start_task()` for timed work.
- **CH572**: 12 KB RAM. With BLE, keep MTU ≤ 100 (a smaller heap profile is used).
- **CH58x / CH59x low-power GPIO wake-up**: only PB0–PB15 and PB22/PB23 can wake the chip.
- BLE is peripheral role only (no central/observer), and USB on CH5xx is device only (no host).

**Export and desktop**

- **WCH: Setup** needs internet to download the EVT and tools the first time.
- The MounRiver toolchain is not downloaded automatically; install MounRiver Studio (or put `riscv-wch-elf-gcc` on PATH).
- The desktop EXE is Windows 10/11 x64 only, needs the WebView2 runtime (built into Windows 11), and is not code-signed, so SmartScreen shows a warning (**More info → Run anyway**).
- Desktop EXE releases are published on the `zamanimahdi/WCH-Resources` fork.

### Getting started

```bash
git clone https://github.com/amir1387aht/WCH-Resources.git
```

Open `index.html` in a browser (or run the desktop EXE), pick a chip, configure it, then export a VS Code project or copy the code into your own project.

### License and credits

MIT License, unless a resource says otherwise. See [`LICENSE`](LICENSE).

The WCH Configurator was created by **Amir1387aht (Another)**. Pinouts and register names come from the official WCH datasheets and openwch EVTs.

---

<a id="فارسی"></a>

<div dir="rtl">

## فارسی

### فهرست

- [ساختار مخزن](#ساختار-مخزن)
- [WCH Configurator](#wch-configurator-1)
- [تست](#تست)
- [محدودیت‌ها](#محدودیتها)
- [شروع کار](#شروع-کار)
- [مجوز و اعتبار](#مجوز-و-اعتبار)

### ساختار مخزن

- **Drivers**: درایورهای میکروکنترلرهای WCH (فعلاً سری CH59x).
- **Templates**: پروژه‌های آماده‌ی شروع (فعلاً **CH59X BLE Template**).
- **index.html**: ابزار WCH Configurator. در هر مرورگر به‌روزی باز می‌شود و نصب لازم ندارد.
- **desktop/**: همین ابزار به‌صورت برنامه‌ی آفلاین ویندوز. توضیحات در [desktop/README.md](desktop/README.md).

### WCH Configurator

خانواده و تراشه را انتخاب کنید، پایه‌ها، کلاک و پریفرال‌ها را تنظیم کنید و کد C راه‌اندازی بگیرید. کد با کتابخانه‌های رسمی WCH نوشته می‌شود: StdPeriph برای CH32 و SDK سری CH5xx برای CH57x/58x/59x. همه‌چیز به‌صورت محلی داخل صفحه اجرا می‌شود.

#### تراشه‌های پشتیبانی‌شده

| خانواده | تراشه‌ها | کتابخانه |
|---|---|---|
| CH32V | CH32V003, CH32V006, CH32V103, CH32V203, CH32V303, CH32V307 | StdPeriph EVT |
| CH32X | CH32X035 | StdPeriph EVT |
| CH32L | CH32L103 | StdPeriph EVT |
| CH32F | CH32F103, CH32F203 | StdPeriph EVT |
| CH57x | CH570, CH571, CH572, CH573 | CH5xx SDK |
| CH58x | CH581, CH582, CH583, CH585 | CH5xx SDK + BLE |
| CH59x | CH591, CH592 | CH5xx SDK + BLE |

همه‌ی قابلیت‌ها روی همه‌ی تراشه‌ها نیست؛ بخش [محدودیت‌ها](#محدودیتها) را ببینید.

#### چیدمان

- چیدمان مثل STM32CubeMX است: سه زبانه‌ی اصلی **Pinout & Configuration**، **Clock Configuration** و **Project Manager**.
- صفحه‌ی Pinout سه ستون دارد: **Categories** (گروه‌بندی یا الفبایی، با جستجو)، **Mode and Configuration** و **Pinout view / System view**.
- **تم روشن** (پیش‌فرض) و **تم تیره** دارد. با دکمه‌ی Theme عوض می‌شود و انتخاب ذخیره می‌ماند.
- هر پریفرال فقط برای تراشه‌ای نمایش داده می‌شود که واقعاً آن را دارد (با EVTهای رسمی بررسی شده).

#### Pinout & Configuration

- **نمای تراشه**: تراشه با پکیج واقعی‌اش (QFN / LQFP / TSSOP / SOP / QSOP / DFN) رسم می‌شود، با شماره و نام پایه‌ها، نشانگر پایه‌ی ۱ و پد زیرین. پکیج از فهرست *Package* انتخاب می‌شود.
- **زوم و جابه‌جایی**: با چرخ موس یا +/− زوم و با کشیدن جابه‌جا کنید. *Fit* نما را برمی‌گرداند. زوم دستی با تغییر اندازه‌ی پنجره حفظ می‌شود.
- **چرخش**: تراشه با دکمه‌های چرخش یا `R` و `Shift+R` در گام‌های ۹۰ درجه می‌چرخد و نوشته‌ها خوانا می‌مانند.
- **منوی پایه**: با کلیک روی پایه، `Reset_State`، `GPIO_Input`، `GPIO_Output`، `GPIO_Analog`، `GPIO_EXTIx` و توابع جایگزین جدول پایه‌های دیتاشیت (ADC، SPI، I²C، USART/UART، کانال‌های تایمر و غیره) نمایش داده می‌شوند. پایه بر اساس پریفرال رنگ می‌گیرد و پیکربندی و کد هم به‌روز می‌شوند. توابعی که ریمپ لازم دارند یا هنوز تولید نمی‌شوند خاکستری هستند.
- **برچسب کاربر**: کادر برچسب با نام پایه پر شده است. دکمه‌ی **Set** فقط پس از تغییر برچسب فعال می‌شود. برگرداندن برچسب به نام پایه، برچسب را حذف می‌کند. برچسب `LED` در کد به `#define LED_Pin` / `LED_GPIO_Port` تبدیل می‌شود.
- **Add to configuration** مقادیر فرم را نگه می‌دارد.
- **بررسی‌ها**: دو تابع روی یک پایه، تابعی که دیتاشیت برای آن پایه ندارد، یا پایه‌ای که در پکیج انتخابی بیرون نیامده، روی تراشه و در **Problems** قرمز نشان داده می‌شود.
- **System view**: جدول همه‌ی پایه‌ها با سیگنال، برچسب و توابع دیتاشیت.

پین‌اوت‌ها از دیتاشیت‌های رسمی WCH استخراج و با جدول پایه‌ها و نقشه‌ی پکیج تطبیق داده شده‌اند. منبع و صفحه‌ی دیتاشیت زیر تراشه نوشته شده است.

#### پنل GPIO

- مثل پنل GPIO در CubeMX، جدولی از همه‌ی پایه‌های GPIO/EXTI دارد با ستون‌های: **Pin Name، Signal، Output level، Mode، Pull، Speed/Drive، User Label**.
- با کلیک روی هر ردیف، تنظیمات آن پایه زیر جدول باز می‌شود و تغییرات فوراً اعمال می‌شوند.
- **سطح اولیه‌ی خروجی** (High/Low) در CH32 با `GPIO_WriteBit` تنظیم می‌شود. در CH5xx با `SetBits/ResetBits` قبل از `ModeCfg` تنظیم می‌شود تا پایه پرش نداشته باشد.
- ردیف **Add pin** بدون رفتن به نمای تراشه یک GPIO جدید اضافه می‌کند.

#### Clock Configuration

- درخت کلاک مثل CubeMX رسم شده است. خطوط صاف یا با یک زاویه‌ی قائم هستند، از هم عبور نمی‌کنند و از زیر بلوک‌ها رد نمی‌شوند. تنظیم هر بلوک با کلیک روی آن انجام می‌شود.
- **CH32**: درخت کلاک برای CH32V003، V103، V203/F203، V303، V307، X035 و L103 ساخته شده است. این درخت‌ها شامل HSE/HSI، منبع PLL، PREDIV، ضریب PLL، مالتی‌پلکسر کلاک سیستم، پیش‌تقسیم‌کننده‌های AHB/APB1/APB2/ADC و پیش‌تقسیم‌کننده‌ی USB (در صورت وجود) هستند. V307 شامل PREDIV1 و ضریب ×6.5 است و X035 فقط HSI دارد.
- **CH5xx**: تقسیم‌کننده‌های PLL / HSE / HSI و مالتی‌پلکسر کلاک سیستم به `SetSysClock(CLK_SOURCE_*)` نگاشت شده‌اند. برای هر تراشه فقط گزینه‌های واقعی‌اش نمایش داده می‌شود.
- **حدود مجاز**: حداکثرهای دیتاشیت (SYSCLK، خروجی PLL، APB، ADC، USB 48 MHz، بازه‌ی HSE) بررسی و در **Problems** گزارش می‌شوند.
- **کد**: تابع `SystemClock_Config()` مطابق `system_*.c` هر EVT ساخته می‌شود. در پروژه‌ی خروجی `HSE_VALUE` تعریف می‌شود.
- کلاک واقعی باس‌ها برای باودریت UART، تایمر، CAN و ADC استفاده می‌شود.

#### پریفرال‌ها

| دسته | پریفرال | تراشه‌ها / توضیح |
|---|---|---|
| System Core | GPIO، EXTI | همه |
| System Core | **IWDG** | CH32؛ تایم‌اوت از LSI هر تراشه، تابع `IWDG_Feed()` |
| System Core | **WWDG** | CH32 (پنجره از PCLK1، وقفه‌ی هشدار زودهنگام) و واچ‌داگ CH5xx (ریست و/یا وقفه) |
| System Core | **DMA1** | CH32؛ نگاشت کانال‌ها از مثال‌های EVT، کپی حافظه به حافظه، وقفه‌ی پایان انتقال |
| Analog | ADC | همه‌ی تراشه‌های دارای ADC |
| Analog | **DAC** | CH32V30x |
| Analog | **OPA** | V003، V20x، V30x، X035، L103 (با PGA) |
| Analog | **CMP** | X035، L103، CH570/572 |
| Timers | TIM (PWM، پایه‌ی زمانی) | همه |
| Timers | **RTC** | تقویم RTC در CH32 (LSE با جایگزین LSI، وقفه‌ی ثانیه، آلارم)؛ تایمر/تریگر RTC در CH5xx |
| Connectivity | USART/UART، SPI، I²C | همه‌ی تراشه‌های دارای آن |
| Connectivity | **CAN** | V203، V303، V307 (CAN1/CAN2)، L103؛ زمان‌بندی بیت از کلاک واقعی APB1، نمایش باودریت، خطا و نقطه‌ی نمونه‌برداری، فیلتر و وقفه‌ی دریافت |
| Wireless / USB | **USB CDC** (پورت COM مجازی) | CH32V103، V203، V303، V307 (USBFS/USBHS)، X035، L103 |
| Wireless / USB | **بلوتوث LE**، **USB device** | CH5xx |
| Power | **حالت‌های کم‌مصرف** | CH32: sleep / stop / standby (AWU، پایه‌ی WKUP، EXTI). CH5xx: idle / halt / sleep / shutdown با بیدارشدن از GPIO/RTC. کلاک پس از stop برمی‌گردد |

تنظیمات نامعتبر در **Problems** گزارش می‌شوند. نمونه‌ها: تداخل پایه‌ها، باودریت CAN با خطای بیش از ۱٪، کانال DMA تکراری، مقادیر خارج از بازه‌ی واچ‌داگ و حدود کلاک.

#### بلوتوث LE و USB در CH5xx

- **BLE (peripheral)**: تنظیمات شامل نام دستگاه، فاصله‌ی ادورتایز، توان ارسال، MTU و PHY پس از اتصال (1M / 2M / Coded) است. پارامترهای اتصال و امنیت هم قابل تنظیم‌اند: بدون جفت‌سازی، Just Works، یا رمز ۶ رقمی با Bonding.
- **سرویس‌ها و کاراکتریستیک‌ها**:
  - تعداد دلخواه، با UUID شانزده‌بیتی یا ۱۲۸ بیتی.
  - ویژگی‌های Read / Write / Write-without-response / Notify / Indicate.
  - حداکثر طول، مقدار اولیه، سطح دسترسی و توضیح کاربر.
  - **سرویس UART** سازگار با Nordic با یک کلیک اضافه می‌شود.
- **کال‌بک‌ها**: برای هر کاراکتریستیک سه کال‌بک *دریافت داده*، *قبل از خواندن* و *اشتراک* وجود دارد. کال‌بک‌های اتصال، قطع، MTU، PHY و جفت‌سازی همیشه ساخته می‌شوند. همه‌ی این کال‌بک‌ها در `src/app_callbacks.c` هستند.
- **USB device (full speed)**:
  - کلاس‌ها: CDC، HID کیبورد، HID موس و HID سفارشی (گزارش ۶۴ بایتی)، به‌تنهایی یا ترکیبی (composite).
  - تنظیم VID/PID و رشته‌ها.
  - کال‌بک‌ها و توابع ارسال.

#### Project Manager و خروجی کد

- کارت‌های تراشه، پکیج، کتابخانه، کلاک و تول‌چین.
- کد تولیدشده با انتخاب فایل، و دکمه‌های **Copy code** و **Download .c**.
- فهرست **Problems** (خطاها و هشدارها).
- **VS Code project (.zip)** و **راهنمای VS Code**.

#### خروجی پروژه‌ی VS Code

فایل zip شامل این موارد است:

- `src/main.c` و فایل `CMakeLists.txt`. پروژه روی EVT رسمی WCH ساخته می‌شود و خروجی `.elf`، `.hex` و `.bin` می‌دهد.
- پوشه‌ی `.vscode/` با افزونه‌های پیشنهادی، تسک‌ها، تنظیمات دیباگ Cortex-Debug برای WCH-Link و IntelliSense.
- `tools/wch.ps1` (ویندوز) و `tools/wch.sh` (لینوکس/مک)، با این تسک‌ها:
  - **WCH: Setup**: تول‌چین MounRiver و OpenOCD را پیدا می‌کند و CMake و Ninja را با اجازه‌ی شما نصب می‌کند. EVT رسمی تراشه را هم از `github.com/openwch` دانلود می‌کند.
  - **WCH: Doctor**: همه‌ی ابزارها را بررسی می‌کند و می‌گوید چه چیزی کم است و چطور درست می‌شود.
  - **WCH: Build** (`Ctrl+Shift+B`)، **WCH: Flash (OpenOCD / wlink)** و **WCH: Clean**. هر مرحله‌ای که خطا بدهد، علت احتمالی را توضیح می‌دهد.
- `README.md` با راهنمای قدم‌به‌قدم (انگلیسی + فارسی) و جدول رفع اشکال.

مراحل استفاده:

1. فایل zip را باز کنید.
2. پوشه را در VS Code باز کنید.
3. افزونه‌های پیشنهادی را نصب کنید.
4. تسک **WCH: Setup** را اجرا کنید.
5. با `Ctrl+Shift+B` بیلد بگیرید.
6. با `F5` دیباگ کنید.

#### نسخه‌ی دسکتاپ (ویندوز)

همین ابزار به‌صورت برنامه‌ی آفلاین ویندوز (pywebview + WebView2) هم وجود دارد. نوار ابزار شامل New، Open، Save / Save As (`.wchproj`)، Example، Copy code، Save .c، VS Code project، Guide و About است. پنجره‌های ذخیره‌ی ویندوز و میانبرهای کیبورد هم دارد.

فایل `WCH-Configurator.exe` را از <https://github.com/zamanimahdi/WCH-Resources/releases/latest> دانلود کنید.

### تست

پروژه‌های خروجی VS Code با `riscv-wch-elf-gcc` نسخه‌ی ۱۲ (MounRiver Studio) و EVTهای رسمی openwch بیلد شدند. در `src/` هیچ خطا و هشداری نبود. جدول کامل در بخش انگلیسی [Testing](#testing) آمده است.

راه‌اندازی و بیلد از صفر روی ویندوز تست شد: CH32V003، CH32V203، CH32V307، CH585 و CH592. **هیچ‌کدام روی سخت‌افزار واقعی تست نشده‌اند.**

### محدودیت‌ها

**کلی**

- کد تولیدشده **فقط تست بیلد شده و روی سخت‌افزار تست نشده است**. قبل از استفاده در محصول، آن را با دیتاشیت و رفرنس‌منوال تطبیق دهید.
- ابزار تنظیمات رایج را پوشش می‌دهد، نه همه‌ی گزینه‌های رجیسترها. موارد پیچیده هنوز کد دستی لازم دارند. نمونه‌ها: زنجیره‌ی DMA، Master/Slave تایمر، جزئیات Input Capture و گروه‌های Injected در ADC.
- تداخل پایه‌ها و مقادیر خارج از بازه در Problems گزارش می‌شوند، ولی کد باز هم تولید می‌شود. قبل از بیلد همه‌ی خطاها را رفع کنید.
- ریمپ‌هایی که مدل نشده‌اند در منوی پایه خاکستری هستند.

**پوشش تراشه‌ها**

- **CH32F103 / CH32F203**:
  - این دو تراشه‌ی Cortex-M3 برای Keil هستند.
  - پین‌اوت و کد ساخته می‌شود، ولی خروجی VS Code با ساختار پوشه‌های EVT سری F10x/F20x جور نیست و تست بیلد نشده است.
  - CH32F103 درخت کلاک ندارد.
- **CH32V006**: EVT عمومی ندارد. بنابراین درخت کلاک، ماژول‌های جدید و دانلود خودکار EVT ندارد.
- **CH571 / CH573**: SDK عمومی در openwch ندارند. بنابراین دانلود خودکار EVT و ماژول‌های WWDG/RTC ندارند.
- **CH581**: پین‌اوت (CH581F، QFN28) از دیتاشیت CH583DS1 نسخه‌ی V1.6 گرفته شده است، چون WCH در نسخه‌ی V1.9 این تراشه را از دیتاشیت حذف کرده. اسکریپت لینکر EVT تا ۴۴۸ کیلوبایت اجازه می‌دهد، ولی CH581 فقط ۱۹۲ کیلوبایت برای برنامه دارد؛ برنامه را کوچک‌تر از این نگه دارید.
- **پکیج‌های UNVERIFIED**: CH573Q (LQFP32)، CH571D (QFN20) و CH571K (ESSOP10) با جدول پایه تطبیق داده نشده‌اند و علامت **UNVERIFIED** دارند.
- **CH570 / CH572**: مولد تایمر و ADC هنوز با SDK آن‌ها جور نیست.
- **CH570** بلوتوث ندارد و **CH591** USB ندارد.

**تنظیمات کلاک**

- این موارد مدل نشده‌اند:
  - نسخه‌های CH32V203RB و V208.
  - PLL2، PLL3 و جزئیات PLL مربوط به USBHS در V307.
  - گزینه‌ی HCLK-ADC و حالت‌های HSI کم‌مصرف در L103.
  - پیش‌تقسیم‌کننده‌ی ADC در X035 (در خود پریفرال ADC تنظیم می‌شود).
- بعضی حدود با PDF دیتاشیت بررسی نشده‌اند:
  - V003: بازه‌ی HSE، LSI و ADC 24 MHz.
  - X035: LSI.
  - L103: HSE و ADC.

**پریفرال‌ها**

- **CH32V203 USBD** (کنترلر دوم روی PA11/PA12) تولید نمی‌شود و فقط USBFS پشتیبانی می‌شود. پکیج‌های کوچک V203 (F6P6، G6U6) پایه‌ی USBFS ندارند.
- کال‌بک‌های USB داخل وقفه اجرا می‌شوند، پس باید کوتاه باشند.
- **CAN در CH32L103**: تنظیم فیلتر انجام نمی‌شود، چون درایور آن `CAN_FilterInit` ندارد.
- **RTC در CH5xx**:
  - پشته‌ی بلوتوث (TMOS) از RTC استفاده می‌کند.
  - وقتی بلوتوث روشن است، ماژول RTC کدی تولید نمی‌کند و در Problems هشدار می‌دهد.
  - برای کارهای زمان‌دار از `tmos_start_task()` استفاده کنید.
- **CH572**: فقط ۱۲ کیلوبایت RAM دارد. با بلوتوث، MTU را ۱۰۰ یا کمتر نگه دارید.
- **بیدارشدن با GPIO در CH58x / CH59x**: فقط PB0 تا PB15 و PB22/PB23.
- بلوتوث فقط نقش peripheral دارد (central/observer ندارد). USB در CH5xx فقط device است (host ندارد).

**خروجی و نسخه‌ی دسکتاپ**

- **WCH: Setup** بار اول برای دانلود EVT و ابزارها اینترنت لازم دارد.
- تول‌چین MounRiver خودکار دانلود نمی‌شود. MounRiver Studio را نصب کنید یا `riscv-wch-elf-gcc` را در PATH قرار دهید.
- فایل EXE:
  - فقط روی ویندوز ۱۰/۱۱ ۶۴ بیتی اجرا می‌شود.
  - WebView2 لازم دارد (در ویندوز ۱۱ موجود است).
  - امضای دیجیتال ندارد، پس SmartScreen هشدار می‌دهد. **More info ← Run anyway** را بزنید.
- نسخه‌های EXE روی فورک `zamanimahdi/WCH-Resources` منتشر می‌شوند.

### شروع کار

</div>

```bash
git clone https://github.com/amir1387aht/WCH-Resources.git
```

<div dir="rtl">

فایل `index.html` را در مرورگر باز کنید یا EXE دسکتاپ را اجرا کنید. تراشه را انتخاب و تنظیم کنید، سپس پروژه‌ی VS Code بگیرید یا کد را در پروژه‌ی خودتان کپی کنید.

### مجوز و اعتبار

این مخزن تحت مجوز MIT است، مگر اینکه منبعی خلاف آن را اعلام کند. فایل [`LICENSE`](LICENSE) را ببینید.

سازنده‌ی WCH Configurator: **Amir1387aht (Another)**. پین‌اوت‌ها و نام رجیسترها از دیتاشیت‌های رسمی WCH و EVTهای openwch گرفته شده‌اند.

</div>
