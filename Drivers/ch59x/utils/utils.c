#include "./utils.h"

extern uint32_t _end;

uint32_t get_free_sram(void)
{
    uint32_t stack;
    return (uint32_t)&stack - (uint32_t)&_end;
}