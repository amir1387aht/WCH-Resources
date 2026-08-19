/*******************************************************************************
    @author   Another
*******************************************************************************/
#include "./gfx.h"

// ---------- Local state (no external handle needed) ----------
static uint16_t s_w=0, s_h=0;
static const GFXfont* s_font = NULL;
static uint16_t s_text_fg = COLOR_WHITE;
static uint8_t  s_text_sx = 1, s_text_sy = 1;
static int16_t  s_cursor_x = 0, s_cursor_y = 0;
static bool     s_wrap = true;

#ifndef GFX_MIN
#define GFX_MIN(a,b) ((a)<(b)?(a):(b))
#endif
#ifndef GFX_MAX
#define GFX_MAX(a,b) ((a)>(b)?(a):(b))
#endif
#ifndef GFX_SWAP
#define GFX_SWAP(a,b) do{ int16_t t=(a); (a)=(b); (b)=t; }while(0)
#endif

#ifndef GFX_ARC_STEP_DEG
#define GFX_ARC_STEP_DEG 1.0f
#endif

// ----------- PROGMEM access fallbacks (portable) -----------
#ifndef pgm_read_byte
#define pgm_read_byte(addr) (*(const uint8_t *)(addr))
#endif
#ifndef pgm_read_word
#define pgm_read_word(addr) (*(const uint16_t *)(addr))
#endif
#ifndef pgm_read_pointer
#define pgm_read_pointer(addr) (*(void* const *)(addr))
#endif

// -------------------- Internal helpers ---------------------
static inline void _refresh_size(void){ s_w = display_get_width(); s_h = display_get_height(); }
static inline float _deg2rad(float d){ return d * 3.14159265358979323846f / 180.0f; }

// -------------------- Init / rotation ----------------------
int gfx_init(display_size_e size, uint8_t rotation){
    if (display_init(size, rotation) != 0) return -1;
    _refresh_size();
    s_text_fg = COLOR_WHITE;
    s_text_sx = s_text_sy = 1;
    s_cursor_x = s_cursor_y = 0;
    s_wrap = true;
    s_font = NULL; // user must set with gfx_set_font()
    return 0;
}

void gfx_set_rotation(uint8_t rotation){ display_set_rotation(rotation); _refresh_size(); }
uint16_t gfx_width(void){ return s_w; }
uint16_t gfx_height(void){ return s_h; }

// -------------------- Circles ------------------------------
void gfx_draw_circle(int16_t x0,int16_t y0,int16_t r,uint16_t color){
    if (r<=0) return;
    int16_t f = 1 - r, ddx = 1, ddy = -2*r, x=0, y=r;
    gfx_draw_pixel(x0, y0+r, color); gfx_draw_pixel(x0, y0-r, color);
    gfx_draw_pixel(x0+r, y0, color); gfx_draw_pixel(x0-r, y0, color);
    while (x<y){
        if (f>=0){ y--; ddy+=2; f+=ddy; }
        x++; ddx+=2; f+=ddx;
        gfx_draw_pixel(x0+x, y0+y, color); gfx_draw_pixel(x0-x, y0+y, color);
        gfx_draw_pixel(x0+x, y0-y, color); gfx_draw_pixel(x0-x, y0-y, color);
        gfx_draw_pixel(x0+y, y0+x, color); gfx_draw_pixel(x0-y, y0+x, color);
        gfx_draw_pixel(x0+y, y0-x, color); gfx_draw_pixel(x0-y, y0-x, color);
    }
}

static void _circle_spans(int16_t x0,int16_t y0,int16_t x,int16_t y,uint16_t c){
    gfx_draw_hline(x0-x, y0+y, 2*x+1, c);
    gfx_draw_hline(x0-x, y0-y, 2*x+1, c);
    gfx_draw_hline(x0-y, y0+x, 2*y+1, c);
    gfx_draw_hline(x0-y, y0-x, 2*y+1, c);
}

void gfx_fill_circle(int16_t x0, int16_t y0, int16_t r, uint16_t color){
    if (r <= 0) return;

    int16_t f = 1 - r;
    int16_t ddF_x = 1;
    int16_t ddF_y = -2 * r;
    int16_t x = 0;
    int16_t y = r;

    // initial center horizontal line
    gfx_draw_hline(x0 - r, y0, 2*r + 1, color);

    while (x < y) {
        if (f >= 0) { y--; ddF_y += 2; f += ddF_y; }
        x++; ddF_x += 2; f += ddF_x;

        // four spans
        gfx_draw_hline(x0 - x, y0 + y, 2*x + 1, color);
        gfx_draw_hline(x0 - x, y0 - y, 2*x + 1, color);
        gfx_draw_hline(x0 - y, y0 + x, 2*y + 1, color);
        gfx_draw_hline(x0 - y, y0 - x, 2*y + 1, color);
    }
}

