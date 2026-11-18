# Hardware test (real boards)

[فارسی در پایین صفحه](#آزمون-سختافزار-بردهای-واقعی)

The build tests (CI) prove that the generated code compiles. This kit checks that
it also **works on a real chip**: the clock tree, the UART baud rate, a GPIO, the
ADC, a PWM output and a timer interrupt. For each board the configurator itself
makes the project (the chip's *Load example* configuration), and `src/hwtest.c`
tests it from the outside and prints `PASS` / `FAIL` lines on the UART.

## 1. Make the test projects

Needs Node 22+ and Chrome or Edge.

```
node hwtest/make_hwtest.mjs --out hwtest-out                 # split mode (default)
node hwtest/make_hwtest.mjs --out hwtest-out --mode both     # split and single-file
node hwtest/make_hwtest.mjs --out hwtest-out --only ch592    # one board
```

Each folder in `hwtest-out/` is a normal exported VS Code project
(`HWTEST.txt` lists the configuration). Open it in VS Code and run
**WCH: Setup**, then build with `Ctrl+Shift+B` (or `bash tools/wch.sh build`,
`powershell -File tools\wch.ps1 build`).

Pins differ from your board? Edit `hwtest/boards.json`: `"pkg"` selects the
package, `"pins": {"PB1": "GPIO_Output", "PA9": "USART1_TX", "PA10": "USART1_RX"}`
assigns pins like a click in the pinout view, then run the script again.

## 2. Pins and what to connect

| Board (package) | UART TX / RX (115200 8N1) | LED | ADC input | PWM output | Timer IRQ | Clock checked |
|---|---|---|---|---|---|---|
| CH32V003 (TSSOP20) | USART1 PD5 / PD6 | PA2 | PA1 (ch 1) | TIM2 CH3 PC0, 1 kHz 50% | TIM1 1 kHz | 48 MHz |
| CH32V203 (LQFP48) | USART1 PA9 / PA10 | PA2 | PA0 (ch 0) | TIM2 CH2 PA1, 1 kHz 50% | TIM3 1 kHz | 96 MHz |
| CH32V307 (LQFP100) | USART1 PA9 / PA10 | PA2 | PA0 (ch 0) | TIM2 CH2 PA1, 1 kHz 50% | TIM3 1 kHz | 96 MHz |
| CH32X035 (LQFP48) | USART1 PB10 / PB11 | PA2 | PA0 (ch 0) | TIM2 CH2 PA1, 1 kHz 50% | TIM3 1 kHz | 48 MHz |
| CH582 (QFN48) | UART1 PA9 / PA8 | PA1 | PA0 (ch 9) | PWM4 PA12, ~234 kHz 50% | TMR0 1 kHz | 60 MHz |
| CH585 (QFN48) | UART1 PA9 / PA8 | PA1 | PA0 (ch 9) | PWM4 PA12, ~244 kHz 50% | TMR0 1 kHz | 62.4 MHz |
| CH592 (QFN32) | UART1 PA9 / PA8 | PA5 | PA4 (ch 0) | PWM4 PA12, ~234 kHz 50% | TMR0 1 kHz | 60 MHz |

- **UART**: a 3.3 V USB-serial adapter. Board TX to adapter RX, board RX to adapter TX, GND to GND.
- **LED**: if the board has no LED on that pin, connect LED + 1 kΩ to GND. Leave the pin free of other loads (the test reads the pin level back).
- **ADC**: connect the input to a known voltage (GND, 3.3 V, or a 10 k potentiometer between them). A floating pin gives random values, which still PASS.
- **PWM**: oscilloscope or logic analyser on the PWM pin (optional; a multimeter shows about half of VDD).
- **CH32V003 TSSOP20**: PA1/PA2 are also the crystal pins. On boards with a crystal fitted, move the LED/ADC with `"pins"` in `boards.json`.
- On CH5xx the PWM is set up by `hwtest.c` (the configurator has no CH5xx PWM option yet). Everything else is the configurator's generated init code.

## 3. Flash

- **WCH-LinkE** (blue LED = RISC-V mode). Wiring: 3V3, GND, and
  - CH32V003: SWIO = PD1 (one wire),
  - CH32V203 / V307 / X035: SWDIO = PA13, SWCLK = PA14,
  - CH582 / CH585 / CH592: the two debug pins of the chip's datasheet pin table. New CH5xx chips ship with the debug interface off: enable it once with WCH-LinkUtility, or program over USB instead (hold the download key / BOOT pin while plugging in, then `wchisp flash build/<name>.hex` or WCHISPTool).
- VS Code: task **WCH: Flash (OpenOCD)** or **WCH: Flash (wlink)**. Terminal: `bash tools/wch.sh flash`.
- Linux: run `bash tools/wch.sh udev` once (installs the WCH-Link udev rule), then replug the WCH-Link.

## 4. What you should see

Open the serial port at **115200 baud** (VS Code *Serial Monitor*, `picocom -b 115200 /dev/ttyUSB0`, PuTTY ...) and press reset:

```
=== WCH HWTEST CH32V203 LQFP48 ===
INFO clock SystemCoreClock=96000000 Hz, configurator HCLK=96000000 Hz
PASS clock
PASS uart USART1 115200 baud TX=PA9 RX=PA10 (this text is readable)
PASS gpio LED PA2 high/low read back
PASS adc ADC1 ch0 PA0: 16 conversions, min=4093 max=4095 avg=4094 (about 3299 mV at 3.3 V)
PASS pwm TIM2 ch2 PA1: counter running, CCR=500 (want 500 = 50% of 1000), about 1000 Hz on the pin
PASS timer TIM3 update IRQ: 1000 in 1 s (want 1000 +-3%)
RESULT PASS (6 pass, 0 fail)
ALIVE 5 s, irq=6012
```

| Line | PASS means | If it fails / is missing |
|---|---|---|
| (nothing, or garbage) | - | Wrong baud rate or clock: the UART baud depends on the clock tree. Check TX/RX wiring and GND. Garbage at the right baud = clock config problem |
| `clock` | the running core clock equals the configurator's clock view (1 %) | the clock code (HSE / PLL / SystemInit) does not produce what the clock view shows |
| `uart` | always PASS when you can read it | - |
| `gpio` | the pin follows the output register | pin shorted, wrong pin, or a strong load on it |
| `adc` | 16 conversions finished, values in range | ADC clock/enable missing in the generated init (FAIL with `0 conversions`) |
| `pwm` | timer counts and the compare value is the configured duty | timer not enabled / wrong channel. Also check the pin with a scope: 50 % at the listed frequency |
| `timer` | the interrupt rate is right (1000/s) | NVIC/IRQ name wrong (count 0), or timer clock wrong (count off) |
| `RESULT` | all checks passed | report the FAIL lines |
| `ALIVE` every 5 s, LED blinks 1 Hz | main loop and SysTick delay work | board resets or hangs (watchdog, hard fault) |

## 5. Checklist

Copy this for each board and fill it in:

```
Board / package: ______________   hwtest folder: ______________   date: ________
[ ] builds (Ctrl+Shift+B) without warnings in src/
[ ] flashes (WCH: Flash)
[ ] banner readable at 115200 baud
[ ] PASS clock      SystemCoreClock / GetSysClock = __________ Hz
[ ] PASS gpio       LED blinks 1 Hz
[ ] PASS adc        GND -> avg ______   3.3 V -> avg ______
[ ] PASS pwm        scope: ______ Hz, ______ % duty
[ ] PASS timer      count ______ (1000 expected)
[ ] RESULT PASS, ALIVE lines every 5 s for 1 minute
Notes:
```

Please send the filled checklist (and the full UART log for any FAIL) with an issue.

---

<div dir="rtl">

## آزمون سخت‌افزار (بردهای واقعی)

تست‌های CI فقط نشان می‌دهند که کد تولیدشده **کامپایل** می‌شود. این مجموعه بررسی می‌کند که روی **تراشه واقعی هم کار می‌کند**: درخت کلاک، باودریت UART، یک GPIO، مبدل ADC، خروجی PWM و وقفه تایمر. پروژه هر برد را خود کانفیگوریتور می‌سازد (پیکربندی *Load example* همان تراشه) و فایل `src/hwtest.c` آن را از بیرون آزمایش می‌کند و نتیجه را به شکل خط‌های `PASS` / `FAIL` روی UART چاپ می‌کند.

### ۱. ساختن پروژه‌های تست

به Node نسخه ۲۲ یا بالاتر و Chrome یا Edge نیاز دارد:

</div>

```
node hwtest/make_hwtest.mjs --out hwtest-out
node hwtest/make_hwtest.mjs --out hwtest-out --mode both
node hwtest/make_hwtest.mjs --out hwtest-out --only ch592
```

<div dir="rtl">

هر پوشه در `hwtest-out/` یک پروژه معمولی VS Code است (فایل `HWTEST.txt` پیکربندی را نشان می‌دهد). آن را در VS Code باز کنید، تسک **WCH: Setup** را اجرا کنید و با `Ctrl+Shift+B` بیلد بگیرید.

اگر پایه‌های برد شما فرق دارد، `hwtest/boards.json` را ویرایش کنید: `"pkg"` پکیج را انتخاب می‌کند و `"pins"` پایه‌ها را مثل کلیک در نمای پین‌ها تعیین می‌کند. بعد اسکریپت را دوباره اجرا کنید.

### ۲. پایه‌ها و اتصال‌ها

جدول پایه‌ها در بخش انگلیسی بالا است (ستون‌ها: UART، LED، ورودی ADC، خروجی PWM، تایمر وقفه، کلاک).

- **UART**: یک مبدل USB به سریال ۳٫۳ ولت. TX برد به RX مبدل، RX برد به TX مبدل، و GND به GND.
- **LED**: اگر روی آن پایه LED نیست، یک LED با مقاومت ۱ کیلواهم به GND وصل کنید. بار دیگری روی پایه نگذارید (تست سطح پایه را دوباره می‌خواند).
- **ADC**: ورودی را به یک ولتاژ معلوم وصل کنید (GND، ۳٫۳ ولت یا یک پتانسیومتر ۱۰ کیلو بین آن‌ها). پایه آزاد عدد تصادفی می‌دهد که باز هم PASS است.
- **PWM**: اسیلوسکوپ یا لاجیک‌آنالایزر روی پایه PWM (اختیاری؛ مولتی‌متر حدود نصف VDD نشان می‌دهد).
- در **CH32V003 با پکیج TSSOP20** پایه‌های PA1 و PA2 پایه‌های کریستال هم هستند. اگر روی برد کریستال نصب است، LED و ADC را با `"pins"` جابه‌جا کنید.
- در CH5xx خروجی PWM را خود `hwtest.c` راه می‌اندازد (کانفیگوریتور هنوز گزینه PWM برای CH5xx ندارد). بقیه کدها همان کد تولیدشده کانفیگوریتور است.

### ۳. پروگرام کردن

- **WCH-LinkE** (چراغ آبی = حالت RISC-V). سیم‌کشی: 3V3، GND و
  - CH32V003: پایه SWIO = PD1 (تک‌سیم)،
  - CH32V203 / V307 / X035: پایه SWDIO = PA13 و SWCLK = PA14،
  - CH582 / CH585 / CH592: دو پایه دیباگ طبق جدول پایه‌های دیتاشیت. رابط دیباگ در تراشه‌های نو CH5xx خاموش است: یک بار با WCH-LinkUtility روشنش کنید، یا از طریق USB پروگرام کنید (کلید دانلود / BOOT را هنگام وصل کردن نگه دارید، بعد `wchisp flash build/<name>.hex` یا WCHISPTool).
- در VS Code تسک **WCH: Flash (OpenOCD)** یا **WCH: Flash (wlink)**، یا در ترمینال `bash tools/wch.sh flash`.
- در لینوکس یک بار `bash tools/wch.sh udev` را اجرا کنید (قانون udev برای WCH-Link را نصب می‌کند) و WCH-Link را دوباره وصل کنید.

### ۴. چه چیزی باید ببینید

پورت سریال را با **۱۱۵۲۰۰ باود** باز کنید و برد را ریست کنید. نمونه خروجی در بخش انگلیسی بالا است. معنی هر خط:

- **چیزی نمی‌آید یا حروف درهم**: باودریت یا کلاک اشتباه است (باود UART به درخت کلاک وابسته است). سیم‌های TX/RX و GND را بررسی کنید. حروف درهم با باود درست یعنی مشکل در پیکربندی کلاک.
- **`clock`**: کلاک واقعی هسته با نمای کلاک کانفیگوریتور یکی است (۱٪). FAIL یعنی کد کلاک (HSE / PLL / SystemInit) همان چیزی را که نمای کلاک نشان می‌دهد نمی‌سازد.
- **`uart`**: اگر خوانا است، همیشه PASS است.
- **`gpio`**: پایه از رجیستر خروجی پیروی می‌کند. FAIL یعنی اتصال کوتاه، پایه اشتباه یا بار سنگین.
- **`adc`**: ۱۶ تبدیل انجام شد و مقدارها در محدوده‌اند. FAIL با `0 conversions` یعنی کلاک یا فعال‌سازی ADC در کد اولیه نیست.
- **`pwm`**: تایمر می‌شمارد و مقدار مقایسه همان دیوتی تنظیم‌شده است. پایه را با اسکوپ هم ببینید: ۵۰٪ با فرکانس جدول.
- **`timer`**: نرخ وقفه درست است (۱۰۰۰ در ثانیه). عدد صفر یعنی نام وقفه یا NVIC اشتباه است؛ عدد دور از ۱۰۰۰ یعنی کلاک تایمر اشتباه است.
- **`RESULT PASS`**: همه بررسی‌ها قبول شد.
- **`ALIVE` هر ۵ ثانیه و چشمک LED با ۱ هرتز**: حلقه اصلی و تأخیر SysTick کار می‌کنند. اگر نیامد، برد ریست یا هنگ می‌کند.

### ۵. چک‌لیست

برای هر برد چک‌لیست انگلیسی بخش ۵ را کپی و پر کنید و آن را (و لاگ کامل UART برای هر FAIL) در یک issue بفرستید.

</div>
