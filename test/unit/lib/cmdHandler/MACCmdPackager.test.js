const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const mocha = require('mocha');
const MACCmdPackager = require('../../../../lib/cmdHandler').MACCmdPackager;

const cmdArr = [
  {
    '01': {
      Version: Buffer.from('01', 'hex'),
    }
  },
  {
    '02': {
      Margin: Buffer.from('45', 'hex'),
      GwCnt: Buffer.from('67', 'hex'),
    }
  },
  {
    '03': {
      TXPower: Buffer.from('89', 'hex'),
      ChMask: Buffer.from('abcd', 'hex'),
      Redundancy: Buffer.from('ef', 'hex'),
    }
  },
];
const macCmdPackager = new MACCmdPackager();
const maccommand = '01010245670389abcdef';

describe('Test MACCmd Packager', () => {
  it('test packager', () => {
    const res = macCmdPackager.packager(cmdArr);
    console.log(res);
    expect(res.toString('hex')).to.equal(maccommand);
  });
});