// -------------------- Triangles ----------------------------
void gfx_draw_triangle(int16_t x0,int16_t y0,int16_t x1,int16_t y1,
                       int16_t x2,int16_t y2,uint16_t color){
    gfx_draw_line(x0,y0,x1,y1,color);
    gfx_draw_line(x1,y1,x2,y2,color);
    gfx_draw_line(x2,y2,x0,y0,color);
}
void gfx_fill_triangle(int16_t x0,int16_t y0,int16_t x1,int16_t y1,
                       int16_t x2,int16_t y2,uint16_t color){
    if (y0>y1){ GFX_SWAP(y0,y1); GFX_SWAP(x0,x1); }
    if (y1>y2){ GFX_SWAP(y1,y2); GFX_SWAP(x1,x2); }
    if (y0>y1){ GFX_SWAP(y0,y1); GFX_SWAP(x0,x1); }

    if (y0==y2){
        int16_t a=GFX_MIN(GFX_MIN(x0,x1),x2), b=GFX_MAX(GFX_MAX(x0,x1),x2);
        gfx_draw_hline(a,y0,b-a+1,color);
        return;
    }

    int32_t dx01=x1-x0, dy01=y1-y0, dx02=x2-x0, dy02=y2-y0, dx12=x2-x1, dy12=y2-y1;
    int32_t sa=0, sb=0; int16_t y, last=(y1==y2)?y1:y1-1;

    for (y=y0; y<=last; y++){
        int16_t a = x0 + (dy01? (sa/dy01):0);
        int16_t b = x0 + (dy02? (sb/dy02):0);
        sa += dx01; sb += dx02;
        if (a>b) GFX_SWAP(a,b);
        gfx_draw_hline(a,y,b-a+1,color);
    }
    sa = dx12*(y - y1); sb = dx02*(y - y0);
    for (; y<=y2; y++){
        int16_t a = x1 + (dy12? (sa/dy12):0);
        int16_t b = x0 + (dy02? (sb/dy02):0);
        sa += dx12; sb += dx02;
        if (a>b) GFX_SWAP(a,b);
        gfx_draw_hline(a,y,b-a+1,color);
    }
}

// -------------------- Polygons -----------------------------
void gfx_draw_polygon(const int16_t* x,const int16_t* y,uint16_t n,uint16_t color){
    if (!x||!y||n<2) return;
    for (uint16_t i=0;i<n-1;i++) gfx_draw_line(x[i],y[i],x[i+1],y[i+1],color);
    gfx_draw_line(x[n-1],y[n-1],x[0],y[0],color);
}

void gfx_fill_polygon(const int16_t* x,const int16_t* y,uint16_t n,uint16_t color){
    if (!x||!y||n<3) return;
    int16_t ymin=y[0], ymax=y[0];
    for (uint16_t i=1;i<n;i++){ if (y[i]<ymin) ymin=y[i]; if (y[i]>ymax) ymax=y[i]; }
    for (int16_t scan=ymin; scan<=ymax; scan++){
        int16_t j=(int16_t)n-1; uint16_t count=0;
        int16_t* nodes=(int16_t*)alloca(sizeof(int16_t)*n);
        for (uint16_t i=0;i<n;i++){
            int16_t yi=y[i], yj=y[j], xi=x[i], xj=x[j];
            if ( ((yi<scan)&&(yj>=scan)) || ((yj<scan)&&(yi>=scan)) ){
                int32_t xs = xi + (int32_t)(scan-yi)*(xj-xi)/(yj-yi);
                nodes[count++] = (int16_t)xs;
            }
            j=i;
        }
        // insertion sort (n small)
        for (uint16_t i=1;i<count;i++){ int16_t key=nodes[i]; int k=i-1; while (k>=0 && nodes[k]>key){ nodes[k+1]=nodes[k]; k--; } nodes[k+1]=key; }
        for (uint16_t i=0;i+1<count;i+=2){
            int16_t a=nodes[i], b=nodes[i+1]; if (a<=b) gfx_draw_hline(a,scan,b-a+1,color);
        }
    }
}

// -------------------- Arcs -------------------------------
static void _arc_segments(int16_t cx,int16_t cy,int16_t r,float sdeg,float edeg,uint16_t c){
    if (r<=0) return; while (edeg<sdeg) edeg+=360.0f;
    float step=GFX_ARC_STEP_DEG;
    int16_t x_prev=(int16_t)(cx + r * cosf(_deg2rad(sdeg)));
    int16_t y_prev=(int16_t)(cy + r * sinf(_deg2rad(sdeg)));
    for (float a=sdeg+step; a<=edeg+0.001f; a+=step){
        float aa=(a>edeg)?edeg:a;
        int16_t x=(int16_t)(cx + r * cosf(_deg2rad(aa)));
        int16_t y=(int16_t)(cy + r * sinf(_deg2rad(aa)));
        gfx_draw_line(x_prev,y_prev,x,y,c); x_prev=x; y_prev=y;
    }
}

void gfx_draw_arc(int16_t cx,int16_t cy,int16_t r,float sdeg,float edeg,uint16_t color){
    _arc_segments(cx,cy,r,sdeg,edeg,color);
}

