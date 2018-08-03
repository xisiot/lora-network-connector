const bluebird = require('bluebird');
const { ERROR, consts } = require('../lora-lib');
const config = require('../../config');

class GatewayHandler {
  constructor (models, log, mqClient) {
    this._GatewayInfoMySQL = models.MySQLModel.GatewayInfo;
    this._GatewayInfoRedis = models.RedisModel.GatewayInfo;
    this._mqClient = mqClient;
    this._log = log;
  }

  verifyGateway (gatewayId) {
    const query = { gatewayId: gatewayId };
    return this._GatewayInfoMySQL.existItem(query)
    .then((result) => {
      if (result) {
        return bluebird.resolve(null);
      } else {
        return bluebird.reject(new ERROR.GatewayNotExistError({
          msg: 'The received Gateway is not registered, the whole package is ignored',
          receivedGatewayId: gatewayId,
        }));
      }

    });
  }

  updateGatewayAddress (gatewayConfig) {
    if (gatewayConfig.identifier.readUInt8() === consts.UDP_ID_PULL_DATA) {
      gatewayConfig.pullPort = gatewayConfig.port;
    } else {
      gatewayConfig.pushPort = gatewayConfig.port;
    }

    return this._GatewayInfoRedis.updateGatewayAddress(
      gatewayConfig
    );
  }

  uploadPushData (pushData) {
    const msgHeader = {
      version: pushData.origin.version,
      token: pushData.origin.token,
      identifier: pushData.origin.identifier,
      gatewayId: pushData.origin.gatewayId,
    };
    const logMsg = {
      gatewayId: pushData.origin.gatewayId,
      identifier: pushData.origin.identifier,
      token: pushData.origin.token,
    };
    const DevAddr = [];
    const joinReq = [];
    const promiseList = [];
    if (pushData.stat && Object.keys(pushData.stat).length) {
      const stat = Object.assign({}, msgHeader);
      stat.stat = pushData.stat;
      promiseList.push(this._mqClient.publish(config.mqClient.topics.pubToServer, stat));
    }

    if (pushData.rxpk && Object.keys(pushData.rxpk).length) {
      pushData.rxpk.forEach((element) => {
        const rxpk = Object.assign({}, msgHeader);
        rxpk.rxpk = element;
        logMsg.messageType = element.data.MHDR.MType;
        if (logMsg.messageType === consts.JOIN_REQ) {
          joinReq.push(element.data.MACPayload.toString('hex'));
        } else {
          DevAddr.push(element.data.MACPayload.FHDR.DevAddr.toString('hex'));
        }

        promiseList.push(this._mqClient.publish(config.mqClient.topics.pubToServer, rxpk));
      });
      if (joinReq.length > 0) {
        logMsg.joinReq = joinReq;
      }

      if (DevAddr.length > 0) {
        logMsg.DevAddr = DevAddr;
      }

    }

    this._log.info(logMsg);
    return bluebird.all(promiseList);
  }
}

module.exports = GatewayHandler;
