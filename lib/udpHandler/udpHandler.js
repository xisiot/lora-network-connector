const { consts, utils, ERROR } = require('../lora-lib');
const bluebird = require('bluebird');
const crypto = require('crypto');
const udpUtils = require('./udpUtils.js');

const UDPHandler = class {
  constructor(log, phyHandler) {
    this.log = log;
    this.phyHandler = phyHandler;
  }

  parser(data) {
    if (data.length < consts.UDP_DATA_BASIC_LENGTH) {
      return bluebird.reject(
        new ERROR.InvalidMessageError({
          message: `Invalid length of udp data, greater than ${consts.UDP_DATA_BASIC_LENGTH - 1} bytes is mandatory`,
          receivedLength: data.length,
        })
      );
    }

    const udpJSON = {
      version: data.slice(consts.UDP_VERSION_OFFSET, consts.UDP_TOKEN_OFFSET),
      token: data.slice(consts.UDP_TOKEN_OFFSET, consts.UDP_IDENTIFIER_OFFSET),
      identifier: data.slice(consts.UDP_IDENTIFIER_OFFSET, consts.UDP_IDENTIFIER_OFFSET + consts.UDP_IDENTIFIER_LEN),
    };

    if (consts.UDP_VERSION_LIST.indexOf(udpJSON.version.readUInt8()) < 0) {
      return bluebird.reject(
        new ERROR.UDPVersionError({
          message: 'Bad UDP version number!',
          version: udpJSON.version.readUInt8(),
        })
      );
    }

    const identifier = udpJSON.identifier.readUInt8();
    switch (identifier) {
      case consts.UDP_ID_PUSH_DATA: {
        if (data.length <= consts.PUSH_DATA_BASIC_LENGTH) {
          return bluebird.reject(
            new ERROR.InvalidMessageError({
              message: `Invalid length of push data, greater than ${consts.PUSH_DATA_BASIC_LENGTH} bytes is mandatory`,
              receivedLength: data.length,
            })
          );
        }

        udpJSON.gatewayId = data.slice(consts.UDP_GW_ID_OFFSET, consts.UDP_JSON_OBJ_OFFSET);
        udpJSON.pushData = data.slice(consts.UDP_JSON_OBJ_OFFSET);
        udpJSON.DataType = 'PUSH_DATA';
        break;
      }
      case consts.UDP_ID_PULL_DATA: {
        if (data.length !== consts.PULL_DATA_LENGTH) {
          return bluebird.reject(
            new ERROR.InvalidMessageError({
              message: `Invalid length of pull data, ${consts.PULL_DATA_LENGTH} bytes is mandatory`,
              receivedLength: data.length,
            })
          );
        }

        udpJSON.gatewayId = data.slice(consts.UDP_GW_ID_OFFSET);
        udpJSON.DataType = 'PULL_DATA';
        break;
      }
      case consts.UDP_ID_TX_ACK: {
        udpJSON.gatewayId = data.slice(consts.UDP_GW_ID_OFFSET, consts.UDP_TX_ACK_PAYLOAD_OFFSET);
        udpJSON.txAckData = this.txAckParser(data.slice(consts.UDP_TX_ACK_PAYLOAD_OFFSET));
        udpJSON.DataType = 'TX_ACK';
        break;
      }
      default: {
        return bluebird.reject(new ERROR.MsgTypeError({
          message: `Invalid identifier, any of [0x00, 0x02, 0x05] is required`,
          identifier: udpJSON.identifier,
        }));
      }
    }

    return bluebird.resolve(udpJSON);
  }

  packager(requiredFields) {
    if (!utils.isObject(requiredFields)) {
      return bluebird.reject(
        new ERROR.MsgTypeError({
          message: 'Bad type of downlink UDP data, plain object is required',
          requiredFields: requiredFields,
        })
      );
    }

    //TODO-Schema validation

    let data = Buffer.alloc(consts.UDP_DOWNLINK_BASIC_LEN);
    requiredFields.version.copy(
      data,
      consts.UDP_VERSION_OFFSET,
    );
    requiredFields.token.copy(
      data,
      consts.UDP_TOKEN_OFFSET,
    );
    requiredFields.identifier.copy(
      data,
      consts.UDP_IDENTIFIER_OFFSET,
    );
    switch (requiredFields.identifier.readUInt8()) {
      case consts.UDP_ID_PUSH_ACK: {
        break;
      }
      case consts.UDP_ID_PULL_ACK: {
        data = Buffer.concat([
          data,
          requiredFields.gatewayId,
        ], consts.UDP_PULL_ACK_LEN);
        break;
      }
      case consts.UDP_ID_PULL_RESP: {
        const txpk = {
          txpk: requiredFields.txpk,
        };
        if ('dstID' in requiredFields) {
          txpk.dstID = requiredFields.dstID;
        }

        requiredFields.payload = Buffer.from(JSON.stringify(txpk));
        data = Buffer.concat([
          data,
          requiredFields.payload
        ], consts.UDP_DOWNLINK_BASIC_LEN + requiredFields.payload.length);
        break;
      }
      default: {
        return bluebird.reject(new ERROR.MsgTypeError({
          message: 'Bad type of UDP identifier',
          identifier: requiredFields.identifier.readUInt8(),
        }));
      }
    }

    return bluebird.resolve(data);
  }

  ACK(incomingJSON) {
    const identifierTemp = Buffer.from(incomingJSON.identifier);
    let requiredFields = Object.assign({}, incomingJSON);
    switch (requiredFields.identifier.readUInt8()) {
      case consts.UDP_ID_PUSH_DATA: {
        requiredFields.identifier.writeUInt8(consts.UDP_ID_PUSH_ACK);
        break;
      }
      case consts.UDP_ID_PULL_DATA: {
        requiredFields.identifier.writeUInt8(consts.UDP_ID_PULL_ACK);
        break;
      }
      default: {
        return bluebird.resolve(null);
      }
    }
    incomingJSON.identifier = Buffer.from(identifierTemp);
    return this.packager(requiredFields);
  }

  pushDataParser(udpPushJSON) {
    const JSONStr = udpPushJSON.pushData.toString(consts.UDP_PACKAGE_ENCODING);
    let pushDataJSON;
    try {
      pushDataJSON = JSON.parse(JSONStr);
    } catch (error) {
      return bluebird.reject(
        new ERROR.JSONParseError({
          message: 'Error format of JSON, unable to parse',
          objJSON: JSONStr,
        })
      );
    }

    let stat = {};
    let output = {};
    output.origin = udpPushJSON;
    let rxpkPromise;
    if ('stat' in pushDataJSON) {
      Object.assign(stat, pushDataJSON.stat);
      output.stat = stat;
    }

    if ('srcID' in pushDataJSON) {
      output.srcID = pushDataJSON.srcID;
    }

    if ('rxpk' in pushDataJSON) {
      rxpkPromise = bluebird.filter(pushDataJSON.rxpk, (element, ind) => {
        return this.phyHandler.phyParser.parser(element.data)
          .then((data) => {
            element.raw = element.data;
            element.data = data;
            return bluebird.resolve(element);
          })
          .catch((error) => {
            if (error instanceof ERROR.DeviceNotExistError) {
              this.log.error(error.message);
              return bluebird.resolve(null);
            } else {
              return bluebird.reject(error);
            }

          });
      });
    } else {
      rxpkPromise = bluebird.resolve(null);
    }

    return rxpkPromise
      .then((rxpk) => {
        if (rxpk) {
          output.rxpk = rxpk;
        }

        return bluebird.resolve(output);
      });
  }

  pullRespPackager(pullJson) {
    let tx;
    if ('pullRes' in pullJson) {
      tx = udpUtils.generateTxpk(pullJson.rxi, pullJson.pullRes, pullJson.gatewayId);
    }

    if ('joinAcp' in pullJson) {
      tx = udpUtils.geneJoinAcpTxpk(pullJson.rxi, pullJson.joinAcp, pullJson.gatewayId);
    }

    if (!tx) {
      return null;
    }

    let dlinkpackage = {
      version: pullJson.version,
      token: Buffer.from('0000', 'hex'),
      identifier: Buffer.from('03', 'hex'),
      txpk: tx,
    };

    return this.packager(dlinkpackage);
  }

  txAckParser(txAckData) {
    let txAckJSON;
    try {
      txAckJSON = JSON.parse(txAckData);
    } catch (error) {
      if (error instanceof SyntaxError) {
        txAckJSON = txAckData;
      }
    }

    return txAckJSON;
  }

};

module.exports = UDPHandler;
