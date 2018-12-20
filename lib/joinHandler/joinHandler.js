const bluebird = require('bluebird');
const { consts, utils, ERROR } = require('../lora-lib');
const slice = utils.bufferSlice;
const reverse = utils.bufferReverse;
const cmac = require('node-aes-cmac').aesCmac;
const crypto = require('crypto');

class JoinHandler {
  constructor(DeviceInfo, log) {
    this.log = log;
    this.DeviceInfo = DeviceInfo;
  }

  parser(phyPayloadJSON) {
    const MACPayload = this.joinReqParser(phyPayloadJSON.macPayload);
    const phyPayload = {
      MHDR: phyPayloadJSON.mhdrJSON,
      MACPayload,
      MIC: phyPayloadJSON.mic,
    };

    const MICfields = {
      MHDR: phyPayloadJSON.mhdr,
      AppEUI: MACPayload.AppEUI,
      DevEUI: MACPayload.DevEUI,
      DevNonce: MACPayload.DevNonce,
      MIC: phyPayloadJSON.mic,
    };

    const query = { DevEUI: MACPayload.DevEUI };
    const attr = ['AppKey'];
    return this.DeviceInfo.readItem(query, attr)
      .then((res) => {
        return this.micVerification(MICfields, res.AppKey, phyPayloadJSON.mic);
      })
      .then(() => {
        return bluebird.resolve(phyPayload);
      });

  }

  packager(phyPayloadJSON, key) {
    phyPayloadJSON.MHDR = this.MHDRPackager(phyPayloadJSON.MHDR);
    const MACPayloadJSON = phyPayloadJSON.MACPayload;
    const MIC = this.joinMICCalculator(phyPayloadJSON, key, 'accept');
    let macpayload = Buffer.concat([
      reverse(MACPayloadJSON.AppNonce),
      reverse(MACPayloadJSON.NetID),
      reverse(MACPayloadJSON.DevAddr),
      reverse(MACPayloadJSON.DLSettings),
      reverse(MACPayloadJSON.RxDelay),
    ]);
    if ('CFList' in MACPayloadJSON) {
      macpayload = Buffer.concat([macpayload, MACPayloadJSON.CFList]);
    }

    macpayload = Buffer.concat([macpayload, MIC]);

    const encmacpayload = this.AcptEncryption(macpayload, key);
    const phypayload = Buffer.concat([phyPayloadJSON.MHDR, encmacpayload]);
    return bluebird.resolve(phypayload);
  }

  MHDRPackager(mhdr) {
    let MHDR = Buffer.alloc(consts.MHDR_LEN);
    utils.bitwiseAssigner(MHDR, consts.MTYPE_OFFSET, consts.MTYPE_LEN, mhdr.MType);
    utils.bitwiseAssigner(MHDR, consts.MAJOR_OFFSET, consts.MAJOR_LEN, mhdr.Major);
    return MHDR;
  }

  joinReqParser (MACPayload) {
    const joinReqJSON = {};
    joinReqJSON.AppEUI = slice(MACPayload, consts.JOINEUI_OFFSET, consts.DEVEUI_OFFSET);
    joinReqJSON.DevEUI = slice(MACPayload, consts.DEVEUI_OFFSET, consts.DEVNONCE_OFFSET);
    joinReqJSON.DevNonce = slice(MACPayload, consts.DEVNONCE_OFFSET);
    return joinReqJSON;
  }

  micVerification (requiredFields, key, receivedMIC) {
    return new bluebird((resolve, reject) => {
      const calculatedMIC = this.joinMICCalculator(requiredFields, key, 'request');
      if (receivedMIC.equals(calculatedMIC)) {
        return resolve({});
      } else {
        const errorMessage = {
          message: 'MIC Mismatch',
          DevEUI: requiredFields.DevEUI,
          AppEUI: requiredFields.AppEUI,
        };
        return reject(new ERROR.MICMismatchError(errorMessage));
      }

    });
  };

  joinMICCalculator (requiredFields, key, type) {
    let micPayload;
    let bufferArray;
    switch (type) {
      case 'request': {
        bufferArray = [
          reverse(requiredFields.MHDR),
          reverse(requiredFields.AppEUI),
          reverse(requiredFields.DevEUI),
          reverse(requiredFields.DevNonce)
        ];
        micPayload = Buffer.concat(bufferArray, consts.BLOCK_LEN_REQ_MIC);
        break;
      }
      case 'accept': {
        bufferArray = [
          reverse(requiredFields.MHDR),
          reverse(requiredFields.MACPayload.AppNonce),
          reverse(requiredFields.MACPayload.NetID),
          reverse(requiredFields.MACPayload.DevAddr),
          reverse(requiredFields.MACPayload.DLSettings),
          reverse(requiredFields.MACPayload.RxDelay)
        ];
        micPayload = Buffer.concat(bufferArray, consts.BLOCK_LEN_ACPT_MIC_BASE);
        if (requiredFields.MACPayload.hasOwnProperty('CFList')) {
          micPayload = Buffer.concat([
            micPayload,
            reverse(requiredFields.MACPayload.CFList)
          ], consts.BLOCK_LEN_ACPT_MIC_BASE + requiredFields.CFList.length);
        }

        break;
      }
    }
    const options = {
      returnAsBuffer: true,
    };

    return cmac(
      key,
      micPayload,
      options
    ).slice(0, consts.V102_CMAC_LEN);
  }

  AcptEncryption (acpt, key) {
    const iv = '';
    const cipher = crypto.createDecipheriv(consts.ENCRYPTION_ALGO, key, iv);
    cipher.setAutoPadding(false);
    return cipher.update(acpt);
  };

}

module.exports = JoinHandler;
