################################################################################
# MRS Version: 2.3.0
# Automatically-generated file. Do not edit!
################################################################################
-include ../makefile.init

RM := rm -rf

# All of the sources participating in the build are defined here
-include sources.mk
-include StdPeriphDriver/subdir.mk
-include Startup/subdir.mk
-include RVMSIS/subdir.mk
-include LIB/subdir.mk
-include HAL/subdir.mk
-include APP/utils/subdir.mk
-include APP/drivers/subdir.mk
-include APP/ble/subdir.mk
-include APP/subdir.mk
-include subdir.mk
-include objects.mk

ifneq ($(MAKECMDGOALS),clean)
ifneq ($(strip $(S_DEPS)),)
-include $(S_DEPS)
endif
ifneq ($(strip $(S_UPPER_DEPS)),)
-include $(S_UPPER_DEPS)
endif
ifneq ($(strip $(ASM_DEPS)),)
-include $(ASM_DEPS)
endif
ifneq ($(strip $(ASM_UPPER_DEPS)),)
-include $(ASM_UPPER_DEPS)
endif
ifneq ($(strip $(C_DEPS)),)
-include $(C_DEPS)
endif
endif

-include ../makefile.defs

# Add inputs and outputs from these tool invocations to the build variables 
SECONDARY_FLASH += \
CH591R-BLE.hex \

SECONDARY_LIST += \
CH591R-BLE.lst \

SECONDARY_SIZE += \
CH591R-BLE.siz \


# All Target
all: 
	$(MAKE) --no-print-directory main-build 

main-build: CH591R-BLE.elf secondary-outputs

# Tool invocations
CH591R-BLE.elf: $(OBJS) $(USER_OBJS_ESCAPE)
	@	riscv-wch-elf-gcc -march=rv32imac -mabi=ilp32 -mcmodel=medany -msmall-data-limit=8 -mno-save-restore -fmax-errors=20 -O3 -fmessage-length=0 -fsigned-char -ffunction-sections -fdata-sections -fno-common -g -T "d:/Projects/Wch-Projects/CH591R-BLE/Ld/Link.ld" -nostartfiles -Xlinker --gc-sections -L"d:\Projects\Wch-Projects\CH591R-BLE" -L"d:/Projects/Wch-Projects/CH591R-BLE/LIB" -L"d:/Projects/Wch-Projects/CH591R-BLE/StdPeriphDriver" -Xlinker --print-memory-usage -Wl,-Map,"CH591R-BLE.map" --specs=nano.specs --specs=nosys.specs -o "CH591R-BLE.elf" $(OBJS) $(LIBS)
CH591R-BLE.hex: CH591R-BLE.elf
	@	riscv-wch-elf-objcopy -O ihex "CH591R-BLE.elf" "CH591R-BLE.hex"
CH591R-BLE.lst: CH591R-BLE.elf
	@	riscv-wch-elf-objdump --source --all-headers --demangle --line-numbers --wide "CH591R-BLE.elf" > "CH591R-BLE.lst"
CH591R-BLE.siz: CH591R-BLE.elf
	riscv-wch-elf-size --format=berkeley "CH591R-BLE.elf"

# Other Targets
clean:
	-$(RM) $(DIR_OBJS) $(SECONDARY_FLASH)$(SECONDARY_LIST)$(SECONDARY_SIZE) CH591R-BLE.elf
	-$(RM) $(DIR_EXPANDS) $(CALLGRAPH_DOT)
	-$(RM) $(DIR_DEPS)
secondary-outputs: $(SECONDARY_FLASH) $(SECONDARY_LIST) $(SECONDARY_SIZE)

.PHONY: all clean dependents

-include ../makefile.targets