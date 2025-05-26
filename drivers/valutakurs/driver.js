'use strict';

const { Driver } = require('homey');

class ExchangeRates extends Driver {

  async onInit() {
    this.homey.app.dDebug('ExchangeRates has been initialized', 'Valutakurs');
  }

  async onPairListDevices() {
    return [
      {
        name: 'Valutakurs',
        data: {
          id: 'ExchangeRates',
        },
      },
    ]
  }

}

module.exports = ExchangeRates;