void gfx_draw_arc_thick(int16_t cx,int16_t cy,int16_t r,uint8_t t,float sdeg,float edeg,uint16_t color){
    if (!t) { gfx_draw_arc(cx,cy,r,sdeg,edeg,color); return; }
    uint8_t half=t/2;
    for (uint8_t i=0;i<=half;i++){
        _arc_segments(cx,cy,r-i,sdeg,edeg,color);
        if (i) _arc_segments(cx,cy,r+i,sdeg,edeg,color);
    }
}

// -------------------- Bitmaps ----------------------------
void gfx_draw_bitmap_1bpp(int16_t x,int16_t y,const uint8_t* bmp,int16_t w,int16_t h,uint16_t fg){
    if (!bmp||w<=0||h<=0) return;
    int16_t bw=(w+7)/8;
    for (int16_t j=0;j<h;j++){
        for (int16_t i=0;i<w;i++){
            uint8_t b = pgm_read_byte(&bmp[j*bw + (i>>3)]);
            if (b & (0x80 >> (i & 7))) gfx_draw_pixel(x+i,y+j,fg);
        }
    }
}

void gfx_draw_bitmap_1bpp_bg(int16_t x,int16_t y,const uint8_t* bmp,int16_t w,int16_t h,uint16_t fg,uint16_t bg){
    if (!bmp||w<=0||h<=0) return;
    int16_t bw=(w+7)/8;
    for (int16_t j=0;j<h;j++){
        for (int16_t i=0;i<w;i++){
            uint8_t b = pgm_read_byte(&bmp[j*bw + (i>>3)]);
            gfx_draw_pixel(x+i,y+j, (b & (0x80>>(i&7)))? fg : bg);
        }
    }
}

// -------------------- Text (GFXfont only) ----------------
void gfx_set_font(const GFXfont* f) { s_font = f; }
void gfx_set_cursor(int16_t x,int16_t y) { s_cursor_x=x; s_cursor_y=y; }
void gfx_set_text_color(uint16_t fg) { s_text_fg=fg; }
void gfx_set_text_size(uint8_t size) { s_text_sx = size; s_text_sy = size; }
void gfx_set_text_size_scale(uint8_t sx,uint8_t sy) { s_text_sx = sx? sx:1; s_text_sy = sy? sy:1; }
void gfx_set_text_wrap(bool wrap) { s_wrap=wrap; }

static inline const GFXglyph* _glyph(uint8_t c){
    if (!s_font) return NULL;
    uint8_t first = s_font->first, last = s_font->last;
    if (c < first || c > last) return NULL;
    return &s_font->glyph[c - first];
}

static void _draw_char_gfxfont(int16_t x,int16_t y,char c){
    if (!s_font) return;
    const GFXglyph* g = _glyph((uint8_t)c);
    if (!g) return;

    uint16_t bo = pgm_read_word(&g->bitmapOffset);
    uint8_t  w  = g->width, h = g->height;
    int8_t   xo = g->xOffset, yo = g->yOffset;

    // quick clip reject
    int16_t x1 = x + xo * (int16_t)s_text_sx;
    int16_t y1 = y + yo * (int16_t)s_text_sy;
    int16_t x2 = x1 + w * (int16_t)s_text_sx - 1;
    int16_t y2 = y1 + h * (int16_t)s_text_sy - 1;
    if (x2 < 0 || y2 < 0 || x1 >= (int16_t)s_w || y1 >= (int16_t)s_h) {
        // still advance cursor; actual pixels off-screen
    }

    const uint8_t* bitmap = s_font->bitmap;
    uint8_t bits=0, bit=0;

    for (uint8_t yy=0; yy<h; yy++){
        for (uint8_t xx=0; xx<w; xx++){
            if (!(bit++ & 7)) bits = pgm_read_byte(&bitmap[bo++]);
            if (bits & 0x80){
                if (s_text_sx==1 && s_text_sy==1){
                    gfx_draw_pixel(x + xo + xx, y + yo + yy, s_text_fg);
                } else {
                    gfx_fill_rect(x + (xo+xx)*s_text_sx,
                                  y + (yo+yy)*s_text_sy,
                                  s_text_sx, s_text_sy, s_text_fg);
                }
            }
            bits <<= 1;
        }
    }
}

void gfx_write_char(char c){
    if (!s_font) return;           // no font set; ignore
    if (c == '\r') return;
    if (c == '\n'){ s_cursor_x = 0; s_cursor_y += (int16_t)s_text_sy * s_font->yAdvance; return; }

    const GFXglyph* g = _glyph((uint8_t)c);
    if (!g){ return; }

    // wrap check using glyph bounds
    int16_t w = (int16_t)s_text_sx * ( (int16_t)g->xOffset + (int16_t)g->width );
    if (s_wrap && (s_cursor_x + w) > (int16_t)s_w){
        s_cursor_x = 0;
        s_cursor_y += (int16_t)s_text_sy * s_font->yAdvance;
    }

    _draw_char_gfxfont(s_cursor_x, s_cursor_y, c);
    s_cursor_x += (int16_t)g->xAdvance * (int16_t)s_text_sx;
}

void gfx_write(const char* s){
    if (!s || !s_font) return;
    while (*s) gfx_write_char(*s++);
}