################################################################################
# MRS Version: 2.3.0
# Automatically-generated file. Do not edit!
################################################################################

# Add inputs and outputs from these tool invocations to the build variables 
C_SRCS += \
../APP/ble/ble.c \
../APP/ble/devinfoservice.c \
../APP/ble/gattprofile.c 

C_DEPS += \
./APP/ble/ble.d \
./APP/ble/devinfoservice.d \
./APP/ble/gattprofile.d 

OBJS += \
./APP/ble/ble.o \
./APP/ble/devinfoservice.o \
./APP/ble/gattprofile.o 

DIR_OBJS += \
./APP/ble/*.o \

DIR_DEPS += \
./APP/ble/*.d \

DIR_EXPANDS += \
./APP/ble/*.253r.expand \


# Each subdirectory must supply rules for building sources it contributes
APP/ble/%.o: ../APP/ble/%.c
	@	riscv-wch-elf-gcc -march=rv32imac -mabi=ilp32 -mcmodel=medany -msmall-data-limit=8 -mno-save-restore -fmax-errors=20 -O3 -fmessage-length=0 -fsigned-char -ffunction-sections -fdata-sections -fno-common -g -DDEBUG=1 -I"d:/Projects/Wch-Projects/CH591R-BLE/Startup" -I"d:/Projects/Wch-Projects/CH591R-BLE/StdPeriphDriver/inc" -I"d:/Projects/Wch-Projects/CH591R-BLE/HAL/include" -I"d:/Projects/Wch-Projects/CH591R-BLE/Ld" -I"d:/Projects/Wch-Projects/CH591R-BLE/LIB" -I"d:/Projects/Wch-Projects/CH591R-BLE/RVMSIS" -std=gnu99 -MMD -MP -MF"$(@:%.o=%.d)" -MT"$(@)" -c -o "$@" "$<"

