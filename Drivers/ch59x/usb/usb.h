#ifndef USB_COM_H
#define USB_COM_H

#include "CH59x_common.h"
#include <stdio.h>
#include <stdarg.h>
#include <string.h>

void usb_init();
void usb_update();

UINT8 usb_send(const char *fmt, ...);

#endif // USB_COM_H