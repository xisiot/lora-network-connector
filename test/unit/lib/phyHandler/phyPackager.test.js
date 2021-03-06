const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const mocha = require('mocha');
const crypto = require('crypto');
const baseDir = '../../../../';
const join = require('path').join.bind(undefined, baseDir);

const { utils, consts, Log, Models, dbClient } = require(join('lib/lora-lib'));
const reverse = utils.bufferReverse;
const config = require(join('config'));
const log = new Log(config.log);


const db = {
  RedisClient: dbClient.createRedisClient(config.database.redis),
  MySQLClient: dbClient.createSequelizeClient(config.database.mysql),
};

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

const PhyPackager = require(join('lib/phyHandler/phyPackager'));
const phyPackager = new PhyPackager(modelIns.RedisModel.DeviceInfo, null, log);

describe('Test PHY packager', () => {

  let FCtrlJSON;
  let FCtrl;
  before('initialization', () => {
    FCtrlJSON = {
      ADR: 0,
      ACK: 1,
      FPending: 0,
      FOptsLen: 5,
    };

  });
  it('Test MHDR packager', () => {
    const MHDRJSON = {
      MType: consts.CONFIRMED_DATA_DOWN,
      Major: 0,
    };
    const expectedMHDR = Buffer.from('A0', 'hex');
    const MHDR = PhyPackager.MHDRPackager(MHDRJSON);
    expect(MHDR.equals(expectedMHDR)).to.be.true;

  });

  it('Test FCtrl packager', () => {
    const expectedFCtrl = Buffer.from('25', 'hex');
    FCtrl = PhyPackager.FCtrlPackager(FCtrlJSON);
    expect(FCtrl.equals(expectedFCtrl)).to.be.true;
  });

  it('Test FHDR packager', () => {
    const FHDRJSON = {
      DevAddr: crypto.randomBytes(consts.DEVADDR_LEN),
      FCtrl: FCtrlJSON,
      FCnt: crypto.randomBytes(consts.FCNT_LEN),
      FOpts: [{ 
        '03': { 
          TXPower: Buffer.from('01', 'hex'),
          ChMask: Buffer.from('00ff', 'hex'),
          Redundancy: Buffer.from('02', 'hex'),
        },
      }],
    };
    const expectedFHDR = Buffer.concat([
      reverse(FHDRJSON.DevAddr),
      reverse(FCtrl),
      reverse(FHDRJSON.FCnt.slice(consts.FCNT_LEAST_OFFSET)),
      Buffer.from('030100ff02', 'hex'),
    ]);
    const FHDR = PhyPackager.FHDRPackager(FHDRJSON);
    console.log(FHDR);
    console.log(expectedFHDR);
    expect(FHDR.equals(expectedFHDR)).to.be.true;

  });

  it('Test MIC packager', (done) => {
    const DevAddr = Buffer.from('006aaeed', 'hex');
    const MHDR = Buffer.from('80', 'hex');
    const FHDR = Buffer.from('edae6a00800100', 'hex');
    const FPort = Buffer.from('02', 'hex');
    const FCnt = Buffer.from('00000001', 'hex');
    const phyPayloadJSON = {
      MHDR: {
        MType: 5,
        Major: 0,
      },
      MACPayload: {
        FHDR: {
          DevAddr,
          FCtrl: {
            ADR: 1,
            ACK: 1,
            FPending: 0,
            FOptLen: 0,
          },
          FCnt,
        },
        FPort,
      },
    };
    phyPackager.packager(phyPayloadJSON)
    .then(() => done());
  });

  after('Close connection', (done) => {
    db.RedisClient.disconnect();
    db.MySQLClient.close();
    done();
  });

});
