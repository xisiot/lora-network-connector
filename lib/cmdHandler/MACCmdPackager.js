'use strict';

const { consts, ERROR } = require('../lora-lib');
const bluebird = require('bluebird');

function MACCmdPackager(log) {
  this.log = log;
}

MACCmdPackager.prototype.packager = function (macCmdArray) {
  let macCommand = Buffer.alloc(0);
  macCmdArray.forEach((macCmdJSON) => {
    for (let key in macCmdJSON) {
      let cid = Buffer.from(key, 'hex');
      let payloadJSON = macCmdJSON[key];
      switch (cid.readInt8()) {
        case consts.RESET_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid, 
            payloadJSON.Version
          ]);
          break;
        }

        case consts.LINKCHECK_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid,
            payloadJSON.Margin,
            payloadJSON.GwCnt
          ]);
          break;
        }

        case consts.LINKADR_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid,
            payloadJSON.TXPower, 
            payloadJSON.ChMask, 
            payloadJSON.Redundancy
          ]);
          break;
        }

        case consts.DUTYCYCLE_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid, 
            payloadJSON.DutyCyclePL
          ]);
          break;
        }

        case consts.RXPARAMSETUP_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid,
            payloadJSON.DLSettings,
            payloadJSON.Frequency
          ]);
          break;
        }

        case consts.DEVSTATUS_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid
          ]);
          break;
        }

        case consts.NEWCHANNEL_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid,
            payloadJSON.ChIndex, 
            payloadJSON.Freq, 
            payloadJSON.DrRange
          ]);
          break;
        }

        case consts.RXTIMINGSETUP_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid,
            payloadJSON.Settings
          ]);
          break;
        }

        case consts.TXPARAMSETUP_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid,
            payloadJSON.DwellTime
          ]);
          break;
        }

        case consts.DLCHANNEL_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid,
            payloadJSON.ChIndex,
            payloadJSON.Freq
          ]);
          break;
        }

        case consts.REKEY_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid,
            payloadJSON.Version
          ]);
          break;
        }

        case consts.ADRPARAMSETUP_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid,
            payloadJSON.ADRParam
          ]);
          break;
        }

        case consts.DEVICETIME_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid,
            payloadJSON.Seconds,
            payloadJSON.FractionalSec
          ]);
          break;
        }

        case consts.FORCEREJOIN_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid,
            payloadJSON.ForceRejoinReq
          ]);
          break;
        }

        case consts.REJOINPARAMSETUP_CID: {
          macCommand = Buffer.concat([
            macCommand,
            cid,
            payloadJSON.RejoinParamSetupReq
          ]);
          break;
        }

        default: {
           throw new ERROR.MACCommandCidError({
            message: 'Bad cid of MACCommand',
            cid: cid,
          });
        }
      }
    }
  });

  return macCommand;
};

module.exports = MACCmdPackager;
