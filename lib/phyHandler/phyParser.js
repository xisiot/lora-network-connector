'use strict';

const bluebird = require('bluebird');
const { consts, utils, ERROR } = require('../lora-lib');
const slice = utils.bufferSlice;
const phyUtils = require('./phyUtils');
const MACCmdParser = require('../cmdHandler').MACCmdParser;
const MACParser = new MACCmdParser();

function PHYParser(modelIns, joinHandler, log) {
  this.MySQLModel = modelIns.MySQLModel;
  this.RedisModel = modelIns.RedisModel;
  this.DeviceInfoMysql = this.MySQLModel.DeviceInfo;
  this.DeviceConfig = this.MySQLModel.DeviceConfig;
  this.DeviceRouting = this.MySQLModel.DeviceRouting;
  this.DeviceInfoRedis = this.RedisModel.DeviceInfo;
  this.joinHandler = joinHandler;
  this.log = log;
}

//Class methods

/*
 * Parse MHDR, MACPayload and MIC from physical payload
 */
PHYParser.phyPayloadParser = function (phyPayload) {
  const phyLen = phyPayload.length;
  const mhdr = slice(phyPayload, consts.MHDR_OFFSET, consts.MACPAYLOAD_OFFSET);
  //MAC layer
  const mhdrJSON = PHYParser.mhdrParser(mhdr);
  const macPayloadLen = phyLen - consts.MHDR_LEN - consts.MIC_LEN;
  const MIC_OFFSET = consts.MACPAYLOAD_OFFSET + macPayloadLen;
  const macPayload = slice(phyPayload, consts.MACPAYLOAD_OFFSET, MIC_OFFSET, false);
  const mic = slice(phyPayload, MIC_OFFSET, phyLen, false);

  return {
    mhdr,
    mhdrJSON,
    macPayload,
    mic,
  };
};

/*
 * Parse MType, Major from MHDR
 */
PHYParser.mhdrParser = function (mhdr) {
  const MType = utils.bitwiseFilter(mhdr, consts.MTYPE_OFFSET, consts.MTYPE_LEN);
  const Major = utils.bitwiseFilter(mhdr, consts.MAJOR_OFFSET, consts.MAJOR_LEN);
  return {
    MType,
    Major,
  };
};

PHYParser.fctrlParser = function (fctrl) {
  const ADR = utils.bitwiseFilter(fctrl, consts.FC_ADR_OFFSET, consts.ADR_LEN);
  const ADRACKReq = utils.bitwiseFilter(fctrl, consts.FC_ADRACKREQ_OFFSET, consts.ADRACKREQ_LEN);
  const ACK = utils.bitwiseFilter(fctrl, consts.FC_ACK_OFFSET, consts.ACK_LEN);
  const ClassB = utils.bitwiseFilter(fctrl, consts.FC_CLASSB_OFFSET, consts.CLASSB_LEN);
  const FOptsLen = utils.bitwiseFilter(fctrl, consts.FC_FOPTSLEN_OFFSET, consts.FOPTSLEN);
  return {
    ADR,
    ADRACKReq,
    ACK,
    ClassB,
    FOptsLen,
  };
};

/*
 * Parse FHDR from MAC Payload, variable length
 */
PHYParser.fhdrParser = function (macPayload) {
  const DevAddr = slice(macPayload, consts.MP_DEVADDR_OFFSET, consts.MP_DEVADDR_END);
  const FCtrl = slice(macPayload, consts.MP_FCTRL_OFFSET, consts.MP_FCTRL_END);
  const FCtrlJSON = PHYParser.fctrlParser(FCtrl);
  const FCnt = Buffer.alloc(consts.FCNT_LEN);
  slice(macPayload, consts.MP_FCNT_OFFSET, consts.MP_FCNT_END)
    .copy(FCnt, consts.FCNT_LEAST_OFFSET);

  const fhdrEnd = consts.MP_FOPTS_OFFSET + FCtrlJSON.FOptsLen;
  const FOptsBuf = slice(macPayload, consts.MP_FOPTS_OFFSET, fhdrEnd, false);
  const FOptsJson = MACParser.parser(FOptsBuf);
  if (FOptsJson.ansLen > consts.FOPTS_MAXLEN) {
    return bluebird.reject(
      new ERROR.MACCommandPayloadFormatError({
        message: `Invalid length of Request MACCommand in FOpts`,
        AnsLen: FOptsJson.ansLen,
      })
    );
  }
  const FOpts = FOptsJson.cmdArr;
  return {
    DevAddr,
    FCtrl: FCtrlJSON,
    FCnt,
    FOpts,
  };
};

