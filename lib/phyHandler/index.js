const PHYParser = require('./phyParser');
const PHYPackager = require('./phyPackager');

class PHYHandler {
  constructor (modelIns, joinHandler, log) {
    this.phyParser = new PHYParser(modelIns, joinHandler, log);
    this.phyPackager = new PHYPackager(modelIns.RedisModel.DeviceInfo, joinHandler, log);
  }
};

module.exports = PHYHandler;
