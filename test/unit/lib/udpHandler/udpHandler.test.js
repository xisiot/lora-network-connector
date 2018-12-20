const chai = require('chai');
const path = require('path');
const expect = chai.expect;
const assert = chai.assert;
chai.should();
const chaiAsPromised = require('chai-as-promised');
const mocha = require('mocha');
const crypto = require('crypto');
const baseDir = '../../../../';
const join = require('path').join.bind(undefined, baseDir);
const { consts, ERROR, Log } = require(join('lib/lora-lib'));
const UDPHandler = require(join('lib/udpHandler/udpHandler'));
const config = require(join('config'));

const log = new Log(config.log);

chai.use(chaiAsPromised);

describe('Test UDP parser', () => {
  let udpHandler;
  let udpPUSHDATA;
  let udpPULLDATA;
  let udpTXACK;
  let udpErrorVersion;
  let udpErrorIdentifier;
  before('Initial a handler', () => {
    udpHandler = new UDPHandler(log);
    const udpEUI = crypto.randomBytes(consts.GWEUI_LEN);
    const baseLen = 4;
    const base = Buffer.alloc(baseLen);
    base.writeUIntBE(0x02000000, 0, baseLen);
    const udpBase = Buffer.concat([base, udpEUI]);
    const udpData = crypto.randomBytes(10);

    //PUSHDATA
    udpBase[consts.UDP_IDENTIFIER_OFFSET] = consts.UDP_ID_PUSH_DATA;
    udpPUSHDATA = Buffer.concat([
      udpBase,
      udpData,
    ]);

    //PULLDATA
    udpBase[consts.UDP_IDENTIFIER_OFFSET] = consts.UDP_ID_PULL_DATA;
    udpPULLDATA = Buffer.from(udpBase);

    //TXACK
    udpBase[consts.UDP_IDENTIFIER_OFFSET] = consts.UDP_ID_TX_ACK;
    udpTXACK = Buffer.concat([
      udpBase,
      udpData,
    ]);

    //Error Version
    udpBase[consts.UDP_VERSION_OFFSET] = 0x0FF;
    udpErrorVersion = Buffer.from(udpBase);

    //Error Identifier
    udpBase[consts.UDP_VERSION_OFFSET] = 0x02;
    udpBase[consts.UDP_IDENTIFIER_OFFSET] = 0xFF;
    udpErrorIdentifier = Buffer.from(udpBase);
  });

  it('PUSHDATA', (done) => {
    udpHandler.parser(udpPUSHDATA)
    .then((udpPushDataJSON) => {
      expect(udpPushDataJSON.version.equals(udpPUSHDATA.slice(0, 1))).to.be.true;
      expect(udpPushDataJSON.token.equals(udpPUSHDATA.slice(1, 3))).to.be.true;
      expect(udpPushDataJSON.identifier.equals(udpPUSHDATA.slice(3, 4))).to.be.true;
      expect(udpPushDataJSON.gatewayId.equals(udpPUSHDATA.slice(4, 12)));
      done();
    })
    .catch(done);
  });

  it('PULLDATA', (done) => {
    udpHandler.parser(udpPULLDATA)
    .then((udpPullDataJSON) => {
      expect(udpPullDataJSON.version.equals(udpPULLDATA.slice(0, 1))).to.be.true;
      expect(udpPullDataJSON.token.equals(udpPULLDATA.slice(1, 3))).to.be.true;
      expect(udpPullDataJSON.identifier.equals(udpPULLDATA.slice(3, 4))).to.be.true;
      expect(udpPullDataJSON.gatewayId.equals(udpPULLDATA.slice(4, 12)));
      done();
    })
    .catch(done);
  });

  it('TXACK', (done) => {
    udpHandler.parser(udpTXACK)
    .then((udpTxACKJSON) => {
      expect(udpTxACKJSON.version.equals(udpTXACK.slice(0, 1))).to.be.true;
      expect(udpTxACKJSON.token.equals(udpTXACK.slice(1, 3))).to.be.true;
      expect(udpTxACKJSON.identifier.equals(udpTXACK.slice(3, 4))).to.be.true;
      done();
    })
    .catch(done);
  });

  it('Error version', () => {
    udpHandler.parser(udpErrorVersion).should.be.rejectedWith(ERROR.UDPVersionError);
  });

  it('Error identifier', () => {
    udpHandler.parser(udpErrorIdentifier).should.be.rejectedWith(ERROR.MsgTypeError);
  });
});

