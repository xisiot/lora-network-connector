const util = require('util');
const config = require('./config');
const { consts, ERROR, Models, Log, MQClient, dbClient } = require('./lib/lora-lib');
const { UDPHandler, UDPServer } = require('./lib/udpHandler');
const GatewayHandler = require('./lib/gatewayHandler');
const PHYHandler = require('./lib/phyHandler');
const JoinHandler = require('./lib/joinHandler');

const db = {
  RedisClient: dbClient.createRedisClient(config.database.redis),
  MySQLClient: dbClient.createSequelizeClient(config.database.mysql),
};

const bluebird = require('bluebird');

const modelIns = {
  RedisModel: {},
  MySQLModel: {},
};
for (let model in Models.RedisModels) {
  modelIns.RedisModel[model] = new Models.RedisModels[model](db.RedisClient);
}

for (let model in Models.MySQLModels) {
  modelIns.MySQLModel[model] = new Models.MySQLModels[model](db.MySQLClient);
}

const log = new Log(config.log);
const joinHandler = new JoinHandler(modelIns.MySQLModel.DeviceInfo, log);
const udpServer = new UDPServer(log);
const phyHandler = new PHYHandler(modelIns, joinHandler, log);
const udpHandler = new UDPHandler(log, phyHandler);
const mqClient = new MQClient(config.mqClient_nc, log);
const gatewayHandler = new GatewayHandler(modelIns, log, mqClient);

mqClient.connect()
  .then(() => {
    //Uplink
    udpServer.bind(config.udp, () => {
      udpServer.recv((message, udpInfo) => {
        udpHandler.parser(message)
          .then((udpUlJSON) => {
            //Verify GatewayId
            return gatewayHandler.verifyGateway(udpUlJSON.gatewayId)
              .then(() => {
                return bluebird.resolve(udpUlJSON);
              });
          })
          .then((udpUlJSON) => {
            const gatewayConfig = {
              gatewayId: udpUlJSON.gatewayId,
              address: udpInfo.address,
              port: udpInfo.port,
              identifier: udpUlJSON.identifier,
            };
            return gatewayHandler.updateGatewayAddress(
              gatewayConfig
            )
              .then(() => {
                return bluebird.resolve(udpUlJSON);
              });
          })
          .then((udpUlJSON) => {
            return udpHandler.ACK(udpUlJSON)
              .then((udpACK) => {
                if (udpACK) {
                  udpServer.send(udpACK, udpInfo);
                }

                return bluebird.resolve(udpUlJSON);
              });
          })
          .then((udpUlJSON) => {
            if (udpUlJSON.pushData) {
              return udpHandler.pushDataParser(udpUlJSON)
                .then((pushData) => {
                  return gatewayHandler.uploadPushData(pushData);
                });
            } else {
              log.info(udpUlJSON);
              return mqClient.publish(config.mqClient_nc.topics.pubToServer, udpUlJSON);
            }

          })
          .catch((error) => {
            if (error instanceof ERROR.MsgTypeError) {
              log.error(error.message);
            } else if (error instanceof ERROR.UDPVersionError) {
              log.error(error.message);
            } else if (error instanceof ERROR.JSONParseError) {
              log.error(error.message);
            } else if (error instanceof ERROR.InvalidMessageError) {
              log.error(error.message);
            } else if (error instanceof ERROR.MICMismatchError) {
              log.error(error.message);
            } else if (error instanceof RangeError) {
              log.error(error.message);
            } else if (error instanceof ERROR.GatewayNotExistError) {
              log.error(error.message);
            } else {
              log.error(error.stack);
            }

          });
      });

      //Downlink
      mqClient.message((message) => {
        let udpDlData;
        const logInfo = {
          messageType: message.value.txpk.data.MHDR.MType,
          gatewayId: message.value.gatewayId,
        };

        if (logInfo.messageType === consts.JOIN_ACCEPT) {
          logInfo.joinAcpt = message.value.txpk.data.MACPayload.toString('hex');
        } else {
          logInfo.DevAddr = message.value.txpk.data.MACPayload.FHDR.DevAddr;
        }

        return phyHandler.phyPackager.packager(message.value.txpk.data)
          .then((PHYPayload) => {
            message.value.txpk.size = PHYPayload.length;
            message.value.txpk.data = PHYPayload.toString(consts.DATA_ENCODING);
            return udpHandler.packager(message.value)
              .then((udpDlData) => {
                return modelIns.RedisModel.GatewayInfo.queryGatewayAddress(message.value.gatewayId)
                  .then((udpInfo) => {
                    udpInfo.port = udpInfo.pullPort;
                    logInfo.port = udpInfo.pullPort;
                    logInfo.identifier = Buffer.alloc(consts.UDP_IDENTIFIER_LEN);
                    logInfo.identifier.writeUInt8(consts.UDP_ID_PULL_RESP);
                    logInfo.gatewayIP = udpInfo.address;
                    log.info(logInfo);
                    return udpServer.send(udpDlData, udpInfo, message.value.gatewayId);
                  });
              });
          })
          .catch((error) => {
            if (error instanceof ERROR.UDPPortError) {
              log.error(error.message);
            } else if (error instanceof ERROR.MACCommandCidError) {
              log.error(error.message);
            } else {
              log.error(error.stack);
            }

          });
      });
      return bluebird.resolve();
    });
  })
  .catch((error) => {
    //FATAL ERROR
    log.error(error.stack);
    mqClient.disconnect();
    udpServer.destructor();
  });

