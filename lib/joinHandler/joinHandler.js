const bluebird = require('bluebird');
const { consts, utils } = require('../lora-lib');

class JoinHandler {
  constructor(DeviceInfo, log) {
    this.log = log;
    this.DeviceInfo = DeviceInfo;
  }

  parser(phyPayloadJSON) {
    const phyPayload = {
      MHDR: phyPayloadJSON.mhdrJSON,
      MHDRRaw: phyPayloadJSON.mhdr,
      MACPayload: phyPayloadJSON.macPayload,
      MIC: phyPayloadJSON.mic,
    };
    return bluebird.resolve(phyPayload);
  }

  packager(phyPayloadJSON) {
    const MHDR = this.MHDRPackager(phyPayloadJSON.MHDR);
    const MACPayload = phyPayloadJSON.MACPayload;

    /*this.DeviceInfo.createDeviceInfo(
      phyPayloadJSON.DevAddr,
      phyPayloadJSON.NwkSKey,
      phyPayloadJSON.AppSKey
    );*/
    return bluebird.resolve(Buffer.concat([MHDR, MACPayload]));
  }

  MHDRPackager(mhdr) {
    let MHDR = Buffer.alloc(consts.MHDR_LEN);
    utils.bitwiseAssigner(MHDR, consts.MTYPE_OFFSET, consts.MTYPE_LEN, mhdr.MType);
    utils.bitwiseAssigner(MHDR, consts.MAJOR_OFFSET, consts.MAJOR_LEN, mhdr.Major);
    return MHDR;
  }
}

module.exports = JoinHandler;
