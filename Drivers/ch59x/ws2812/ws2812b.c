/********************************** WS2812B Driver **************************
 * File Name          : ws2812b.c
 * Author             : Another
 * Description        : WS2812B RGB LED Driver Implementation
 *******************************************************************************/

#include "ws2812b.h"
#include <string.h>

// Timing macros based on 60MHz clock
// 2 NOPs = 375ns (for T0H and T1L - target 350ns)
#define WS2812B_SHORT_DELAY() \
    __asm__ volatile( \
        "nop\n" \
        "nop\n" \
    )

// 10 NOPs = 917ns (for T0L and T1H - target 900ns)
#define WS2812B_LONG_DELAY() \
    __asm__ volatile( \
        "nop\n" \
        "nop\n" \
        "nop\n" \
        "nop\n" \
        "nop\n" \
        "nop\n" \
        "nop\n" \
        "nop\n" \
        "nop\n" \
        "nop\n" \
    )

/**
 * @brief Send a single bit to WS2812B
 */
static inline void ws2812b_send_bit(WS2812B_Handle *handle, uint8_t bit) {
    if (handle->port == WS2812B_PORT_A) {
        if (bit) {
            // Send 1: High for 900ns, Low for 350ns
            GPIOA_SetBits(handle->pin);
            WS2812B_LONG_DELAY();
            GPIOA_ResetBits(handle->pin);
            WS2812B_SHORT_DELAY();
        } else {
            // Send 0: High for 350ns, Low for 900ns
            GPIOA_SetBits(handle->pin);
            WS2812B_SHORT_DELAY();
            GPIOA_ResetBits(handle->pin);
            WS2812B_LONG_DELAY();
        }
    } else {
        if (bit) {
            // Send 1: High for 900ns, Low for 350ns
            GPIOB_SetBits(handle->pin);
            WS2812B_LONG_DELAY();
            GPIOB_ResetBits(handle->pin);
            WS2812B_SHORT_DELAY();
        } else {
            // Send 0: High for 350ns, Low for 900ns
            GPIOB_SetBits(handle->pin);
            WS2812B_SHORT_DELAY();
            GPIOB_ResetBits(handle->pin);
            WS2812B_LONG_DELAY();
        }
    }
}

/**
 * @brief Send a single byte to WS2812B (MSB first)
 */
static void ws2812b_send_byte(WS2812B_Handle *handle, uint8_t byte) {
    for (int8_t i = 7; i >= 0; i--) {
        ws2812b_send_bit(handle, (byte >> i) & 0x01);
    }
}

/**
 * @brief Send reset signal (>50?s low)
 */
static void ws2812b_reset(WS2812B_Handle *handle) {
    if (handle->port == WS2812B_PORT_A) {
        GPIOA_ResetBits(handle->pin);
    } else {
        GPIOB_ResetBits(handle->pin);
    }
    
    // Delay for >50?s (using simple delay loop)
    // At 60MHz, need ~3000 cycles for 50?s
    for (volatile uint16_t i = 0; i < 1000; i++) {
        __asm__ volatile("nop");
    }
}

/**
 * @brief Initialize WS2812B driver
 */
WS2812B_Handle* ws2812b_init(WS2812B_Port port, uint32_t pin, uint16_t num_leds) {
    if (num_leds == 0) {
        return NULL;
    }
    
    // Allocate handle
    WS2812B_Handle *handle = (WS2812B_Handle*)malloc(sizeof(WS2812B_Handle));
    if (handle == NULL) {
        return NULL;
    }
    
    // Allocate color buffer
    handle->buffer = (WS2812B_Color*)malloc(sizeof(WS2812B_Color) * num_leds);
    if (handle->buffer == NULL) {
        free(handle);
        return NULL;
    }
    
    // Initialize handle
    handle->port = port;
    handle->pin = pin;
    handle->num_leds = num_leds;
    
    // Configure GPIO pin as push-pull output with 20mA drive
    if (port == WS2812B_PORT_A) {
        GPIOA_ModeCfg(pin, GPIO_ModeOut_PP_20mA);
        GPIOA_ResetBits(pin);
    } else {
        GPIOB_ModeCfg(pin, GPIO_ModeOut_PP_20mA);
        GPIOB_ResetBits(pin);
    }
    
    // Clear all LEDs
    memset(handle->buffer, 0, sizeof(WS2812B_Color) * num_leds);
    
    return handle;
}

