'use strict';

const { consts, ERROR, utils } = require('../lora-lib');
const slice = utils.bufferSlice;

function MACCmdParser(log) {
  this.log = log;
}

MACCmdParser.prototype.parser = function (macCommand) {
  let cmd = macCommand;
  let ansLen = 0;
  let cmdArr = new Array();
  while (cmd.length) {
    let cid = slice(cmd, consts.CID_OFFEST, consts.PAYLOAD_OFFEST, false);
    let payloadJson;
    let offest;
    let payload = null;
    switch (cid.readInt8()) {
      case consts.RESET_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.RESETIND_LEN;
        payload = {
          Version: slice(cmd, consts.PAYLOAD_OFFEST, offest, false),
        };
        ansLen = ansLen + consts.CID_LEN + consts.RESETCONF_LEN;
        break;
      }

      case consts.LINKCHECK_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.LINKCHECKREQ_LEN;
        ansLen = ansLen + consts.CID_LEN + consts.LINKADRANS_LEN;
        // payload = slice(cmd, consts.PAYLOAD_OFFEST, offest, false);
        break;
      }

      case consts.LINKADR_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.LINKADRANS_LEN;
        payload = {
          Status: slice(cmd, consts.PAYLOAD_OFFEST, offest, false),
        };
        break;
      }

      case consts.DUTYCYCLE_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.DUTYCYCLEANS_LEN;
        // payload = slice(cmd, consts.PAYLOAD_OFFEST, offest, false);
        break;
      }

      case consts.RXPARAMSETUP_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.RXPARAMSETUPANS_LEN;
        payload = {
          Status: slice(cmd, consts.PAYLOAD_OFFEST, offest, false),
        };
        break;
      }

      case consts.DEVSTATUS_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.DEVSTATUSANS_LEN;
        const marginOffest = consts.PAYLOAD_OFFEST + consts.BATTERY_LEN;
        payload = {
          Battery: slice(cmd, consts.PAYLOAD_OFFEST, marginOffest, false),
          Margin: slice(cmd, marginOffest, offest, false),
        };
        break;
      }

      case consts.NEWCHANNEL_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.NEWCHANNELANS_LEN;
        payload = {
          Status: slice(cmd, consts.PAYLOAD_OFFEST, offest, false),
        };
        break;
      }

      case consts.RXTIMINGSETUP_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.RXTIMINGSETUPANS_LEN;
        // payload = slice(cmd, consts.PAYLOAD_OFFEST, offest, false);
        break;
      }

      case consts.TXPARAMSETUP_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.TXPARAMSETUPANS_LEN;
        // payload = slice(cmd, consts.PAYLOAD_OFFEST, offest, false);
        break;
      }

      case consts.DLCHANNEL_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.DLCHANNELANS_LEN;
        payload = {
          Status: slice(cmd, consts.PAYLOAD_OFFEST, offest, false),
        };
        break;
      }

      case consts.REKEY_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.REKEYIND_LEN;
        payload = {
          Version: slice(cmd, consts.PAYLOAD_OFFEST, offest, false),
        };
        ansLen = ansLen + consts.CID_LEN + consts.REKEYCONF_LEN;
        break;
      }

      case consts.ADRPARAMSETUP_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.ADRPARAMSETUPANS_LEN;
        // payload = slice(cmd, consts.PAYLOAD_OFFEST, offest, false);
        break;
      }

      case consts.DEVICETIME_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.DEVICETIMEREQ_LEN;
        ansLen = ansLen + consts.CID_LEN + consts.DEVICETIMEANS_LEN;
        // payload = slice(cmd, consts.PAYLOAD_OFFEST, offest, false);
        break;
      }

      case consts.REJOINPARAMSETUP_CID: {
        offest = consts.PAYLOAD_OFFEST + consts.REJOINPARAMSETUPANS_LEN;
        payload = {
          Status: slice(cmd, consts.PAYLOAD_OFFEST, offest, false),
        };
        break;
      }

      default: {
        throw new ERROR.MACCommandCidError({
          message: 'Bad cid of MACCommand',
          cid: cid,
        });
      }
    }

    payloadJson = {
      [cid.toString('hex')]: payload,
    };
    cmdArr.push(payloadJson);
    if (offest > cmd.length) {
      throw new ERROR.MACCommandPayloadFormatError({
        message: 'Invalid format of MACCommand payload',
        MACCommand: macCommand,
      });
    } else {
      cmd = slice(cmd, offest, cmd.length, false);
    }
  }

  return {
    cmdArr,
    ansLen,
  };
};

module.exports = MACCmdParser;
