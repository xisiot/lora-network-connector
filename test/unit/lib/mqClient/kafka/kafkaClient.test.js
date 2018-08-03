const chai = require('chai');
chai.use(require('chai-json-schema-ajv'));
chai.use(require('chai-as-promised'));
const expect = chai.expect;
const assert = chai.assert;
const mocha = require('mocha');
const crypto = require('crypto');
const path = require('path');
const baseDir = '../../../../../';
const join = path.join.bind(undefined, baseDir);

const config = require(join('config'));
const { Log, MQClient } = require(join('lib/lora-lib'));
const log = new Log(config.log);

const mqConfig = {
  consumerGroup: {
    options: {
      kafkaHost: '123.56.236.147:9092',
      groupId: 'lora-network-connector-test',
      sessionTimeout: 15000,
      protocol: ['roundrobin'],
      fromOffset: 'latest',
    },
    topics: [
      'NC-test',
    ],
  },
  client: {
    kafkaHost: '123.56.236.147:9092',
    clientId: 'lora-network-connector-test',
  },
  producer: {
    requireAcks: 1,
    ackTimeoutMs: 100,
    patitionerType: 2,
  },
};

describe('Test MQ client', () => {
  let mqClient;
  before('Initial MQ client', () => {
    mqClient = new MQClient(mqConfig, log);
  });
  it('Test publish and subscribe', (done) => {
    const topic = 'NC-test';
    const len = 10;
    const message = crypto.randomBytes(len).toString('hex');

    mqClient.connect()
      .then(() => {
        mqClient.message((res) => {
          expect(res.value).to.equal(message);
          done();
        });
        mqClient.publish(topic, message);
      });
  }).timeout(config.mocha.timeout);
  after('Close MQ client', (done) => {
    mqClient.disconnect()
      .then(() => {
        done();
      });
  });

});

