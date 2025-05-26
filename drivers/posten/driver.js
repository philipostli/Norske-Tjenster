'use strict';

const { Driver } = require('homey');
const axios = require('axios');

class Posten extends Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this._postToday = this.homey.flow.getDeviceTriggerCard('posten_sensor_changed');
    this.homey.app.dDebug('Posten has been initialized', 'Posten');
  }

  /*async onPair(session) {
    this.homey.app.dDebug('Posten has been paired');
  }*/

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices(session) {
    this.homey.app.dDebug('[Driver] Starting device pairing process', 'Posten');
    
    try {
      const lat = this.homey.geolocation.getLatitude();
      const lon = this.homey.geolocation.getLongitude();
      const radius = 100;
      
      this.homey.app.dDebug(`[Driver] Fetching address data for location: ${lat},${lon}`, 'Posten');
      
      const response = await axios.get(`https://ws.geonorge.no/adresser/v1/punktsok?lat=${lat}&lon=${lon}&radius=${radius}`);
      
      if (!response.data || !response.data.adresser || response.data.adresser.length === 0) {
        this.homey.app.dError('[Driver] No address data found', 'Posten');
        throw new Error('No address data found');
      }
      
      const postnummer = response.data.adresser[0].postnummer;
      this.homey.app.dDebug(`[Driver] Found postal code: ${postnummer}`, 'Posten');
      
      const devices = [{
        name: `Postlevering for ${postnummer}`,
        data: {
          id: `posten-${postnummer}`,
        },
        settings: {
          postnr: postnummer,
          pollInterval: 3600 // Default to 1 hour
        }
      }];
      
      this.homey.app.dDebug(`[Driver] Device list created: ${JSON.stringify(devices)}`, 'Posten');
      return devices;
      
    } catch (error) {
      this.homey.app.dError(`[Driver] Error during device pairing: ${error.message}`, 'Posten');
      throw error; // Propagate the error to show it in the pairing process
    }
  }

}

module.exports = Posten;