PHYParser.macPayloadParser = function (macPayload) {
  const macPayloadLen = macPayload.length;
  const fhdrJSON = PHYParser.fhdrParser(macPayload);
  const fhdrEnd = consts.MP_FOPTS_OFFSET + fhdrJSON.FCtrl.FOptsLen;
  const fhdr = slice(macPayload, consts.MP_FHDR_OFFSET, consts.MP_FHDR_OFFSET + fhdrEnd, false);
  const macPayloadJSON = {
    fhdr,
    fhdrJSON,
  };

  //Check if these is any FPort
  if (fhdrEnd === macPayloadLen) {

    //No FPort and FRMPayload
    return bluebird.resolve(macPayloadJSON);
  } else if (fhdrEnd > macPayloadLen) {
    return bluebird.reject(
      new ERROR.InvalidMessageError({
        message: `Insufficient length of FOpts, the package is ignored`,
        FOptsLen: macPayloadJSON.fhdrJSON.FOptsLen,
        receivedFOptsLength: macPayloadJSON.fhdrJSON.FOpts.length,
      })
    );
  } else {
    const FRMPayloadOffset = fhdrEnd + consts.FPORT_LEN;
    const FPort = slice(macPayload, fhdrEnd, FRMPayloadOffset);
    const FRMPayload = slice(macPayload, FRMPayloadOffset, macPayload.length, false);
    if (FRMPayload.length <= 0) {
      return bluebird.reject(
        new ERROR.InvalidMessageError({
          message: `FRMPayload must not be empty if FPort is given`,
        })
      );
    }

    macPayloadJSON.FPort = FPort;
    macPayloadJSON.FRMPayload = FRMPayload;
    return bluebird.resolve(macPayloadJSON);
  }
};

//Instance methods

