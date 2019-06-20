const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const mocha = require('mocha');
const crypto = require('crypto');
const baseDir = '../../../../';
const { utils, consts, Log, Models, dbClient } = require('../../../../lib/lora-lib');
const reverse = utils.bufferReverse;
const config = require('../../../../config');
const log = new Log(config.log);

const userID = 'test_join-accept';

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

const PhyPackager = require('../../../../lib/phyHandler/phyPackager');
const joinHandler = require('../../../../lib/joinHandler/joinHandler');
const JoinHandler = new joinHandler(modelIns.MySQLModel.DeviceInfo,log);
const phyPackager = new PhyPackager(modelIns.MySQLModel.DeviceInfo, JoinHandler, log);

const testDeveloper = {
  developer_id: userID,
  email: 'newjoinaccept@163.com',
  password: 'e10adc3949ba59abbe56e057f20f883e',
  is_login: false,
  name: 'test',
  time: new Date().getSeconds(),
};

const delOpts = {
  developer_id: userID,
};

const appInfo = {
  JoinEUI: Buffer.alloc(consts.JOINEUI_LEN),
  userID: userID,
  name: 'test',
};

const appQuery = {
  JoinEUI: appInfo.JoinEUI,
};

const deviceInfo = {
  DevAddr: Buffer.from('006aaeed', 'hex'),
  DevEUI: crypto.randomBytes(consts.DEVEUI_LEN),
  JoinEUI: appInfo.JoinEUI,
  JSIntKey: crypto.randomBytes(consts.JSINTKEY_LEN),
  NwkKey: crypto.randomBytes(consts.NWKKEY_LEN),
  JSEncKey: crypto.randomBytes(consts.JSENCKEY_LEN),
  JoinReqType: Buffer.from('00','hex'),
  DevNonce: Buffer.alloc(consts.DEVNONCE_LEN),
};

const deviceQuery = {
  DevEUI: deviceInfo.DevEUI,
};

describe('Test PHY packager', () => {
  // let FCtrlJSON;
  // let FCtrl;
  // before('initialization', () => {
  //   FCtrlJSON = {
  //     ADR: 0,
  //     ACK: 1,
  //     FPending: 0,
  //     FOptsLen: 5,
  //   };
  // });
  before ('Create mysql instance', function (done)  {
    AppInfo = modelIns.MySQLModel.AppInfo;
    DeviceInfo = modelIns.MySQLModel.DeviceInfo;
    Developers = modelIns.MySQLModel.Developers;

    Developers.createItem(testDeveloper)
      .then(function () {
        return AppInfo.createItem(appInfo);
      })
      .then(function () {
        return DeviceInfo.createItem(deviceInfo);
      })
      .then(function () {
        done();
      })
      .catch(function (err) {
        console.log(err);
        Developers.removeItem(delOpts).then(function () {
          done(err);
        });
      });
  });

  // it('Test MHDR packager', () => {
  //   const MHDRJSON = {
  //     MType: consts.CONFIRMED_DATA_DOWN,
  //     Major: 0,
  //   };
  //   const expectedMHDR = Buffer.from('A0', 'hex');
  //   const MHDR = PhyPackager.MHDRPackager(MHDRJSON);
  //   expect(MHDR.equals(expectedMHDR)).to.be.true;

  // });

  // it('Test FCtrl packager', () => {
  //   const expectedFCtrl = Buffer.from('25', 'hex');
  //   FCtrl = PhyPackager.FCtrlPackager(FCtrlJSON);
  //   expect(FCtrl.equals(expectedFCtrl)).to.be.true;
  // });

  // it('Test FHDR packager', () => {
  //   const FHDRJSON = {
  //     DevAddr: crypto.randomBytes(consts.DEVADDR_LEN),
  //     FCtrl: FCtrlJSON,
  //     FCnt: crypto.randomBytes(consts.FCNT_LEN),
  //     FOpts: [{ 
  //       '03': { 
  //         TXPower: Buffer.from('01', 'hex'),
  //         ChMask: Buffer.from('00ff', 'hex'),
  //         Redundancy: Buffer.from('02', 'hex'),
  //       },
  //     }],
  //   };
  //   const expectedFHDR = Buffer.concat([
  //     reverse(FHDRJSON.DevAddr),
  //     reverse(FCtrl),
  //     reverse(FHDRJSON.FCnt.slice(consts.FCNT_LEAST_OFFSET)),
  //     Buffer.from('030100ff02', 'hex'),
  //   ]);
  //   const FHDR = PhyPackager.FHDRPackager(FHDRJSON);
  //   console.log(FHDR);
  //   console.log(expectedFHDR);
  //   expect(FHDR.equals(expectedFHDR)).to.be.true;

  // });

  it('Test MIC packager', (done) => {
    const DevAddr = Buffer.from('006aaeed', 'hex');
    const MHDR = Buffer.from('20', 'hex');
    // const FHDR = Buffer.from('edae6a00800100', 'hex');
    // const FPort = Buffer.from('02', 'hex');
    // const FCnt = Buffer.from('00000001', 'hex');
    const phyPayloadJSON = {
      MHDR: {
        MType: 1,
        Major: 0,
      },
      MACPayload: {
        JoinNonce: Buffer.alloc(consts.JOINNONCE_LEN),
        NetID: Buffer.alloc(consts.NETID_LEN),
        DevAddr: DevAddr,
        DLSettings: Buffer.alloc(consts.DLSETTINGS_LEN),
        RxDelay: Buffer.alloc(consts.RXDELAY_LEN),
      },
    };
    phyPackager.packager(phyPayloadJSON)
    .then(() => done());
  });

  after('Remove the data', function (done) {
    DeviceInfo.removeItem(deviceQuery)
    .then(function () {
      return AppInfo.removeItem(appQuery);
    })
    .then(function () {
      return Developers.removeItem(delOpts);
    })
    .then(function () {
      done();
    })
    .catch(function (err) {
      console.log(err);
      done(err);
    });
  });
    
  after('Close connection', (done) => {
    db.RedisClient.disconnect();
    db.MySQLClient.close();
    done();
  });
});
