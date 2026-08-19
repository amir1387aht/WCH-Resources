/********************************** (C) COPYRIGHT *******************************
 * File Name          : gattprofile.c
 * Author             : WCH
 * Version            : V1.0
 * Date               : 2018/12/10
 * Description        : Simplified profile with one string characteristic
 *********************************************************************************
 * Copyright (c) 2021 Nanjing Qinheng Microelectronics Co., Ltd.
 * Attention: This software (modified or not) and binary are used for 
 * microcontroller manufactured by Nanjing Qinheng Microelectronics.
 *******************************************************************************/

/*********************************************************************
 * INCLUDES
 */
#include "CONFIG.h"
#include "gattprofile.h"

/*********************************************************************
 * MACROS
 */

/*********************************************************************
 * CONSTANTS
 */

/*********************************************************************
 * TYPEDEFS
 */

/*********************************************************************
 * GLOBAL VARIABLES
 */
// Simple GATT Profile Service UUID: 0xFFE0
const uint8_t dataProfileServUUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(DATAPROFILE_SERV_UUID), HI_UINT16(DATAPROFILE_SERV_UUID)};

// String Characteristic UUID: 0xFFE1
const uint8_t dataProfileStringUUID[ATT_BT_UUID_SIZE] = {
    LO_UINT16(DATAPROFILE_STRING_UUID), HI_UINT16(DATAPROFILE_STRING_UUID)};

/*********************************************************************
 * EXTERNAL VARIABLES
 */

/*********************************************************************
 * EXTERNAL FUNCTIONS
 */

/*********************************************************************
 * LOCAL VARIABLES
 */

static dataProfileCBs_t *dataProfile_AppCBs = NULL;

/*********************************************************************
 * Profile Attributes - variables
 */

// Simple Profile Service attribute
static const gattAttrType_t dataProfileService = {ATT_BT_UUID_SIZE, dataProfileServUUID};

// Simple Profile String Characteristic Properties
static uint8_t dataProfileStringProps = GATT_PROP_WRITE | GATT_PROP_WRITE_NO_RSP;

// String Characteristic Value - buffer to store received string
static uint8_t dataProfileString[DATAPROFILE_STRING_LEN] = {0};

// Simple Profile String Characteristic User Description
static uint8_t dataProfileStringUserDesp[] = "Input\0";

/*********************************************************************
 * Profile Attributes - Table
 */

static gattAttribute_t dataProfileAttrTbl[] = {
    // Simple Profile Service
    {
        {ATT_BT_UUID_SIZE, primaryServiceUUID}, /* type */
        GATT_PERMIT_READ,                       /* permissions */
        0,                                      /* handle */
        (uint8_t *)&dataProfileService        /* pValue */
    },

    // String Characteristic Declaration
    {
        {ATT_BT_UUID_SIZE, characterUUID},
        GATT_PERMIT_READ,
        0,
        &dataProfileStringProps},

    // String Characteristic Value
    {
        {ATT_BT_UUID_SIZE, dataProfileStringUUID},
        GATT_PERMIT_WRITE,
        0,
        dataProfileString},

    // String Characteristic User Description
    {
        {ATT_BT_UUID_SIZE, charUserDescUUID},
        GATT_PERMIT_READ,
        0,
        dataProfileStringUserDesp},
};

/*********************************************************************
 * LOCAL FUNCTIONS
 */
static bStatus_t dataProfile_ReadAttrCB(uint16_t connHandle, gattAttribute_t *pAttr,
                                          uint8_t *pValue, uint16_t *pLen, uint16_t offset, 
                                          uint16_t maxLen, uint8_t method);
static bStatus_t dataProfile_WriteAttrCB(uint16_t connHandle, gattAttribute_t *pAttr,
                                           uint8_t *pValue, uint16_t len, uint16_t offset, 
                                           uint8_t method);

/*********************************************************************
 * PROFILE CALLBACKS
 */
// Simple Profile Service Callbacks
static gattServiceCBs_t dataProfileCBs = {
    dataProfile_ReadAttrCB,  // Read callback function pointer
    dataProfile_WriteAttrCB, // Write callback function pointer
    NULL                       // Authorization callback function pointer
};

/*********************************************************************
 * PUBLIC FUNCTIONS
 */

/*********************************************************************
 * @fn      dataProfile_AddService
 *
 * @brief   Initializes the Simple GATT Profile service by registering
 *          GATT attributes with the GATT server.
 *
 * @param   services - services to add. This is a bit map and can
 *                     contain more than one service.
 *
 * @return  Success or Failure
 */
bStatus_t dataProfile_AddService(uint32_t services)
{
    uint8_t status = SUCCESS;

    if(services & DATAPROFILE_SERVICE)
    {
        // Register GATT attribute list and CBs with GATT Server App
        status = GATTServApp_RegisterService(dataProfileAttrTbl,
                                             GATT_NUM_ATTRS(dataProfileAttrTbl),
                                             GATT_MAX_ENCRYPT_KEY_SIZE,
                                             &dataProfileCBs);
    }

    return (status);
}

/*********************************************************************
 * @fn      dataProfile_RegisterAppCBs
 *
 * @brief   Registers the application callback function. Only call
 *          this function once.
 *
 * @param   callbacks - pointer to application callbacks.
 *
 * @return  SUCCESS or bleAlreadyInRequestedMode
 */