PHYParser.prototype.parser = function (phyPayloadRaw) {
  const _this = this;
  const phyPayload = Buffer.from(phyPayloadRaw, 'base64');

  //PHY layer
  const phyPayloadJSON = PHYParser.phyPayloadParser(phyPayload);

  const direction = Buffer.alloc(consts.DIRECTION_LEN);
  direction[0] = consts.BLOCK_DIR_CLASS.Up;
  if (consts.NS_MSG_TYPE_LIST.indexOf(phyPayloadJSON.mhdrJSON.MType) > -1) {
    if (phyPayload.length < consts.MIN_PHYPAYLOAD_LEN) {
      return bluebird.reject(
        new ERROR.InvalidMessageError({
          message: `Insufficient length of PHYPayload, greater than ${consts.MIN_PHYPAYLOAD_LEN} bytes is mandatory`,
          receivedPHYPayloadLength: phyPayload.length,
        })
      );
    }

    return PHYParser.macPayloadParser(phyPayloadJSON.macPayload)
      .then((macPayloadJSON) => {
        //MIC verification
        const requiredFields = {
          MHDR: phyPayloadJSON.mhdr,
          FHDR: macPayloadJSON.fhdr,
          DevAddr: macPayloadJSON.fhdrJSON.DevAddr,
          FCnt: macPayloadJSON.fhdrJSON.FCnt,
        };
        if (macPayloadJSON.FPort) {
          requiredFields.FPort = macPayloadJSON.FPort;
          requiredFields.FRMPayload = macPayloadJSON.FRMPayload;
        }

        const queryAttributes = ['NwkSKey', 'AppSKey'];
        const queryOpts = {
          DevAddr: requiredFields.DevAddr,
        };

        const getAndCacheDeviceInfo = function (queryOpts, queryAttributes) {
          return _this.DeviceInfoRedis.read(queryOpts.DevAddr, queryAttributes)
            .then((res) => {
              if (!res.NwkSKey) {
                let devInfo = {};
                return _this.DeviceInfoMysql.readItem(queryOpts, consts.DEVICEINFO_CACHE_ATTRIBUTES)
                  .then((res) => {
                    Object.keys(res).forEach((key) => {
                      devInfo[key] = res[key];
                    });
                    return _this.DeviceRouting.readItem(queryOpts, consts.DEVICEROUTING_CACHE_ATTRIBUTES);
                  })
                  .then((res) => {
                    Object.keys(res).forEach((key) => {
                      devInfo[key] = res[key];
                    });
                    return _this.DeviceConfig.readItem(queryOpts, consts.DEVICECONFIG_CACHE_ATTRIBUTES);
                  })
                  .then((res) => {
                    Object.keys(res).forEach((key) => {
                      devInfo[key] = res[key];
                    });
                    return _this.DeviceInfoRedis.update(queryOpts.DevAddr, devInfo);
                  })
                  .then(() => {
                    const res = {
                      NwkSKey: devInfo.NwkSKey,
                      AppSKey: devInfo.AppSKey
                    };
                    return bluebird.resolve(res);
                  });
              } else {
                return bluebird.resolve(res);
              }
            });
        };

        const macPayloadMICVerify = function (values) {
          if (!values.NwkSKey) {
            const errorMsg = {
              DevAddr: macPayloadJSON.fhdrJSON.DevAddr,
              msg: 'Device not registered in LoRa web',
            };
            return bluebird.reject(
              new ERROR.DeviceNotExistError(errorMsg)
            );
          }

          const NwkSKey = values.NwkSKey;
          const micCal = phyUtils.micCalculator(requiredFields, NwkSKey, direction);
          if (micCal.equals(phyPayloadJSON.mic)) {

            //MIC verification passing
            return bluebird.resolve(values);
          } else {
            const errorMsg = {
              DevAddr: macPayloadJSON.fhdrJSON.DevAddr,
              msg: 'MACPayload MIC mismatch',
            };
            return bluebird.reject(
              new ERROR.MICMismatchError(errorMsg)
            );
          }

        };

        const decryptFRMPayload = function (values) {
          let key;
          let result = {
            MHDR: phyPayloadJSON.mhdrJSON,
            MACPayload: {
              FHDR: macPayloadJSON.fhdrJSON,
            },
          };

          if (macPayloadJSON.FPort) {
            result.MACPayload.FPort = macPayloadJSON.FPort;
          }

          if (!requiredFields.FRMPayload) {
            result.MACPayload.FRMPayload = Buffer.alloc(0);
            return bluebird.resolve(result);
          } else {
            if (macPayloadJSON.FPort.readUInt8() === 0) {
              key = values.NwkSKey;
            } else {
              key = values.AppSKey;
            }

            const framePayload = phyUtils.decrypt(requiredFields, key, direction);
            result.MACPayload.FRMPayload = framePayload;
            if (macPayloadJSON.FPort.readUInt8() == consts.MACCOMMANDPORT.readUInt8()) {
              if (macPayloadJSON.fhdrJSON.FCtrl.FOptsLen > 0) {
                return bluebird.reject(
                  new ERROR.InvalidMessageError({
                    message: `MAC Commands are present in the FOpts field, the FPort 0 cannot be used`,
                    receivedFPort: macPayloadJSON.FPort,
                    receivedFOpts: macPayloadJSON.FHDR.FOpts,
                  })
                );
              } else {
                result.MACPayload.FRMPayload = MACParser.parser(framePayload).cmdArr;
              }
            }

            return bluebird.resolve(result);
          }

        };

        return getAndCacheDeviceInfo(queryOpts, queryAttributes)
          .then(macPayloadMICVerify)
          .then(decryptFRMPayload);
      });
  } else if (consts.JS_MSG_TYPE_LIST.indexOf(phyPayloadJSON.mhdrJSON.MType) > -1) {
    if (phyPayloadJSON.macPayload.length !== consts.JOINREQ_BASIC_LENGTH) {
      return bluebird.reject(
        new ERROR.InvalidMessageError({
          message: `Invalid length of JOIN request, ${consts.JOINREQ_BASIC_LENGTH} bytes is mandatory`,
          receivedLength: phyPayloadJSON.macPayload.length,
        })
      );
    }

    return this.joinHandler.parser(phyPayloadJSON);
  } else {
    return bluebird.reject(
      new ERROR.MsgTypeError({
        message: `Invalid message type, one of [0, 2, 4] is mandatory`,
        errorType: phyPayloadJSON.mhdrJSON.MType,
      })
    );
  }

};

module.exports = PHYParser;
