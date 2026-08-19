################################################################################
# MRS Version: 2.3.0
# Automatically-generated file. Do not edit!
################################################################################

# Add inputs and outputs from these tool invocations to the build variables 
C_SRCS += \
../Profile/devinfoservice.c \
../Profile/gattprofile.c 

C_DEPS += \
./Profile/devinfoservice.d \
./Profile/gattprofile.d 

OBJS += \
./Profile/devinfoservice.o \
./Profile/gattprofile.o 

DIR_OBJS += \
./Profile/*.o \

DIR_DEPS += \
./Profile/*.d \

DIR_EXPANDS += \
./Profile/*.234r.expand \


# Each subdirectory must supply rules for building sources it contributes
Profile/%.o: ../Profile/%.c
	@	riscv-none-embed-gcc -march=rv32imac -mabi=ilp32 -mcmodel=medany -msmall-data-limit=8 -mno-save-restore -fmax-errors=20 -Os -fmessage-length=0 -fsigned-char -ffunction-sections -fdata-sections -fno-common -g -DDEBUG=1 -I"d:/Projects/Wch-Projects/CH591R-BLE/Startup" -I"d:/Projects/Wch-Projects/CH591R-BLE/Profile/include" -I"d:/Projects/Wch-Projects/CH591R-BLE/StdPeriphDriver/inc" -I"d:/Projects/Wch-Projects/CH591R-BLE/HAL/include" -I"d:/Projects/Wch-Projects/CH591R-BLE/Ld" -I"d:/Projects/Wch-Projects/CH591R-BLE/LIB" -I"d:/Projects/Wch-Projects/CH591R-BLE/RVMSIS" -std=gnu99 -MMD -MP -MF"$(@:%.o=%.d)" -MT"$(@)" -c -o "$@" "$<"

