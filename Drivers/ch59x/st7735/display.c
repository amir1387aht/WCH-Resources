/*******************************************************************************
    @author   Another
*******************************************************************************/
#include "./display.h"

// Command/Data control
#define CMD_MODE  0
#define DATA_MODE 1

// Pins
#define CS_PIN GPIO_Pin_12
#define DC_PIN GPIO_Pin_9
#define MOSI_PIN GPIO_Pin_14
#define CLK_PIN GPIO_Pin_13
#define RST_PIN GPIO_Pin_15

// Delay flag for initialization sequences
#define DELAY_FLAG 0x80

// Display structure - static instance
typedef struct {
    uint16_t        width;
    uint16_t        height;
    uint8_t         rotation;
    uint8_t         colstart;
    uint8_t         rowstart;
    uint8_t         xstart;
    uint8_t         ystart;
    display_size_e  size_type;
} display_ctx_t;

static display_ctx_t g_display;

// Static function prototypes
static void display_set_dc(uint8_t mode);
static void display_set_cs(uint8_t mode);
static void display_reset(void);
static void display_delay_ms(uint32_t ms);
static void display_send_init_sequence(const uint8_t* addr, uint32_t len);
static void display_update_dimensions(void);

// Initialization sequence for 128x128 display
static const uint8_t init_cmds_128x128[] = {
    15,                             // 15 commands in list
    ST77XX_SWRESET, DELAY_FLAG,
    150,                            // 150 ms delay
    ST77XX_SLPOUT, DELAY_FLAG,
    255,                            // 500 ms delay
    ST7735_FRMCTR1, 3,
    0x01, 0x2C, 0x2D,
    ST7735_FRMCTR2, 3,
    0x01, 0x2C, 0x2D,
    ST7735_FRMCTR3, 6,
    0x01, 0x2C, 0x2D,
    0x01, 0x2C, 0x2D,
    ST7735_INVCTR, 1,
    0x07,
    ST7735_PWCTR1, 3,
    0xA2, 0x02, 0x84,
    ST7735_PWCTR2, 1,
    0xC5,
    ST7735_PWCTR3, 2,
    0x0A, 0x00,
    ST7735_PWCTR4, 2,
    0x8A, 0x2A,
    ST7735_PWCTR5, 2,
    0x8A, 0xEE,
    ST7735_VMCTR1, 1,
    0x0E,
    ST77XX_INVOFF, 0,
    ST77XX_MADCTL, 1,
    0xC0,                           // Default with BGR
    ST77XX_COLMOD, 1,
    0x05                            // 16-bit color
};

// Initialization sequence for 160x80 display
static const uint8_t init_cmds_160x80[] = {
    15,                             // 15 commands in list
    ST77XX_SWRESET, DELAY_FLAG,
    150,                            // 150 ms delay
    ST77XX_SLPOUT, DELAY_FLAG,
    255,                            // 500 ms delay
    ST7735_FRMCTR1, 3,
    0x01, 0x2C, 0x2D,
    ST7735_FRMCTR2, 3,
    0x01, 0x2C, 0x2D,
    ST7735_FRMCTR3, 6,
    0x01, 0x2C, 0x2D,
    0x01, 0x2C, 0x2D,
    ST7735_INVCTR, 1,
    0x07,
    ST7735_PWCTR1, 3,
    0xA2, 0x02, 0x84,
    ST7735_PWCTR2, 1,
    0xC5,
    ST7735_PWCTR3, 2,
    0x0A, 0x00,
    ST7735_PWCTR4, 2,
    0x8A, 0x2A,
    ST7735_PWCTR5, 2,
    0x8A, 0xEE,
    ST7735_VMCTR1, 1,
    0x0E,
    ST77XX_INVOFF, 0,
    ST77XX_MADCTL, 1,
    0xC0,                           // Default with BGR
    ST77XX_COLMOD, 1,
    0x05                            // 16-bit color
};

// Gamma correction commands
static const uint8_t gamma_cmds[] = {
    4,                              // 4 commands
    ST7735_GMCTRP1, 16,
    0x02, 0x1c, 0x07, 0x12,
    0x37, 0x32, 0x29, 0x2d,
    0x29, 0x25, 0x2B, 0x39,
    0x00, 0x01, 0x03, 0x10,
    ST7735_GMCTRN1, 16,
    0x03, 0x1d, 0x07, 0x06,
    0x2E, 0x2C, 0x29, 0x2D,
    0x2E, 0x2E, 0x37, 0x3F,
    0x00, 0x00, 0x02, 0x10,
    ST77XX_NORON, DELAY_FLAG,
    10,                             // 10 ms delay
    ST77XX_DISPON, DELAY_FLAG,
    100                             // 100 ms delay
};

