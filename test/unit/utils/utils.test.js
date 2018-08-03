const chai = require('chai');
chai.use(require('chai-json-schema-ajv'));
const path = require('path');
const expect = chai.expect;
const assert = chai.assert;
const mocha = require('mocha');
const crypto = require('crypto');

const { utils } = require('../../../lib/lora-lib');

describe('Test utilities module', () => {
  const bufLen = 10;
  const buf1 = crypto.randomBytes(bufLen);
  const buf2 = crypto.randomBytes(bufLen);
  const obj1 = {
    buf1: buf1,
    buf2: buf2,
  };
  const obj2 = {
    name: 'obj2',
    buf3: buf1,
  };
  const obj1Hex = {
    buf1: buf1.toString('hex'),
    buf2: buf2.toString('hex'),
  };

  describe('Test mergeObjWithBuf', () => {
    const objObj = {
      buf1: buf1,
      buf2: buf2,
      name: 'obj2',
      buf3: buf1,
    };
    it('Merge Object with Buffer', () => {
      const res = utils.mergeObjWithBuf(obj1, obj2);
      expect(res).to.deep.equal(objObj);
    });
  });

  describe('Test objBuf2Hex', () => {
    it('Buffer 2 hex in Object', () => {
      const res = utils.objBuf2Hex(obj1);
      expect(res).to.deep.equal(obj1Hex);
    });
  });

  describe('Test objHex2Buf', () => {
    it('Hex 2 Buffer in Object', () => {
      const res = utils.objHex2Buf(obj1Hex, ['buf1', 'buf2']);
      expect(res).to.deep.equal(obj1);
    });
  });

  describe('Test bitwiseAssigner', () => {
    it('Assign bits to a byte', () => {
      const oneByte = Buffer.alloc(1);
      const bit = 1;
      const off = 5;
      const len = 1;
      const expectedByte = Buffer.from('20', 'hex');
      const res = utils.bitwiseAssigner(oneByte, off, len, bit);
      expect(res.equals(expectedByte)).to.be.true;

    });
  });

  //describe('Test bitwiseFilter', () => {
  //  const oneBytes = Buffer.alloc(1);
  //  oneBytes.writeUInt8();

  //});

  describe('Test bufferSlice', () => {
    it('Slice and copy Buffer', () => {
      const res = utils.bufferSlice(buf1, 0, bufLen / 2);
      expect(res.equals(buf1.slice(0, 5).reverse())).to.be.true;
    });
    it('bufferSlice without giving end param', () => {
      const res = utils.bufferSlice(buf1, 5);
      expect(res.equals(buf1.slice(5, bufLen).reverse())).to.be.true;
    });
    it('bufferSlice does not reverse', () => {
      const res = utils.bufferSlice(buf1, 5, bufLen, false);
      expect(res.equals(buf1.slice(5, bufLen))).to.be.true;
    });

  });

});

