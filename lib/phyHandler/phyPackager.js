'use strict';

const bluebird = require('bluebird');
const { consts, utils } = require('../lora-lib');
const phyUtils = require('./phyUtils');
const MACCmdPackager = require('../cmdHandler').MACCmdPackager;
const MACPackager = new MACCmdPackager();
const reverse = utils.bufferReverse;
const assign = utils.bitwiseAssigner;
const slice = utils.bufferSlice;

function PHYPackager(DeviceInfo, joinHandler, log) {
  this.DeviceInfo = DeviceInfo;
  this.joinHandler = joinHandler;
  this.log = log;
}

PHYPackager.MHDRPackager = function (MHDRJSON) {
  const MHDR = Buffer.alloc(consts.MHDR_LEN);
  utils.bitwiseAssigner(MHDR, consts.MTYPE_OFFSET, consts.MTYPE_LEN, MHDRJSON.MType);
  utils.bitwiseAssigner(MHDR, consts.MAJOR_OFFSET, consts.MAJON_LEN, MHDRJSON.Major);
  return MHDR;
};

PHYPackager.FHDRPackager = function (FHDRJSON) {
  let FHDR = Buffer.alloc(consts.FHDR_LEN_BASE);
  const FCtrl = PHYPackager.FCtrlPackager(FHDRJSON.FCtrl);
  reverse(FHDRJSON.DevAddr).copy(FHDR, consts.MP_DEVADDR_OFFSET);
  reverse(FCtrl).copy(FHDR, consts.MP_FCTRL_OFFSET);
  slice(FHDRJSON.FCnt, consts.FCNT_LEAST_OFFSET).copy(FHDR, consts.MP_FCNT_OFFSET);
  console.log(FHDRJSON);
  if (FHDRJSON.FCtrl.FOptsLen > 0) {
    const FOpts = MACPackager.packager(FHDRJSON.FOpts);
    console.log(FOpts);
    FHDR = Buffer.concat([FHDR, FOpts]);
  }

  return FHDR;
};

PHYPackager.FCtrlPackager = function (FCtrlJSON) {
  let FCtrl = Buffer.alloc(consts.FCTRL_LEN);
  assign(FCtrl, consts.FC_ADR_OFFSET, consts.ADR_LEN, FCtrlJSON.ADR);
  assign(FCtrl, consts.FC_ACK_OFFSET, consts.ACK_LEN, FCtrlJSON.ACK);
  assign(FCtrl, consts.FC_FPENDING_OFFSET, consts.FPENDING_LEN, FCtrlJSON.FPending);
  assign(FCtrl, consts.FC_FOPTSLEN_OFFSET, consts.FOPTSLEN, FCtrlJSON.FOptsLen);
  return FCtrl;
};

PHYPackager.prototype.packager = function (phyPayloadJSON) {
  const MType = phyPayloadJSON.MHDR.MType;
  const MACPayload = phyPayloadJSON.MACPayload;

  let MHDR;
  let FHDR;

  //const MType = utils.bitwiseFilter(phyPayloadJSON.MHDR, consts.MTYPE_OFFSET, consts.MTYPE_LEN);
  switch (MType) {
    case consts.JOIN_ACCEPT: {
      const devaddr = MACPayload.DevAddr;
      const attribute = [
      'JSIntKey',
      'NwkKey',
      'JSEncKey',
      'JoinReqType',
      'DevNonce',
      'JoinEUI',
      'ProtocolVersion'
      ];
      return this.DeviceInfo.readItem(devaddr, attribute)
      .then((res) => {
        return this.joinHandler.packager(phyPayloadJSON, res);
      });

    }
    case consts.UNCONFIRMED_DATA_DOWN:
    case consts.CONFIRMED_DATA_DOWN: {
      if (MACPayload.FPort !== 0 && !MACPayload.FPort) {
        MACPayload.FPort = Buffer.alloc(0);
      }

      if (!MACPayload.FRMPayload) {
        MACPayload.FRMPayload = Buffer.alloc(0);
      } else if (MACPayload.FPort.readUInt8() == consts.MACCOMMANDPORT.readUInt8()) {
        MACPayload.FRMPayload = MACPackager.packager(MACPayload.FRMPayload);
      }

      MHDR = PHYPackager.MHDRPackager(phyPayloadJSON.MHDR);
      FHDR = PHYPackager.FHDRPackager(MACPayload.FHDR);
      break;
    }
  }

  //Encryption
  const direction = Buffer.alloc(consts.DIRECTION_LEN);
  direction.writeUInt8(consts.BLOCK_DIR_CLASS.Down);
  const DevAddr = MACPayload.FHDR.DevAddr;
  const query = {
    DevAddr,
  };
  const attrs = [
    'AppSKey',
    'SNwkSIntKey',
  ];
  //query AppSKey
  // return this.DeviceInfo.readItem(query, attrs)
  return this.DeviceInfo.read(DevAddr, attrs)
    .then((keys) => {
      const encryptionFields = {
        FRMPayload: MACPayload.FRMPayload,
        DevAddr: MACPayload.FHDR.DevAddr,
        FCnt: MACPayload.FHDR.FCnt,
      };
      let key;
      if (MACPayload.FPort.readUInt8() === 0) {
        key = keys.SNwkSIntKey;
      } else {
        key = keys.AppSKey;
      }

      MACPayload.FRMPayload = phyUtils.decrypt(encryptionFields, key, direction);
      let PHYPayload = Buffer.concat([
        MHDR,
        FHDR,
        MACPayload.FPort,
        MACPayload.FRMPayload,
      ]);
      const micFields = {
        MHDR,
        FHDR,
        FPort: MACPayload.FPort,
        FRMPayload: MACPayload.FRMPayload,
        DevAddr: MACPayload.FHDR.DevAddr,
        FCnt: MACPayload.FHDR.FCnt,
      };
      const MIC = phyUtils.micCalculator(micFields, keys.SNwkSIntKey, direction);
      PHYPayload = Buffer.concat([PHYPayload, MIC]);
      return bluebird.resolve(PHYPayload);
    });

};

module.exports = PHYPackager;