// Initialize display
int display_init(display_size_e size, uint8_t rotation) {
    int ret;
    
    // Initialize GPIO pins
    GPIOA_ModeCfg(MOSI_PIN | CLK_PIN | DC_PIN | CS_PIN | RST_PIN, GPIO_ModeOut_PP_20mA);
    
    // Set initial states
    GPIOA_SetBits(CS_PIN);
    GPIOA_SetBits(DC_PIN);
    GPIOA_ResetBits(RST_PIN);
    display_set_backlight(false);    // Backlight off initially
    
    // Configure SPI
    SPI0_MasterDefInit();
    //SPI0_CLKCfg(1);
    
    // Store display parameters
    g_display.size_type = size;
    g_display.rotation = rotation & 3;
    
    // Set display dimensions and offsets based on type
    if (size == DISPLAY_128x128) {
        g_display.width = ST7735_TFTWIDTH_128;
        g_display.height = ST7735_TFTHEIGHT_128;
        g_display.colstart = 2;
        g_display.rowstart = 3;
    } else { // DISPLAY_160x80
        g_display.width = ST7735_TFTWIDTH_80;
        g_display.height = ST7735_TFTHEIGHT_160;
        g_display.colstart = 26;
        g_display.rowstart = 1;
    }
    
    // Hardware reset
    display_reset();
    
    // Send initialization sequence
    if (size == DISPLAY_128x128) {
        display_send_init_sequence(init_cmds_128x128, sizeof(init_cmds_128x128));
        
        // Set display window for 128x128
        uint8_t caset[] = {0x00, 0x02, 0x00, 0x81};  // 2 to 129
        uint8_t raset[] = {0x00, 0x03, 0x00, 0x82};  // 3 to 130
        display_write_cmd(ST77XX_CASET);
        display_write_data(caset, 4);
        display_write_cmd(ST77XX_RASET);
        display_write_data(raset, 4);

        display_invert(false);
    } else {
        display_send_init_sequence(init_cmds_160x80, sizeof(init_cmds_160x80));
        
        // Set display window for 160x80
        uint8_t caset[] = {0x00, 0x00, 0x00, 0x4F};  // 0 to 79
        uint8_t raset[] = {0x00, 0x00, 0x00, 0x9F};  // 0 to 159
        display_write_cmd(ST77XX_CASET);
        display_write_data(caset, 4);
        display_write_cmd(ST77XX_RASET);
        display_write_data(raset, 4);

        display_invert(true);
    }
    
    // Send gamma correction
    display_send_init_sequence(gamma_cmds, sizeof(gamma_cmds));
    
    // Apply the requested rotation
    display_set_rotation(rotation);
    
    // Clear screen to black
    display_fill_screen(COLOR_BLACK);
    
    // Turn on backlight
    display_set_backlight(true);
    
    return 0;
}

// Deinitialize display
void display_deinit(void) {
    display_set_backlight(false);
    display_enable(false);
    SPI0_Disable();
}

// Send initialization sequence
static void display_send_init_sequence(const uint8_t* addr, uint32_t len) {
    uint8_t numCommands, numArgs;
    uint16_t ms;
    uint32_t i = 0;
    
    numCommands = addr[i++];
    while (numCommands--) {
        uint8_t cmd = addr[i++];
        numArgs = addr[i++];
        ms = numArgs & DELAY_FLAG;
        numArgs &= ~DELAY_FLAG;
        
        display_write_cmd(cmd);
        if (numArgs > 0) {
            display_write_data((uint8_t*)&addr[i], numArgs);
            i += numArgs;
        }
        
        if (ms) {
            ms = addr[i++];
            if (ms == 255) ms = 500;
            display_delay_ms(ms);
        }
    }
}

// Update dimensions based on rotation
static void display_update_dimensions(void) {
    if (g_display.size_type == DISPLAY_128x128) {
        // For 128x128 display
        if (g_display.rotation & 1) {
            g_display.width = ST7735_TFTHEIGHT_128;
            g_display.height = ST7735_TFTWIDTH_128;
        } else {
            g_display.width = ST7735_TFTWIDTH_128;
            g_display.height = ST7735_TFTHEIGHT_128;
        }
        
        // Adjust rowstart for 128x128
        g_display.rowstart = (g_display.rotation < 2) ? 3 : 1;
    } else {
        // For 160x80 display
        if (g_display.rotation & 1) {
            g_display.width = ST7735_TFTHEIGHT_160;
            g_display.height = ST7735_TFTWIDTH_80;
        } else {
            g_display.width = ST7735_TFTWIDTH_80;
            g_display.height = ST7735_TFTHEIGHT_160;
        }
    }
    
    // Update start positions
    if (g_display.rotation & 1) {
        g_display.ystart = g_display.colstart;
        g_display.xstart = g_display.rowstart;
    } else {
        g_display.xstart = g_display.colstart;
        g_display.ystart = g_display.rowstart;
    }
}

