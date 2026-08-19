/********************************** (C) COPYRIGHT *******************************
 * File Name          : iap.h
 * Description        : USB IAP protocol (device descriptors, command format).
 *                       Boot-mode selection (app vs. bootloader) lives in
 *                       iap_boot.h — include that too.
 *******************************************************************************/
#ifndef _IAP_H_
#define _IAP_H_

#include "CH59x_common.h"
#include "iap_boot.h"

/* USB command codes, sent as the first byte of each 64-byte OUT packet. */
#define CMD_IAP_PROM         0x80
#define CMD_IAP_ERASE        0x81
#define CMD_IAP_VERIFY       0x82
#define CMD_IAP_END          0x83

#define IAP_LEN              64  /* USB packet size */

typedef union _IAP_CMD_STRUCT
{
    struct
    {
        uint8_t cmd;
        uint8_t len;
        uint8_t addr[4];
    } erase;
    struct
    {
        uint8_t cmd;
        uint8_t len;
        uint8_t status[2];
    } end;
    struct
    {
        uint8_t cmd;
        uint8_t len;
        uint8_t addr[4];
        uint8_t buf[IAP_LEN - 6];
    } verify;
    struct
    {
        uint8_t cmd;
        uint8_t len;
        uint8_t buf[IAP_LEN - 2];
    } program;
    struct
    {
        uint8_t buf[IAP_LEN];
    } other;
} iap_cmd_t;

extern uint8_t EP0_Databuf[64 + 64 + 64]; /* ep0(64) + ep4_out(64) + ep4_in(64) */
extern uint8_t EP1_Databuf[64 + 64];      /* ep1_out(64) + ep1_in(64) */
extern uint8_t EP2_Databuf[64 + 64];      /* ep2_out(64) + ep2_in(64) */
extern uint8_t EP3_Databuf[64 + 64];      /* ep3_out(64) + ep3_in(64) */
extern uint32_t g_tcnt;

extern void my_memcpy(void *dst, const void *src, uint32_t l);
extern void USB_DevTransProcess(void);
extern void USB_DeviceInit(void);

#endif /* _IAP_H_ */
