/********************************** (C) COPYRIGHT *******************************
 * File Name          : iap_boot.h
 * Description        : Single-file, header-only boot-mode helper for the CH59x
 *                       USB IAP bootloader. Include this from BOTH the
 *                       application firmware and the bootloader project — the
 *                       flag address/values must match on both sides. No .c
 *                       file needed, nothing to add to the build.
 *
 * Application side — anywhere you want to trigger a firmware update
 * (a BLE/UART "start update" command handler, a button hold, etc.):
 *
 *     IAP_StartUsbDownload();     // persists the flag, resets, never returns
 *
 * Bootloader side — the entire main() becomes:
 *
 *     int main(void)
 *     {
 *         mySetSysClock();
 *
 *         if (!IAP_UsbDownloadRequested())
 *             jumpApp();
 *
 *         ... USB init ...
 *         Main_Circulation();
 *     }
 *
 * and wherever the bootloader wants to hand off to the app (update done,
 * or idle timeout):
 *
 *     IAP_JumpToApplication();
 *******************************************************************************/
#ifndef _IAP_BOOT_H_
#define _IAP_BOOT_H_

#include <stdint.h>
#include <stdbool.h>
#include "CH59x_common.h"

#ifdef __cplusplus
extern "C" {
#endif

/* you can change these, just keep app and bootloader in sync. */
#define APP_CODE_START_ADDR        0x00001000
#define APP_CODE_END_ADDR          0x00070000

#define jumpApp   ((void (*)(void))((uint32_t *)APP_CODE_START_ADDR))

#define IAP_FLAG_DATAFLASH_ADDR    0x00   /* DataFlash offset for the flag byte */
#define IAP_FLAG_ENTER_BOOTLOADER  0x55u
#define IAP_FLAG_ENTER_APP         0xAAu

/* Safely tear down USB and jump to the application. Does not return. */
static inline void IAP_JumpToApplication(void)
{
    R8_USB_CTRL = RB_UC_RESET_SIE;
    R16_PIN_ANALOG_IE &= ~(RB_PIN_USB_DP_PU | RB_PIN_USB_IE);
    DelayMs(10);
    jumpApp();
}

/* Application-side: request a firmware update. Persists the boot-mode flag
 * to DataFlash and resets so the bootloader comes up and stays resident on
 * the next boot. Does not return. */
static inline void IAP_StartUsbDownload(void)
{
    uint8_t flag = IAP_FLAG_ENTER_BOOTLOADER;

    EEPROM_WRITE(IAP_FLAG_DATAFLASH_ADDR, &flag, sizeof(flag));
    DelayMs(20); /* let the write land and any pending response go out */

    PFIC_SystemReset();

    while (1) /* never reached */
    {
    }
}

/* Bootloader-side: call once at the very top of main(), before any USB
 * peripheral setup. Reads and clears the flag (so a later plain
 * power-cycle boots straight to the app again). Returns true if the
 * bootloader should stay resident and wait for a USB update, false if it
 * should jump straight to the application. */
static inline bool IAP_UsbDownloadRequested(void)
{
    uint8_t flag = IAP_FLAG_ENTER_APP;

    EEPROM_READ(IAP_FLAG_DATAFLASH_ADDR, &flag, sizeof(flag));

    if (flag != IAP_FLAG_ENTER_BOOTLOADER)
    {
        return false;
    }

    flag = IAP_FLAG_ENTER_APP;
    EEPROM_WRITE(IAP_FLAG_DATAFLASH_ADDR, &flag, sizeof(flag));

    return true;
}

#ifdef __cplusplus
}
#endif

#endif /* _IAP_BOOT_H_ */
