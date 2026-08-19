/********************************** (C) COPYRIGHT *******************************
 * File Name          : Main.c
 * Description        : USB IAP bootloader entry point.
 *******************************************************************************/

#include "CH59x_common.h"
#include "iap.h"
#include "iap_boot.h"

/*********************************************************************
 * @fn      mySetSysClock
 *
 * @brief   Configure the system clock to 60 MHz.
 *
 * @return  none
 */
__HIGH_CODE
void mySetSysClock(void)
{
    sys_safe_access_enable();
    R8_PLL_CONFIG &= ~(1 << 5);
    sys_safe_access_disable();

    sys_safe_access_enable();
    R32_CLK_SYS_CFG = (1 << 6) | (CLK_SOURCE_PLL_60MHz & 0x1f) | RB_TX_32M_PWR_EN | RB_PLL_PWR_EN;
    __nop();
    __nop();
    __nop();
    __nop();
    sys_safe_access_disable();

    sys_safe_access_enable();
    R8_FLASH_CFG = 0x52;
    sys_safe_access_disable();

    sys_safe_access_enable();
    R8_PLL_CONFIG |= 1 << 7;
    sys_safe_access_disable();
}

/*********************************************************************
 * @fn      Main_Circulation
 *
 * @brief   IAP main loop. Runs from RAM (.highcode) for speed. Polls the
 *          USB peripheral and falls back to the application if the host
 *          goes quiet for too long (~1 minute of no USB traffic).
 *
 * @return  none
 */
__attribute__((section(".highcode")))
void Main_Circulation(void)
{
    uint16_t j = 0;

    while (1)
    {
        j++;
        if (j > 5) /* poll roughly every 100us */
        {
            j = 0;
            USB_DevTransProcess();
        }
        DelayUs(20);

        g_tcnt++;
        if (g_tcnt > 3000000) /* ~1 minute idle: give up and boot the app */
        {
            IAP_JumpToApplication();
        }
    }
}

/*********************************************************************
 * @fn      main
 *
 * @brief   Bootloader entry point. Stays resident only if the application
 *          requested a firmware update via IAP_StartUsbDownload();
 *          otherwise jumps straight to the application.
 *
 * @return  none
 */
int main(void)
{
    mySetSysClock();

    if (!IAP_UsbDownloadRequested())
    {
        jumpApp();
    }

    USB_DeviceInit();
    Main_Circulation();
}
