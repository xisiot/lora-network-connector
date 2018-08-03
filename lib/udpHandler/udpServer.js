const dgram = require('dgram');
const bluebird = require('bluebird');
const { ERROR } = require('../lora-lib');

const UDPServer = class {
  constructor (log) {
    this.log = log;
    this.udpServer = dgram.createSocket('udp4');
    this.udpServer.on('error', this.errorHandler.bind(this));
  }

  bind (config, callback) {
    this.config = config;
    this.udpServer.on('listening', () => {
      const port = this.config.port;
      this.log.info(`UDP Server started listening port: ${port}`);
      callback();
    });
    this.udpServer.bind(this.config);
  }

  recv (callback) {
    return this.udpServer.on('message', callback);
  }

  send (payloads, destinations, gatewayId) {
    const { address, port } = destinations; 
    try {
      this.udpServer.send(payloads, port, address);
      return bluebird.resolve(null);
    } catch (error) {
      if (error instanceof RangeError) {
        return bluebird.reject(
          new ERROR.UDPPortError({
            message: `The gateway has not pulled yet, no PULL_DATA port is found, the PULL_RESP message cannot be delivered`,
            gatewayId: gatewayId,
          })
        );
      } else {
        return bluebird.reject(error);
      }

    }
  }

  errorHandler (error) {
    if (error.syscall !== 'bind') {
      throw error;
    }

    let bind = typeof this.config.port === 'string' ?
     'Pipe ' + this.config.port : 'Port ' + this.config.port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
      case 'EACCES':
        this.log.error(bind + ' requires elevated privileges');
        break;
      case 'EADDRINUSE':
        this.log.error(bind + ' is already in use');
        break;
    }

    process.exit(1);
  }

  destructor () {
    const destroy = () => {
      this.log.info('The UDP server is closing.');
    };
    return this.udpServer.close(destroy);
  }

};

module.exports = UDPServer;