// Set display rotation
void display_set_rotation(uint8_t rotation) {
    uint8_t madctl = 0;
    
    g_display.rotation = rotation & 3;
    
    switch (g_display.rotation) {
        case 0:
            madctl = ST77XX_MADCTL_MX | ST77XX_MADCTL_MY | ST7735_MADCTL_BGR;
            break;
            
        case 1:
            madctl = ST77XX_MADCTL_MY | ST77XX_MADCTL_MV | ST7735_MADCTL_BGR;
            break;
            
        case 2:
            madctl = ST7735_MADCTL_BGR;
            break;
            
        case 3:
            madctl = ST77XX_MADCTL_MX | ST77XX_MADCTL_MV | ST7735_MADCTL_BGR;
            break;
    }
    
    display_update_dimensions();
    
    display_write_cmd(ST77XX_MADCTL);
    display_write_data(&madctl, 1);
}

// Set address window for pixel operations
void display_set_addr_window(uint16_t x, uint16_t y, uint16_t w, uint16_t h) {
    uint8_t data[4];
    
    x += g_display.xstart;
    y += g_display.ystart;
    
    // Column address set
    display_write_cmd(ST77XX_CASET);
    data[0] = x >> 8;
    data[1] = x & 0xFF;
    data[2] = (x + w - 1) >> 8;
    data[3] = (x + w - 1) & 0xFF;
    display_write_data(data, 4);
    
    // Row address set
    display_write_cmd(ST77XX_RASET);
    data[0] = y >> 8;
    data[1] = y & 0xFF;
    data[2] = (y + h - 1) >> 8;
    data[3] = (y + h - 1) & 0xFF;
    display_write_data(data, 4);
    
    // Write to RAM
    display_write_cmd(ST77XX_RAMWR);
}

// Write a single pixel
void display_write_pixel(uint16_t x, uint16_t y, uint16_t color) {
    if (x >= g_display.width || y >= g_display.height) return;
    
    display_set_addr_window(x, y, 1, 1);
    display_write_data_16(color);
}

// Internal helper: begin streaming pixel data to a window (assumes window already set)
static inline void display_stream_begin(void) {
    display_set_dc(DATA_MODE);
    display_set_cs(0);
}

// Internal helper: end streaming
static inline void display_stream_end(void) {
    display_set_cs(1);
}

// ---------------------------
// RGB565 bitmap (fast path)
// ---------------------------
void display_draw_bitmap_rgb565(uint16_t x, uint16_t y,
                                uint16_t w, uint16_t h,
                                const uint16_t *pixels)
{
    if (!pixels) return;

    // Clip to display bounds
    if (x >= g_display.width || y >= g_display.height) return;
    if (x + w > g_display.width)  w = g_display.width  - x;
    if (y + h > g_display.height) h = g_display.height - y;
    if (w == 0 || h == 0) return;

    display_set_addr_window(x, y, w, h);
    display_stream_begin();

    // Stream line by line to keep memory usage tiny
    // Use a small transmit buffer for byte-swapping when needed
    uint8_t txbuf[512]; // 256 pixels per chunk
    const uint16_t *src = pixels;

    for (uint16_t row = 0; row < h; ++row) {
        uint32_t remaining = w;
        while (remaining > 0) {
            uint32_t pix_this = (remaining > 256) ? 256 : remaining;

            for (uint32_t i = 0; i < pix_this; ++i) {
                    uint16_t p = src[i];
                    txbuf[2*i + 0] = (uint8_t)(p >> 8);
                    txbuf[2*i + 1] = (uint8_t)(p & 0xFF);
            }

            SPI0_MasterDMATrans(txbuf,  pix_this * 2);
            src += pix_this;
            remaining -= pix_this;
        }
    }

    display_stream_end();
}

