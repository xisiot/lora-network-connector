const PHYParser = require('./phyParser');
const PHYPackager = require('./phyPackager');

class PHYHandler {
  constructor (models, joinHandler, log) {
    this.phyParser = new PHYParser(models.DeviceInfo, joinHandler, log);
    this.phyPackager = new PHYPackager(models.DeviceInfo, joinHandler, log);
  }
};

module.exports = PHYHandler;
