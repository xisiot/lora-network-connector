'use strict';

const _ = require('lodash');
const { consts } = require('../lora-lib');

const _this = {

  DownstreamDR: function (freq, chan, datr, tmst, gwid) {

    /** DownstreamDR
      * @param phyPayload : uplink package
      */
    const downstream = {
      freq: freq,
      datr: datr,
    };
    let key;
    if (freq <= 437 && freq >= 433) {
      downstream.freq = freq;
      downstream.powe = 25;
      downstream.tmst = tmst + 1000000;
      for (key in consts.DR433) {
        if (consts.RX1DROFFSET433TABLE[consts.DR433[datr]][consts.RX1DROFFSET433] === consts.DR433[key]) {
          downstream.datr = key;
        }
      }
    } else if (freq <= 928 && freq >= 902) {
      downstream.powe = 10;
      downstream.tmst = tmst + 1000000;
      downstream.freq = 923.3 + (chan % 8) * 0.6;
      for (key in consts.DR915DOWN) {
        if (consts.RX1DROFFSET915TABLE[consts.DR915UP[datr]][consts.RX1DROFFSET915] === consts.DR915DOWN[key]) {
          downstream.datr = key;
        }
      }
    }

    if (gwid === 'fffeb827ebf06ee8') {
      downstream.powe = 10;
    }

    return downstream;
  },

  geneResSize: function (data, flag) {
    if (flag === '24') {
      let size = 1 + 4 + 1 + 2 + data.foptslen + 1 + 4;
      if (data.FRMPayload) {
        return size + data.FRMPayload.length;
      }

      return size;
    } else if (flag === '0') {
      let size = 1 + 3 + 3 + 4 + 1 + 1 + 4;
      if (data.CFList) {
        return size + 16;
      }

      return size;
    }

  },

  generateTxpk: function (rxpk, data, gwid) {
    const downlink = _this.DownstreamDR(rxpk.freq, rxpk.chan, rxpk.datr, rxpk.tmst, gwid);
    const tx = {
      tmst: downlink.tmst, //newTmst, // '{\'imme\':true' +
      freq: downlink.freq, //mtdt.rawMetadata.freq,
      rfch: 0,
      powe: downlink.powe, //25,
      modu: rxpk.modu,
      datr: downlink.datr, //newDatr, //mtdt.rawMetadata.datr,
      codr: rxpk.codr,
      ipol: false,
      size: _this.geneResSize(data, '24'),
      data: data.phypld,
    };
    return tx;
  },

  geneJoinAcpTxpk: function (rxpk, data, gwid) {
    const downlink = _this.DownstreamDR(rxpk.freq, rxpk.chan, rxpk.datr, rxpk.tmst, gwid);
    const tx = {
      tmst: downlink.tmst, //newTmst, // '{\'imme\':true' +
      freq: downlink.freq, //mtdt.rawMetadata.freq,
      rfch: 0,
      powe: downlink.powe, //25,
      modu: rxpk.modu,
      datr: downlink.datr, //newDatr, //mtdt.rawMetadata.datr,
      codr: rxpk.codr,
      ipol: false,
      size: _this.geneResSize(data, '0'),
      data: data,
    };
    return tx;
  },

};

module.exports = _this;
