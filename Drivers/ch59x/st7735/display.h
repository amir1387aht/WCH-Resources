#pragma once

#include <stdlib.h>
#include <string.h>
#include "stdint.h"
#include "stdbool.h"
#include "CH59x_common.h"
#include "CH59x_spi.h"
#include "CH59x_gpio.h"

extern void SPI0_MasterDMATrans(uint8_t *pbuf, uint16_t len);

// Display dimensions
#define ST7735_TFTWIDTH_128  128
#define ST7735_TFTWIDTH_80   80
#define ST7735_TFTHEIGHT_128 128
#define ST7735_TFTHEIGHT_160 160

// ST7735 commands
#define ST77XX_NOP      0x00
#define ST77XX_SWRESET  0x01
#define ST77XX_RDDID    0x04
#define ST77XX_RDDST    0x09
#define ST77XX_SLPIN    0x10
#define ST77XX_SLPOUT   0x11
#define ST77XX_PTLON    0x12
#define ST77XX_NORON    0x13
#define ST77XX_INVOFF   0x20
#define ST77XX_INVON    0x21
#define ST77XX_DISPOFF  0x28
#define ST77XX_DISPON   0x29
#define ST77XX_CASET    0x2A
#define ST77XX_RASET    0x2B
#define ST77XX_RAMWR    0x2C
#define ST77XX_RAMRD    0x2E
#define ST77XX_PTLAR    0x30
#define ST77XX_TEOFF    0x34
#define ST77XX_TEON     0x35
#define ST77XX_MADCTL   0x36
#define ST77XX_COLMOD   0x3A

// MADCTL bits
#define ST77XX_MADCTL_MY  0x80
#define ST77XX_MADCTL_MX  0x40
#define ST77XX_MADCTL_MV  0x20
#define ST77XX_MADCTL_ML  0x10
#define ST77XX_MADCTL_RGB 0x00
#define ST7735_MADCTL_BGR 0x08
#define ST7735_MADCTL_MH  0x04

// ST7735 specific commands
#define ST7735_FRMCTR1 0xB1
#define ST7735_FRMCTR2 0xB2
#define ST7735_FRMCTR3 0xB3
#define ST7735_INVCTR  0xB4
#define ST7735_DISSET5 0xB6
#define ST7735_PWCTR1  0xC0
#define ST7735_PWCTR2  0xC1
#define ST7735_PWCTR3  0xC2
#define ST7735_PWCTR4  0xC3
#define ST7735_PWCTR5  0xC4
#define ST7735_VMCTR1  0xC5
#define ST7735_PWCTR6  0xFC
#define ST7735_GMCTRP1 0xE0
#define ST7735_GMCTRN1 0xE1

// Display types
typedef enum {
    DISPLAY_128x128 = 0,
    DISPLAY_160x80 = 1
} display_size_e;

// 16-bit color definitions (RGB565)
#define COLOR_BLACK   0x0000
#define COLOR_WHITE   0xFFFF
#define COLOR_RED     0xF800
#define COLOR_GREEN   0x07E0
#define COLOR_BLUE    0x001F
#define COLOR_CYAN    0x07FF
#define COLOR_MAGENTA 0xF81F
#define COLOR_YELLOW  0xFFE0
#define COLOR_ORANGE  0xFC00

// Function prototypes
int display_init(display_size_e size, uint8_t rotation);
void display_deinit(void);
void display_set_rotation(uint8_t rotation);
void display_set_addr_window(uint16_t x, uint16_t y, uint16_t w, uint16_t h);
void display_write_pixel(uint16_t x, uint16_t y, uint16_t color);
void display_fill_rect(uint16_t x, uint16_t y, uint16_t w, uint16_t h, uint16_t color);
void display_fill_screen(uint16_t color);
void display_draw_hline(uint16_t x, uint16_t y, uint16_t w, uint16_t color);
void display_draw_vline(uint16_t x, uint16_t y, uint16_t h, uint16_t color);
void display_draw_rect(uint16_t x, uint16_t y, uint16_t w, uint16_t h, uint16_t color);
void display_draw_line(uint16_t x0, uint16_t y0, uint16_t x1, uint16_t y1, uint16_t color);
void display_draw_bitmap_rgb565(uint16_t x, uint16_t y, uint16_t w, uint16_t h, const uint16_t *pixels);
void display_invert(bool invert);
void display_enable(bool enable);
void display_set_backlight(bool enable);
void display_write_data(uint8_t* data, uint32_t len);
void display_write_cmd(uint8_t cmd);
void display_write_data_16(uint16_t data);
uint16_t display_get_width(void);
uint16_t display_get_height(void);

// Helper macros for color conversion
#define RGB565(r, g, b) (((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3))