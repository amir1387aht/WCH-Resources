################################################################################
# MRS Version: 2.3.0
# Automatically-generated file. Do not edit!
################################################################################

# Add inputs and outputs from these tool invocations to the build variables 
C_SRCS += \
../APP/usb/usb.c 

C_DEPS += \
./APP/usb/usb.d 

OBJS += \
./APP/usb/usb.o 

DIR_OBJS += \
./APP/usb/*.o \

DIR_DEPS += \
./APP/usb/*.d \

DIR_EXPANDS += \
./APP/usb/*.234r.expand \


# Each subdirectory must supply rules for building sources it contributes
APP/usb/%.o: ../APP/usb/%.c
	@	riscv-none-embed-gcc -march=rv32imac -mabi=ilp32 -mcmodel=medany -msmall-data-limit=8 -mno-save-restore -fmax-errors=20 -Os -fmessage-length=0 -fsigned-char -ffunction-sections -fdata-sections -fno-common -g -DDEBUG=1 -I"d:/Projects/Wch-Projects/CH591R-BLE/Startup" -I"d:/Projects/Wch-Projects/CH591R-BLE/StdPeriphDriver/inc" -I"d:/Projects/Wch-Projects/CH591R-BLE/HAL/include" -I"d:/Projects/Wch-Projects/CH591R-BLE/Ld" -I"d:/Projects/Wch-Projects/CH591R-BLE/LIB" -I"d:/Projects/Wch-Projects/CH591R-BLE/RVMSIS" -std=gnu99 -MMD -MP -MF"$(@:%.o=%.d)" -MT"$(@)" -c -o "$@" "$<"

