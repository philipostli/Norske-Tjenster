'use strict';

const { Driver } = require('homey');

class NorwegianFlagdays extends Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.homey.app.dDebug('Norske flaggdager has been initialized', 'NorwegianFlagdays');
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    return [
      //Returner en enhet som heter "Norske flaggdager" med id "norwegian-flagdays".
      {
        name: 'Norske flaggdager',
        data: {
          id: 'norwegian-flagdays',
        },
      },
    ];
  }

}

module.exports = NorwegianFlagdays;