describe('Test UDP packager', (done) => {
  let udpHandler;
  let udpBaseJSON = {};
  let udpPUSHACK;
  let udpPULLACK;
  let udpPULLRESP;
  let udpPUSHACKJSON;
  let udpPULLACKJSON;
  let udpPULLRESPJSON;
  before('Initial a handler', () => {
    udpHandler = new UDPHandler(log);
    udpBaseJSON.version = Buffer.alloc(consts.UDP_VERSION_LEN);
    udpBaseJSON.version.writeUInt8(0x02);
    udpBaseJSON.token = Buffer.alloc(consts.UDP_TOKEN_LEN);
    udpBaseJSON.identifier = Buffer.alloc(consts.UDP_IDENTIFIER_LEN);
    udpPUSHACK = Buffer.alloc(consts.UDP_DOWNLINK_BASIC_LEN);
    udpPUSHACK.writeUInt8(0x02, 0);
    udpPUSHACK.writeUInt8(consts.UDP_ID_PUSH_ACK, consts.UDP_IDENTIFIER_OFFSET);

    udpPULLACK = Buffer.alloc(consts.UDP_PULL_ACK_LEN);
    udpPULLACK.writeUInt8(0x02, 0);
    udpPULLACK.writeUInt8(consts.UDP_ID_PULL_ACK, consts.UDP_IDENTIFIER_OFFSET);

    udpPULLRESP = Buffer.alloc(consts.UDP_DOWNLINK_BASIC_LEN);
    udpPULLRESP.writeUInt8(0x02, 0);
    udpPULLRESP.writeUInt8(consts.UDP_ID_PULL_RESP, consts.UDP_IDENTIFIER_OFFSET);
    const testTxpk = {
      txpk: Buffer.alloc(10),
    };
    udpPULLRESP = Buffer.concat([
      udpPULLRESP,
      Buffer.from(JSON.stringify(testTxpk)),
    ]);
  });

  it('PUSH_ACK', (done) => {
    udpPUSHACKJSON = Object.assign({}, udpBaseJSON);
    udpPUSHACKJSON.identifier.writeUInt8(consts.UDP_ID_PUSH_ACK);
    udpHandler.packager(udpPUSHACKJSON)
    .then((udpRecPUSHACK) => {
      expect(udpRecPUSHACK.equals(udpPUSHACK)).to.be.true;
      done();
    })
    .catch(done);
  });

  it('PULL_ACK', (done) => {
    udpPULLACKJSON = Object.assign({}, udpBaseJSON);
    udpPULLACKJSON.identifier.writeUInt8(consts.UDP_ID_PULL_ACK);
    udpPULLACKJSON.gatewayId = Buffer.alloc(consts.GWEUI_LEN);
    udpHandler.packager(udpPULLACKJSON)
    .then((udpRecPULLACK) => {
      expect(udpRecPULLACK.equals(udpPULLACK)).to.be.true;
      done();
    })
    .catch(done);
  });

  it('PULL_RESP', (done) => {
    udpPULLRESPJSON = Object.assign({}, udpBaseJSON);
    udpPULLRESPJSON.identifier.writeUInt8(consts.UDP_ID_PULL_RESP);
    udpPULLRESPJSON.txpk = Buffer.alloc(10);
    udpHandler.packager(udpPULLRESPJSON)
    .then((udpRecPULLRESP) => {
      expect(udpRecPULLRESP.equals(udpPULLRESP)).to.be.true;
      done();
    })
    .catch(done);
  });

  it('Error identifier', () => {
    const udpErrorType = Object.assign({}, udpBaseJSON);
    udpErrorType.identifier.writeUInt8(0xFF);
    udpHandler.packager(udpErrorType).should.be.rejectedWith(ERROR.MsgTypeError);
  });
});