bStatus_t dataProfile_RegisterAppCBs(dataProfileCBs_t *appCallbacks)
{
    if(appCallbacks)
    {
        dataProfile_AppCBs = appCallbacks;

        return (SUCCESS);
    }
    else
    {
        return (bleAlreadyInRequestedMode);
    }
}

/*********************************************************************
 * @fn      dataProfile_SetParameter
 *
 * @brief   Set a Simple GATT Profile parameter.
 *
 * @param   param - Profile parameter ID
 * @param   len - length of data to write
 * @param   value - pointer to data to write.  This is dependent on
 *          the parameter ID and WILL be cast to the appropriate
 *          data type (example: data type of uint16_t will be cast to
 *          uint16_t pointer).
 *
 * @return  bStatus_t
 */
bStatus_t dataProfile_SetParameter(uint8_t param, uint8_t len, void *value)
{
    bStatus_t ret = SUCCESS;

    switch(param)
    {
        case DATAPROFILE_STRING_CHAR:
            if(len <= DATAPROFILE_STRING_LEN)
            {
                tmos_memcpy(dataProfileString, value, len);
            }
            else
            {
                ret = bleInvalidRange;
            }
            break;

        default:
            ret = INVALIDPARAMETER;
            break;
    }

    return (ret);
}

/*********************************************************************
 * @fn      dataProfile_GetParameter
 *
 * @brief   Get a Simple GATT Profile parameter.
 *
 * @param   param - Profile parameter ID
 * @param   value - pointer to data to put.  This is dependent on
 *          the parameter ID and WILL be cast to the appropriate
 *          data type (example: data type of uint16_t will be cast to
 *          uint16_t pointer).
 *
 * @return  bStatus_t
 */
bStatus_t dataProfile_GetParameter(uint8_t param, void *value)
{
    bStatus_t ret = SUCCESS;

    switch(param)
    {
        case DATAPROFILE_STRING_CHAR:
            tmos_memcpy(value, dataProfileString, DATAPROFILE_STRING_LEN);
            break;

        default:
            ret = INVALIDPARAMETER;
            break;
    }

    return (ret);
}

/*********************************************************************
 * @fn          dataProfile_ReadAttrCB
 *
 * @brief       Read an attribute.
 *
 * @param       connHandle - connection message was received on
 * @param       pAttr - pointer to attribute
 * @param       pValue - pointer to data to be read
 * @param       pLen - length of data to be read
 * @param       offset - offset of the first octet to be read
 * @param       maxLen - maximum length of data to be read
 *
 * @return      Success or Failure
 */
static bStatus_t dataProfile_ReadAttrCB(uint16_t connHandle, gattAttribute_t *pAttr,
                                          uint8_t *pValue, uint16_t *pLen, uint16_t offset, 
                                          uint16_t maxLen, uint8_t method)
{
    bStatus_t status = SUCCESS;

    // String characteristic is write-only, so no read implementation needed
    *pLen = 0;
    status = ATT_ERR_ATTR_NOT_FOUND;

    return (status);
}

/*********************************************************************
 * @fn      dataProfile_WriteAttrCB
 *
 * @brief   Validate attribute data prior to a write operation
 *
 * @param   connHandle - connection message was received on
 * @param   pAttr - pointer to attribute
 * @param   pValue - pointer to data to be written
 * @param   len - length of data
 * @param   offset - offset of the first octet to be written
 *
 * @return  Success or Failure
 */
static bStatus_t dataProfile_WriteAttrCB(uint16_t connHandle, gattAttribute_t *pAttr,
                                           uint8_t *pValue, uint16_t len, uint16_t offset, 
                                           uint8_t method)
{
    bStatus_t status = SUCCESS;
    uint8_t   notifyApp = 0xFF;

    // If attribute permissions require authorization to write, return error
    if(gattPermitAuthorWrite(pAttr->permissions))
    {
        // Insufficient authorization
        return (ATT_ERR_INSUFFICIENT_AUTHOR);
    }

    if(pAttr->type.len == ATT_BT_UUID_SIZE)
    {
        // 16-bit UUID
        uint16_t uuid = BUILD_UINT16(pAttr->type.uuid[0], pAttr->type.uuid[1]);
        switch(uuid)
        {
            case DATAPROFILE_STRING_UUID:
                // Validate the value
                // Make sure it's not a blob operation
                if(offset == 0)
                {
                    if(len > DATAPROFILE_STRING_LEN)
                    {
                        status = ATT_ERR_INVALID_VALUE_SIZE;
                    }
                }
                else
                {
                    status = ATT_ERR_ATTR_NOT_LONG;
                }

                // Write the value
                if(status == SUCCESS)
                {
                    // Clear the buffer first
                    tmos_memset(pAttr->pValue, 0, DATAPROFILE_STRING_LEN);
                    // Copy the new string
                    tmos_memcpy(pAttr->pValue, pValue, len);
                    notifyApp = DATAPROFILE_STRING_CHAR;
                }
                break;

            default:
                status = ATT_ERR_ATTR_NOT_FOUND;
                break;
        }
    }
    else
    {
        // 128-bit UUID
        status = ATT_ERR_INVALID_HANDLE;
    }

    // If a characteristic value changed then callback function to notify application of change
    if((notifyApp != 0xFF) && dataProfile_AppCBs && dataProfile_AppCBs->pfndataProfileChange)
    {
        dataProfile_AppCBs->pfndataProfileChange(notifyApp, pValue, len);
    }

    return (status);
}

/*********************************************************************
*********************************************************************/