/**
 * @brief Dim a color by a factor (0-255)
 */
WS2812B_Color ws2812b_dim_color(WS2812B_Color color, uint8_t brightness) {
    color.r = ((uint16_t)color.r * brightness) / 255;
    color.g = ((uint16_t)color.g * brightness) / 255;
    color.b = ((uint16_t)color.b * brightness) / 255;
    return color;
}

/**
 * @brief Set color for a specific LED
 */
int ws2812b_set_color(WS2812B_Handle *handle, uint16_t index, uint8_t r, uint8_t g, uint8_t b) {
    if (handle == NULL || index >= handle->num_leds) {
        return -1;
    }
    
    handle->buffer[index].r = r;
    handle->buffer[index].g = g;
    handle->buffer[index].b = b;
    
    return 0;
}

/**
 * @brief Set color for a specific LED using color structure
 */
int ws2812b_set_color_rgb(WS2812B_Handle *handle, uint16_t index, WS2812B_Color *color) {
    if (handle == NULL || color == NULL || index >= handle->num_leds) {
        return -1;
    }
    
    handle->buffer[index] = *color;
    
    return 0;
}

/**
 * @brief Set the same color for all LEDs
 */
void ws2812b_set_all(WS2812B_Handle *handle, uint8_t r, uint8_t g, uint8_t b) {
    if (handle == NULL) {
        return;
    }
    
    for (uint16_t i = 0; i < handle->num_leds; i++) {
        handle->buffer[i].r = r;
        handle->buffer[i].g = g;
        handle->buffer[i].b = b;
    }
}

/**
 * @brief Send buffer data to LEDs (update display)
 */
void ws2812b_show(WS2812B_Handle *handle) {
    if (handle == NULL) {
        return;
    }
    
    // Disable interrupts for timing-critical section
    uint32_t int_state;
    SYS_DisableAllIrq(&int_state);
    
    // Send data for each LED
    // WS2812B expects data in GRB order (not RGB!)
    for (uint16_t i = 0; i < handle->num_leds; i++) {
        ws2812b_send_byte(handle, handle->buffer[i].g);  // Green first
        ws2812b_send_byte(handle, handle->buffer[i].r);  // Red second
        ws2812b_send_byte(handle, handle->buffer[i].b);  // Blue third
    }
    
    // Send reset signal to latch data
    ws2812b_reset(handle);
    
    // Re-enable interrupts
    SYS_RecoverIrq(int_state);
}

/**
 * @brief Clear all LEDs (turn them off)
 */
void ws2812b_clear(WS2812B_Handle *handle, uint8_t update) {
    if (handle == NULL) {
        return;
    }
    
    // Clear buffer
    memset(handle->buffer, 0, sizeof(WS2812B_Color) * handle->num_leds);
    
    // Send to LEDs if requested
    if (update) {
        ws2812b_show(handle);
    }
}

/**
 * @brief Free allocated memory and cleanup
 */
void ws2812b_free(WS2812B_Handle *handle) {
    if (handle == NULL) {
        return;
    }
    
    if (handle->buffer != NULL) {
        free(handle->buffer);
    }
    
    free(handle);
}

/**
 * @brief Helper function to create a color from HSV values
 */
WS2812B_Color ws2812b_hsv_to_rgb(uint16_t h, uint8_t s, uint8_t v) {
    WS2812B_Color color;
    
    if (s == 0) {
        // Achromatic (grey)
        color.r = color.g = color.b = v;
        return color;
    }
    
    h %= 360;  // Ensure h is in range 0-359
    uint8_t region = h / 60;
    uint8_t remainder = (h - (region * 60)) * 6;
    
    uint8_t p = (v * (255 - s)) >> 8;
    uint8_t q = (v * (255 - ((s * remainder) >> 8))) >> 8;
    uint8_t t = (v * (255 - ((s * (255 - remainder)) >> 8))) >> 8;
    
    switch (region) {
        case 0:
            color.r = v; color.g = t; color.b = p;
            break;
        case 1:
            color.r = q; color.g = v; color.b = p;
            break;
        case 2:
            color.r = p; color.g = v; color.b = t;
            break;
        case 3:
            color.r = p; color.g = q; color.b = v;
            break;
        case 4:
            color.r = t; color.g = p; color.b = v;
            break;
        default:
            color.r = v; color.g = p; color.b = q;
            break;
    }
    
    return color;
}