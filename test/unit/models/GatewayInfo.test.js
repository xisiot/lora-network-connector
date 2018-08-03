const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const mocha = require('mocha');
const crypto = require('crypto');
const baseDir = '../../../';
const join = require('path').join.bind(undefined, baseDir);

const config = require(join('config'));
const redisConfig = config.database.redis;
const mysqlConfig = config.database.mysql;
const { dbClient, consts, Models, utils } = require(join('lib/lora-lib'));
const _ioredis = dbClient.createRedisClient(redisConfig);
const _sequelize = dbClient.createSequelizeClient(mysqlConfig);

const mochaConfig = config.mocha;

const testGatewayId = crypto.randomBytes(consts.GWEUI_LEN);
const testAddress = 'localhost';
const testPullPort = 10000;
const testPushPort = 10001;
const testVersion = 1;
const pushIdentifier = Buffer.from('00', 'hex');
const pullIdentifier = Buffer.from('02', 'hex');

const updateAddress = '127.0.0.1';
const updatePullPort = 20000;
const updatePushPort = 20001;

describe('Test GatewayInfo model', function () {
  let query;
  let testGatewayInfo;
  let GatewayInfoRedis;
  let GatewayInfoMySQL;
  let updateGatewayPushInfo;
  let updateGatewayPullInfo;
  let testMySQLGatewayInfo;
  const testUser = 'testUser';
  before('Get connection with database', function (done) {
    GatewayInfoRedis = new Models.RedisModel.GatewayInfo(_ioredis);
    GatewayInfoMySQL = new Models.MySQLModel.GatewayInfo(_sequelize);
    query = {
      gatewayId: testGatewayId,
    };
    testGatewayInfo = {
      gatewayId: testGatewayId,
      address: testAddress,
      pushPort: testPushPort,
      pullPort: testPullPort,
      version: testVersion,
    };
    updateGatewayPushInfo = {
      gatewayId: testGatewayId,
      address: updateAddress,
      port: updatePushPort,
      identifier: pushIdentifier,
    };
    updateGatewayPullInfo = {
      gatewayId: testGatewayId,
      address: updateAddress,
      port: updatePullPort,
      identifier: pullIdentifier,
    };
    testMySQLGatewayInfo = {
      gatewayId: testGatewayId,
      userID: testUser,
    };

    done();
  });

  it('GatewayInfo create', (done) => {
    GatewayInfoRedis
    .createItem(testGatewayInfo)
    .then(() => {
      return GatewayInfoRedis.readItem(query);
    })
    .then((res) => {
      expect(res).to.deep.equal(testGatewayInfo);
      return GatewayInfoRedis.removeItem(query);
    })
    .then(() => {
      done();
    })
    .catch((error) => {
      GatewayInfoRedis.removeItem(query);
      done(error);
    });

  }).timeout(mochaConfig.timeout);

  it('GatewayInfo update port', (done) => {
    GatewayInfoRedis
    .createItem(testGatewayInfo)
    .then(() => {
      return GatewayInfoRedis
      .updateGatewayAddress(
        updateGatewayPushInfo
      );
    }).then(() => {
      return GatewayInfoRedis
      .updateGatewayAddress(
        updateGatewayPullInfo
      );
    })
    .then(() => {
      return GatewayInfoRedis.readItem(query);
    })
    .then((data) => {
      console.log(data);
      expect(data.address).to.equal(updateAddress);
      expect(data.pushPort).to.equal(updatePushPort);
      expect(data.pullPort).to.equal(updatePullPort);
      return GatewayInfoRedis.removeItem(query);
    })
    .then(() => {
      done();
    })
    .catch((error) => {
      GatewayInfoRedis.removeItem(query);
      done(error);
    });
  });

  it('GatewayInfo query pullPort', (done) => {
    GatewayInfoRedis.createItem(testGatewayInfo)
    .then(() => {
      query = {
        gatewayId: testGatewayId,
      };
      const fields = [
        'address',
        'pullPort',
      ];

      return GatewayInfoRedis.readItem(query, fields);
    })
    .then((values) => {
      const expected = {
        address: testGatewayInfo.address,
        pullPort: testGatewayInfo.pullPort,
      };
      expect(values).to.deep.equal(expected);
      return GatewayInfoRedis.removeItem(query);
    })
    .then(() => {
      done();
    })
    .catch((error) => {
      GatewayInfoRedis.removeItem(query);
      done(error);
    });
  });

  it('MySQLGatewayInfo existItem test', (done) => {
    GatewayInfoMySQL.createItem(testMySQLGatewayInfo)
    .then(() => {
      query = {
        gatewayId: testGatewayId,
      };

      return GatewayInfoMySQL.existItem(query)
      .then((result) => {
        expect(result).to.be.true;
        GatewayInfoMySQL.removeItem(query);
        done();
      });
    })
    .catch((error) => {
      GatewayInfoMySQL.removeItem(query);
      done(error);
    });

  });

  it('MySQLGatewayInfo CRUD test', (done) => {
    done();
  });

  after('Close connection with database', () => {
    _ioredis.disconnect();
    _sequelize.close();
  });

});
