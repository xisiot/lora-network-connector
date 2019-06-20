const BluebirdPromise = require('bluebird');
const chai = require('chai');
const mocha = require('mocha');
const { utils, consts, Log, Models, dbClient } = require('../../../lib/lora-lib');
const slice = utils.bufferSlice;
const config = require('../../../config');
const log = new Log(config.log);

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

const whereOpts = {
  DevAddr: testDeviceInfo.DevAddr,
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

describe('Test dbModels', function () {
  let AppInfo = modelIns.MySQLModel.AppInfo;
  let DeviceInfo = modelIns.MySQLModel.DeviceInfo;    
  let Developers = modelIns.MySQLModel.Developers;
  it('Use mysql connection & create a Device', function (done) { 
    Developers.createItem(testDeveloper)
      .then(function () {
        return AppInfo.createItem(testApp);
      })
      .then(function () {
        return DeviceInfo.createItem(testDeviceInfo);
      })
      .then(function () {
        return DeviceInfo.readItem(whereOpts);
      })
      .then(function (res) {
        done();
      })
      .catch(function (err) {
        console.log(err);
        Developers.removeItem(testConsts.delOpts).then(function () {
          done(err);
        });
      });
  });
});