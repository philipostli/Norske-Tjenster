'use strict';

const { Driver } = require('homey');

class FuelPrices extends Driver {

  async onInit() {
    this.homey.app.dDebug('FuelPrices has been initialized', 'FuelPrices');
  }

  async onPair(session) {
    session.setHandler("saveGasStation", async (data) => {
      this.homey.app.dDebug(`Station selected: ${data.name} (${data.id})`, 'FuelPrices');
      session.FuelPrices = {
        id: data.id,
        name: data.name,
        brand: data.brand,
        location: data.location,
        latitude: data.latitude,
        longitude: data.longitude,
        pictureUrl: data.pictureUrl,
        stationDetails: data.stationDetails,
        extras: data.extras,
      };
      return true;
    });

    session.setHandler("list_devices", async () => {
      return await this.onPairListDevices(session);
    });

    session.setHandler("saveDistanceInKM", async (data) => {
      const lat = this.homey.geolocation.getLatitude();
      const lon = this.homey.geolocation.getLongitude();

      session.FuelPrices = {
        id: 'closestCheapGasStation',
        name: 'billigste bensinstasjon',
        latitude: lat,
        longitude: lon,
        brand: 'Nærmeste',
        distance: data,
      };
      return true;
    });
  }

  async onPairListDevices(session) {
    let devices = [];

    let deviceName = `${session.FuelPrices.brand} ${session.FuelPrices.name}`;
    let deviceId = `${session.FuelPrices.brand}_${session.FuelPrices.name}_${session.FuelPrices.id}`;
    let device = {
      name: deviceName,
      data: {
        id: deviceId,
        lat: session.FuelPrices.latitude || '',
        lon: session.FuelPrices.longitude || '',
      },
      settings: {
        station: session.FuelPrices.id,
        distance: session.FuelPrices.distance || '',
      }
    };
    devices.push(device);
    this.homey.app.dDebug(`Added device ${deviceName}`, 'FuelPrices');
    return devices;
  }
}

module.exports = FuelPrices;
