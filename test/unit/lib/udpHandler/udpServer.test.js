const chai = require('chai');
chai.use(require('chai-json-schema-ajv'));
const expect = chai.expect;
const assert = chai.assert;
const mocha = require('mocha');
const crypto = require('crypto');
const baseDir = '../../../../';
const join = require('path').join.bind(undefined, baseDir);

const config = require(join('config'));
const UDPServer = require(join('lib/udpHandler/udpServer'));
const { Log } = require(join('lib/lora-lib'));

const log = new Log(config.log);

const udpLen = 10;

const randomInt = (min, max) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min);
};

describe('Test UDP server', () => {
  let udpClient;
  let udpServer;
  let payload;
  let udpDest;
  before('Initial a client', (done) => {
    const udpConfig = {
      host: 'localhost',
      port: 10000 + randomInt(0, 1000),
    };

    udpClient = new UDPServer(log);
    udpServer = new UDPServer(log);

    try {
      udpServer.bind(udpConfig, () => {});
    } catch (error) {
      done(error);
    }

    payload = crypto.randomBytes(udpLen);
    udpDest = {
      address: udpConfig.host,
      port: udpConfig.port,
    };
    done();
  });

  it('UDP send and recv', (done) => {
    const messageHdl = (message, info) => {
      expect(payload.equals(message)).to.be.true;
      done();
    };

    udpServer.recv(messageHdl);
    udpClient.send(payload, udpDest);
  });
  after('Closing', (done) => {
    udpServer.destructor();
    udpClient.destructor();
    done();
  });

});
