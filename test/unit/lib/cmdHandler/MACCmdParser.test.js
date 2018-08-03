const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const mocha = require('mocha');
const MACCmdParser = require('../../../../lib/cmdHandler').MACCmdParser;

const maccommand = Buffer.from('0101020301', 'hex');
const macCmdParser = new MACCmdParser();
const cmdArr = [
  {
    '01': {
      Version: Buffer.from('01', 'hex'),
    }
  },
  { '02': null },
  {
    '03': {
      Status: Buffer.from('01', 'hex'),
    }
  },
];

describe('Test MACCmd Parser', () => {
  it('test parser', () => {
    const res = macCmdParser.parser(maccommand);
    expect(res).to.deep.equal(cmdArr);
  });
});
