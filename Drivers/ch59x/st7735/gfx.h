/*******************************************************************************
    @author   Another
*******************************************************************************/
#ifndef _GFX_H_
#define _GFX_H_

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "./display.h"

#ifdef __cplusplus
extern "C" {
#endif

// ---------------- Adafruit-style font types ----------------
typedef struct {
    uint16_t bitmapOffset; // Pointer into GFXfont->bitmap
    uint8_t  width, height;
    uint8_t  xAdvance;
    int8_t   xOffset, yOffset;
} GFXglyph;

typedef struct {
    const uint8_t *bitmap;  // Glyph bitmaps, concatenated
    const GFXglyph *glyph;  // Glyph array
    uint8_t first, last;    // ASCII extents
    uint8_t yAdvance;       // Newline distance (baseline to baseline)
} GFXfont;

// -------------- Init / rotation / size ---------------------
int gfx_init(display_size_e size, uint8_t rotation);
void gfx_set_rotation(uint8_t rotation);
uint16_t gfx_width(void);
uint16_t gfx_height(void);

// -------------- Primitives (fast paths use display_*) ------
static inline void gfx_draw_pixel(int16_t x, int16_t y, uint16_t c) { display_write_pixel((uint16_t)x, (uint16_t)y, c); }
static inline void gfx_fill_screen(uint16_t c) { display_fill_screen(c); }

static inline void gfx_fill_rect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) {
    if (w > 0 && h > 0) display_fill_rect((uint16_t)x, (uint16_t)y, (uint16_t)w, (uint16_t)h, c);
}

static inline void gfx_draw_hline(int16_t x, int16_t y, int16_t w, uint16_t c) {
    if (w > 0) display_draw_hline((uint16_t)x, (uint16_t)y, (uint16_t)w, c);
}

static inline void gfx_draw_vline(int16_t x, int16_t y, int16_t h, uint16_t c) {
    if (h > 0) display_draw_vline((uint16_t)x, (uint16_t)y, (uint16_t)h,c);
}

static inline void gfx_draw_line(int16_t x0, int16_t y0, int16_t x1, int16_t y1, uint16_t c) {
    display_draw_line((uint16_t)x0, (uint16_t)y0, (uint16_t)x1, (uint16_t)y1, c);
}

static inline void gfx_draw_rect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) {
    if (w > 0 && h>  0)
    { 
        gfx_draw_hline(x, y, w, c); 
        gfx_draw_hline(x, y + h - 1, w, c); 
        gfx_draw_vline(x, y, h, c); 
        gfx_draw_vline(x + w - 1, y, h, c); 
    }
}

// -------------- Circles / Triangles / Polygons / Arcs ------
void gfx_draw_circle (int16_t x0, int16_t y0, int16_t r, uint16_t color);
void gfx_fill_circle (int16_t x0, int16_t y0, int16_t r, uint16_t color);

void gfx_draw_triangle(int16_t x0, int16_t y0, int16_t x1, int16_t y1,
                       int16_t x2, int16_t y2, uint16_t color);
void gfx_fill_triangle(int16_t x0, int16_t y0, int16_t x1, int16_t y1,
                       int16_t x2, int16_t y2, uint16_t color);

void gfx_draw_polygon(const int16_t* x, const int16_t* y, uint16_t n, uint16_t color);
void gfx_fill_polygon(const int16_t* x, const int16_t* y, uint16_t n, uint16_t color);

void gfx_draw_arc(int16_t cx, int16_t cy, int16_t r, float start_deg, float end_deg, uint16_t color);
void gfx_draw_arc_thick(int16_t cx, int16_t cy, int16_t r, uint8_t thickness, float start_deg, float end_deg, uint16_t color);

// -------------- Bitmaps -------------------------------
void gfx_draw_bitmap_1bpp   (int16_t x, int16_t y, const uint8_t* bmp, int16_t w, int16_t h, uint16_t fg);
void gfx_draw_bitmap_1bpp_bg(int16_t x, int16_t y, const uint8_t* bmp, int16_t w, int16_t h, uint16_t fg,uint16_t bg);
static inline void gfx_draw_bitmap(int16_t x, int16_t y, int16_t w, int16_t h, const uint16_t* px) {
    display_draw_bitmap_rgb565((uint16_t)x, (uint16_t)y, (uint16_t)w, (uint16_t)h, px);
}

// -------------- Text (dynamic GFXfont only) -------------
void gfx_set_font(const GFXfont* f);            // set current font
void gfx_set_cursor(int16_t x, int16_t y);
void gfx_set_text_color(uint16_t fg);
void gfx_set_text_size(uint8_t size);  // >=1
void gfx_set_text_size_scale(uint8_t sx, uint8_t sy);  // >=1
void gfx_set_text_wrap(bool wrap);

void gfx_write_char(char c);        // prints one UTF-8 byte; expect ASCII
void gfx_write(const char* s);      // prints null-terminated C string

// -------------- Helpers --------------------------------
static inline uint16_t gfx_color(uint8_t r, uint8_t g, uint8_t b) { return RGB565(r, g, b); }

#ifdef __cplusplus
}
#endif
#endif // _GFX_H_