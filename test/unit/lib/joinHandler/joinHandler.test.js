const bluebird = require('bluebird');
const chai = require('chai');
const mocha = require('mocha');
const cmac = require('node-aes-cmac').aesCmac;
const { utils, consts, Log, Models, dbClient } = require('../../../../lib/lora-lib');
const config = require('../../../../config');
const log = new Log(config.log);
const userID = 'rejointest';
const crypto = require('crypto');

const JoinHandler = require('../../../../lib/joinHandler/joinHandler');
const testDeveloper = {
  developer_id: userID,
  email: 'rejoin@163.com',
  password: 'e10adc3949ba59abbe56e057f20f883e',
  is_login: false,
  name: 'test',
  time: new Date().getSeconds(),
};

const testApp = {
  AppEUI: Buffer.alloc(consts.APPEUI_LEN),
  userID: userID,
  name: 'testApp',
};

const testDeviceInfo = {
  DevEUI: Buffer.alloc(consts.DEVEUI_LEN),
  DevAddr: Buffer.alloc(consts.DEVADDR_LEN, '03156354', 'hex'),
  AppKey: Buffer.from('2B7E151628AED2A6ABF7158809CF4F3C', 'hex'),
  AppEUI: Buffer.alloc(consts.APPEUI_LEN),
  DevNonce: '',
  AppNonce: '',
  NwkSKey: Buffer.from('2B7E151628AED2A6ABF7158809CF4F3C', 'hex'),
  AppSKey: Buffer.from('2B7E151628AED2A6ABF7158809CF4F3C', 'hex'),
  activationMode: 'OTAA',
  FCntUp: 0,
  NFCntDown: 0,
  AFCntDown: 0,
}

// const delApp = {
//   AppEUI: '0000000000000000',
// };

// const delDev = {
//   DevEUI: '0000000000000000',
// };

const delOpts = {
  developer_id: userID,
};

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


describe('Test joinhandler', () => {
  let testJoinHdl;
  let AppInfo;
  let DeviceInfo;
  let Developers;
  let phyPayloadJSON_test;
  let bufferArray;
  let micPayload;
  let options;
  let key;
  before ('phyPayloadJSON_test generation', () => {
    bufferArray = [
      Buffer.from('c0','hex'),
      Buffer.from('01','hex'),
      Buffer.from('0000000000000000','hex'),
      Buffer.from('0000000000000000','hex'),
      Buffer.from('00000000','hex')
    ];
    micPayload = Buffer.concat(bufferArray, consts.BLOCK_LEN_REJOINREQ_1_MIC);
    options = {
      returnAsBuffer: true,
    };
    key = Buffer.from('2B7E151628AED2A6ABF7158809CF4F3C','hex');
    phyPayloadJSON_test = {
      mhdr: Buffer.from('c0','hex'),
      mhdrJSON:{
        MType: 6,
        Major: 0,
      },
      macPayload: Buffer.from('01000000000000000000000000000000000000','hex'),
      MIC: Buffer.from(cmac(
        key,
        micPayload,
        options
      ).slice(0, consts.V102_CMAC_LEN)),
    };
  });
    
  before ('Create mysql instance', function (done)  {
    AppInfo = modelIns.MySQLModel.AppInfo;
    DeviceInfo = modelIns.MySQLModel.DeviceInfo;
    Developers = modelIns.MySQLModel.Developers;

    Developers.createItem(testDeveloper)
      .then(function () {
        return AppInfo.createItem(testApp);
      })
      .then(function () {
        return DeviceInfo.createItem(testDeviceInfo);
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

    testJoinHdl = new JoinHandler(DeviceInfo, log);

  });

  it('Test function Rejoin', function (done) {
    testJoinHdl.Rejoinparser(phyPayloadJSON_test).then(function (res) {
      console.log(res);
      done();
    })
    .catch(function(err) {
      console.log(err);
      done(err);
    });
  });

  // after('Remove the data', function (done) {
  //   Developers.removeItem(delApp)
  //     .then(function () {
  //       done();
  //     })
  //     .catch(function (err) {
  //       console.log(err);
  //       done(err);
  //     });
  // });     

  
  after('Remove the data', function (done) {
    AppInfo.removeItem(delApp)
      .then(function(){
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
 //    expect(testJoinHdl.Rejoinparser(phyPayloadJSON_test)).to.be.true;
});