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
      JoinEUI: MACPayload.JoinEUI,
      DevEUI: MACPayload.DevEUI,
      DevNonce: MACPayload.DevNonce,
      MIC: phyPayloadJSON.mic,
    };
    const query = { DevEUI: MACPayload.DevEUI };
    const attr = ['NwkKey'];
    return this.DeviceInfo.readItem(query, attr)
      .then((res) => {
        return this.micVerification(MICfields, res.NwkKey, phyPayloadJSON.mic, 1);
      })
      .then(() => {
        return bluebird.resolve(phyPayload);
      });

  }

  Rejoinparser(phyPayloadJSON) {
    let  attr;
    const rejoinsign = Buffer.from('01','hex');
    const MACPayload = this.RejoinReqParser(phyPayloadJSON.macPayload,rejoinsign);
    const phyPayload = {
      MHDR: phyPayloadJSON.mhdrJSON,
      MACPayload,
      MIC: phyPayloadJSON.mic,
    };
    // when rejointype = 1 
    const rejointype = MACPayload.RejoinType;
    let MICfields;
    if(rejointype.equals(rejoinsign)){
      MICfields = {
        MHDR: phyPayloadJSON.mhdr,
        RejoinType:MACPayload.RejoinType,
        JoinEUI: MACPayload.JoinEUI,
        DevEUI: MACPayload.DevEUI,
        DevNonce: MACPayload.DevNonce,
        MIC: phyPayloadJSON.mic,
      };
      attr = ['JSIntKey'];
    } 
    // when rejointype = 0 or 2
    else {
      MICfields = {
        MHDR: phyPayloadJSON.mhdr,
        RejoinType:MACPayload.RejoinType,
        NetID: MACPayload.NetID,
        DevEUI: MACPayload.DevEUI,
        DevNonce: MACPayload.DevNonce,
        MIC: phyPayloadJSON.mic,
      };
      attr = ['SNwkSIntKey'];
    }
    const query = { DevEUI: MACPayload.DevEUI };
    return this.DeviceInfo.readItem(query, attr)
      .then((res) => {
        if((MACPayload.RejoinType).equals(rejoinsign)){
          return this.micVerification(MICfields, res.JSIntKey, phyPayloadJSON.mic, 2, rejoinsign);
        }
        else{
          return this.micVerification(MICfields, res.SNwkSIntKey, phyPayloadJSON.mic, 2, rejoinsign);
        }
      })
      .then(() => {
        return bluebird.resolve(phyPayload);
      });

  }
  packager(phyPayloadJSON, res) {
    phyPayloadJSON.MHDR = this.MHDRPackager(phyPayloadJSON.MHDR);
    const MACPayloadJSON = phyPayloadJSON.MACPayload;
    const MIC = this.joinMICCalculator(phyPayloadJSON, res, 'accept');
    let macpayload = Buffer.concat([
      reverse(MACPayloadJSON.JoinNonce),
      reverse(MACPayloadJSON.NetID),
      reverse(MACPayloadJSON.DevAddr),
      reverse(MACPayloadJSON.DLSettings),
      reverse(MACPayloadJSON.RxDelay),
    ]);
    if ('CFList' in MACPayloadJSON) {
      macpayload = Buffer.concat([macpayload, MACPayloadJSON.CFList]);
    }

    macpayload = Buffer.concat([macpayload, MIC]);
    const encmacpayload = this.AcptEncryption(macpayload, res);
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
    joinReqJSON.JoinEUI = slice(MACPayload, consts.JOINEUI_OFFSET, consts.DEVEUI_OFFSET);
    joinReqJSON.DevEUI = slice(MACPayload, consts.DEVEUI_OFFSET, consts.DEVNONCE_OFFSET);
    joinReqJSON.DevNonce = slice(MACPayload, consts.DEVNONCE_OFFSET);
    return joinReqJSON;
  }

  RejoinReqParser(MACPayload,rejoinsign){
    const RejoinReqJSON = {};
    RejoinReqJSON.RejoinType = slice(MACPayload, consts.REJOINTYPE_OFFSET, consts.REJOINEUI_OFFSET);
    const rejointype = RejoinReqJSON.RejoinType;
    if(rejointype.euqals(rejoinsign)){
      RejoinReqJSON.JoinEUI = slice(MACPayload, consts.REJOINEUI_OFFSET, consts.REJOINDEVEUI_OFFSET);
      RejoinReqJSON.DevEUI = slice(MACPayload, consts.REJOINDEVEUI_OFFSET, consts.RJCOUNT1_OFFSET);
      RejoinReqJSON.DevNonce = slice(MACPayload, consts.RJCOUNT1_OFFSET);
    } else {
      RejoinReqJSON.NetID = slice(MACPayload, consts.REJOINNETID_OFFSET, consts.REJOINDEVEUI_0_OFFSET);
      RejoinReqJSON.DevEUI = slice(MACPayload, consts.REJOINDEVEUI_0_OFFSET, consts.RJCOUNT0_OFFSET);
      RejoinReqJSON.DevNonce = slice(MACPayload, consts.RJCOUNT0_OFFSET);
    } 
    return RejoinReqJSON;
  }

  micVerification (requiredFields, key, receivedMIC, sign, rejoinsign) {
    return new bluebird((resolve, reject) => {
      let calculatedMIC;
      const rejointype = requiredFields.RejoinType;
      if(sign === 1){
        calculatedMIC = this.joinMICCalculator(requiredFields, key, 'request');
      }
      else {
        if((requiredFields.RejoinType).equals(rejoinsign)){
        calculatedMIC = this.joinMICCalculator(requiredFields, key, 'Rejoinrequest_1');
        }
        else{
        calculatedMIC = this.joinMICCalculator(requiredFields, key, 'Rejoinrequest_0');
        }
      }
      if (receivedMIC.equals(calculatedMIC)) {
        return resolve({});
      } else {
        const errorMessage = {
          message: 'MIC Mismatch',
          DevEUI: requiredFields.DevEUI,
          JoinEUI: requiredFields.JoinEUI,
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
          reverse(requiredFields.JoinEUI),
          reverse(requiredFields.DevEUI),
          reverse(requiredFields.DevNonce)
        ];
        micPayload = Buffer.concat(bufferArray, consts.BLOCK_LEN_REQ_MIC);
        break;
      }
      case 'Rejoinrequest_1':{
        bufferArray = [
          reverse(requiredFields.MHDR),
          reverse(requiredFields.RejoinType),
          reverse(requiredFields.JoinEUI),
          reverse(requiredFields.DevEUI),
          reverse(requiredFields.DevNonce)
        ];
        micPayload = Buffer.concat(bufferArray, consts.BLOCK_LEN_REJOINREQ_1_MIC);
        break;
      }
      case 'Rejoinrequest_0':{
        bufferArray = [
          reverse(requiredFields.MHDR),
          reverse(requiredFields.RejoinType),
          reverse(requiredFields.NetID),
          reverse(requiredFields.DevEUI),
          reverse(requiredFields.DevNonce)
        ];
        micPayload = Buffer.concat(bufferArray, consts.BLOCK_LEN_REJOINREQ_0_MIC);
        break;
      }
      case 'accept': {
        if(key.ProtocolVersion === '1.1'){
          bufferArray = [
            reverse(key.JoinReqType),
            reverse(key.JoinEUI),
            reverse(key.DevNonce),
            reverse(requiredFields.MHDR),
            reverse(requiredFields.MACPayload.JoinNonce),
            reverse(requiredFields.MACPayload.NetID),
            reverse(requiredFields.MACPayload.DevAddr),
            reverse(requiredFields.MACPayload.DLSettings),
            reverse(requiredFields.MACPayload.RxDelay)
          ];
          micPayload = Buffer.concat(bufferArray, consts.BLOCK_LEN_ACPT_MIC_BASE);
        } else {
          bufferArray = [
            reverse(requiredFields.MHDR),
            reverse(requiredFields.MACPayload.NetID),
            reverse(requiredFields.MACPayload.JoinNonce),
            reverse(requiredFields.MACPayload.DevAddr),
            reverse(requiredFields.MACPayload.DLSettings),
            reverse(requiredFields.MACPayload.RxDelay)
          ];
          micPayload = Buffer.concat(bufferArray, consts.BLOCK_LEN_ACPT_MIC_102_BASE); 
        }
        
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
    if(type === 'accept'){
      if(key.ProtocolVersion === '1.1'){
        return cmac(
        key.JSIntKey,
        micPayload,
        options
        ).slice(0, consts.V11_CMAC_LEN)
      } else {
        return cmac(
         key.NwkKey,
         micPayload,
         options
        ).slice(0, consts.V102_CMAC_LEN)
      }
    } else {
      return cmac(
        key,
        micPayload,
        options
      ).slice(0, consts.V102_CMAC_LEN);
    }
  }
      

  AcptEncryption (acpt, key) {
    const iv = '';
    const joinType = Buffer.from('ff','hex');
    let key;
    if((res.JoinReqType).equals(joinType)){
      key = res.NwkKey;
    } else {
      key = res.JSEncKey;
    }
    const cipher = crypto.createDecipheriv(consts.ENCRYPTION_ALGO, key, iv);
    cipher.setAutoPadding(false);
    return cipher.update(acpt);
  };

}

module.exports = JoinHandler;
