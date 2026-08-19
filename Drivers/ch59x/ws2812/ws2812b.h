/********************************** WS2812B Driver **************************
 * File Name          : ws2812b.h
 * Author             : Another
 * Description        : WS2812B RGB LED Driver with flexible pin configuration
 *********************************************************************************
 * WS2812B Timing Requirements (¡À150ns tolerance):
 * - T0H: 0.35?s (350ns) - 0 code high time
 * - T0L: 0.9?s (900ns)  - 0 code low time
 * - T1H: 0.9?s (900ns)  - 1 code high time
 * - T1L: 0.35?s (350ns) - 1 code low time
 * - RES: >50?s          - Reset time (low)
 * 
 * Measured timings at 60MHz:
 * - 2 NOPs = 375ns  (used for T0H/T1L)
 * - 10 NOPs = 917ns (used for T0L/T1H)
 *******************************************************************************/

#ifndef __WS2812B_H__
#define __WS2812B_H__

#ifdef __cplusplus
extern "C" {
#endif

#include "CH59x_common.h"
#include <stdint.h>
#include <stdlib.h>

/**
 * @brief GPIO Port Selection
 */
typedef enum {
    WS2812B_PORT_A = 0,
    WS2812B_PORT_B = 1
} WS2812B_Port;

/**
 * @brief Color structure for RGB LED
 */
typedef struct {
    uint8_t r;  // Red component (0-255)
    uint8_t g;  // Green component (0-255)
    uint8_t b;  // Blue component (0-255)
} WS2812B_Color;

/**
 * @brief WS2812B Driver handle
 */
typedef struct {
    WS2812B_Port port;      // GPIO port (A or B)
    uint32_t pin;           // GPIO pin mask
    uint16_t num_leds;      // Number of LEDs in the strip
    WS2812B_Color *buffer;  // Color buffer for all LEDs
} WS2812B_Handle;

/**
 * @brief Initialize WS2812B driver
 * 
 * @param port      GPIO port (WS2812B_PORT_A or WS2812B_PORT_B)
 * @param pin       GPIO pin mask (e.g., GPIO_Pin_15)
 * @param num_leds  Number of LEDs in the strip
 * @return Pointer to WS2812B_Handle, or NULL if initialization failed
 */
WS2812B_Handle* ws2812b_init(WS2812B_Port port, uint32_t pin, uint16_t num_leds);

/**
 * @brief Set color for a specific LED
 * 
 * @param handle    Pointer to WS2812B_Handle
 * @param index     LED index (0 to num_leds-1)
 * @param r         Red component (0-255)
 * @param g         Green component (0-255)
 * @param b         Blue component (0-255)
 * @return 0 on success, -1 on error
 */
int ws2812b_set_color(WS2812B_Handle *handle, uint16_t index, uint8_t r, uint8_t g, uint8_t b);

/**
 * @brief Set color for a specific LED using color structure
 * 
 * @param handle    Pointer to WS2812B_Handle
 * @param index     LED index (0 to num_leds-1)
 * @param color     Pointer to WS2812B_Color structure
 * @return 0 on success, -1 on error
 */
int ws2812b_set_color_rgb(WS2812B_Handle *handle, uint16_t index, WS2812B_Color *color);

/**
 * @brief Set the same color for all LEDs
 * 
 * @param handle    Pointer to WS2812B_Handle
 * @param r         Red component (0-255)
 * @param g         Green component (0-255)
 * @param b         Blue component (0-255)
 */
void ws2812b_set_all(WS2812B_Handle *handle, uint8_t r, uint8_t g, uint8_t b);

/**
 * @brief Send buffer data to LEDs (update display)
 * 
 * @param handle    Pointer to WS2812B_Handle
 * 
 * @note This function disables interrupts during transmission for timing accuracy
 */
void ws2812b_show(WS2812B_Handle *handle);

/**
 * @brief Clear all LEDs (turn them off)
 * 
 * @param handle    Pointer to WS2812B_Handle
 * @param update    If 1, immediately send to LEDs; if 0, only clear buffer
 */
void ws2812b_clear(WS2812B_Handle *handle, uint8_t update);

/**
 * @brief Free allocated memory and cleanup
 * 
 * @param handle    Pointer to WS2812B_Handle
 */
void ws2812b_free(WS2812B_Handle *handle);

/**
 * @brief Helper function to create a color from RGB values
 * 
 * @param r         Red component (0-255)
 * @param g         Green component (0-255)
 * @param b         Blue component (0-255)
 * @return WS2812B_Color structure
 */
static inline WS2812B_Color ws2812b_color(uint8_t r, uint8_t g, uint8_t b) {
    WS2812B_Color color = {r, g, b};
    return color;
}

/**
 * @brief Helper function to dim a color by a factor (0-255)
 * 
 * @param color      Pointer to WS2812B_Color structure
 * @param brightness Target Brightness
 * @return WS2812B_Color structure
 */
WS2812B_Color ws2812b_dim_color(WS2812B_Color color, uint8_t brightness);

/**
 * @brief Helper function to create a color from HSV values
 * 
 * @param h         Hue (0-359)
 * @param s         Saturation (0-255)
 * @param v         Value/Brightness (0-255)
 * @return WS2812B_Color structure
 */
WS2812B_Color ws2812b_hsv_to_rgb(uint16_t h, uint8_t s, uint8_t v);

#ifdef __cplusplus
}
#endif

#endif // __WS2812B_H__