// Fill rectangle
void display_fill_rect(uint16_t x, uint16_t y, uint16_t w, uint16_t h, uint16_t color) {
    uint32_t pixels;
    uint8_t hi, lo;
    
    // Clip to display bounds
    if (x >= g_display.width || y >= g_display.height) return;
    if (x + w > g_display.width) w = g_display.width - x;
    if (y + h > g_display.height) h = g_display.height - y;
    
    display_set_addr_window(x, y, w, h);
    
    pixels = (uint32_t)w * h;
    hi = color >> 8;
    lo = color & 0xFF;
    
    display_set_dc(DATA_MODE);
    display_set_cs(0);
    
    // Send pixels in chunks
    uint8_t buffer[512];
    uint16_t chunk_size = 256;  // Send 256 pixels at a time
    
    // Fill buffer with color
    for (uint16_t i = 0; i < chunk_size * 2; i += 2) {
        buffer[i] = hi;
        buffer[i + 1] = lo;
    }
    
    while (pixels > 0) {
        uint16_t send_pixels = (pixels > chunk_size) ? chunk_size : pixels;
        SPI0_MasterDMATrans(buffer, send_pixels * 2);
        pixels -= send_pixels;
    }
    
    display_set_cs(1);
}

// Fill entire screen
void display_fill_screen(uint16_t color) {
    display_fill_rect(0, 0, g_display.width, g_display.height, color);
}

// Draw horizontal line
void display_draw_hline(uint16_t x, uint16_t y, uint16_t w, uint16_t color) {
    display_fill_rect(x, y, w, 1, color);
}

// Draw vertical line
void display_draw_vline(uint16_t x, uint16_t y, uint16_t h, uint16_t color) {
    display_fill_rect(x, y, 1, h, color);
}

// Draw rectangle outline
void display_draw_rect(uint16_t x, uint16_t y, uint16_t w, uint16_t h, uint16_t color) {
    display_draw_hline(x, y, w, color);
    display_draw_hline(x, y + h - 1, w, color);
    display_draw_vline(x, y, h, color);
    display_draw_vline(x + w - 1, y, h, color);
}

// Draw line using Bresenham's algorithm
void display_draw_line(uint16_t x0, uint16_t y0, uint16_t x1, uint16_t y1, uint16_t color) {
    int16_t dx = abs(x1 - x0);
    int16_t dy = abs(y1 - y0);
    int16_t sx = (x0 < x1) ? 1 : -1;
    int16_t sy = (y0 < y1) ? 1 : -1;
    int16_t err = dx - dy;
    
    while (1) {
        display_write_pixel(x0, y0, color);
        
        if (x0 == x1 && y0 == y1) break;
        
        int16_t e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }
}

// Invert display colors
void display_invert(bool invert) {
    display_write_cmd(invert ? ST77XX_INVON : ST77XX_INVOFF);
}

// Enable/disable display
void display_enable(bool enable) {
    display_write_cmd(enable ? ST77XX_DISPON : ST77XX_DISPOFF);
}

// Control backlight
void display_set_backlight(bool enable) {
    // Turned On All Time
}

// Get display width
uint16_t display_get_width(void) {
    return g_display.width;
}

// Get display height
uint16_t display_get_height(void) {
    return g_display.height;
}

// Write command
void display_write_cmd(uint8_t cmd) {
    display_set_dc(CMD_MODE);
    display_set_cs(0);
    SPI0_MasterDMATrans(&cmd, 1);
    display_set_cs(1);
}

// Write data
void display_write_data(uint8_t* data, uint32_t len) {
    if (!data || len == 0) return;
    
    display_set_dc(DATA_MODE);
    display_set_cs(0);
    
    // Send data in chunks if necessary
    while (len > 0) {
        uint16_t chunk = (len > 256) ? 256 : len;
        SPI0_MasterTrans(data, chunk);
        data += chunk;
        len -= chunk;
    }
    
    display_set_cs(1);
}

// Write 16-bit data
void display_write_data_16(uint16_t data) {
    uint8_t buf[2];
    buf[0] = data >> 8;
    buf[1] = data & 0xFF;
    display_write_data(buf, 2);
}

// Static helper functions
static void display_set_dc(uint8_t mode) {
    if(mode == 0) GPIOA_ResetBits(DC_PIN);
    else GPIOA_SetBits(DC_PIN);
}

static void display_set_cs(uint8_t mode) {
    if(mode == 0) GPIOA_ResetBits(CS_PIN);
    else GPIOA_SetBits(CS_PIN);
}

static void display_reset(void) {
    GPIOA_SetBits(RST_PIN);
    display_delay_ms(10);
    GPIOA_ResetBits(RST_PIN);
    display_delay_ms(10);
    GPIOA_SetBits(RST_PIN);
    display_delay_ms(120);
}

static void display_delay_ms(uint32_t ms) {
    DelayMs(ms);
}