'use strict';

const { Device } = require('homey');
const axios = require('axios');
const moment = require('moment');
require('moment/locale/nb');

class FuelPrices extends Device {

  async onInit() {
    this.homey.app.dDebug(`${this.getName()} has been initialized`, 'FuelPrices');
    this.settings = await this.getSettings();
    this.has98 = true;
    this.nearbyStations = [];
    this.deviceId = this.getData().id;

    this.activeDiscounts = {
      coopDiscount: { circlek: 0.45, circlekautomat: 0.25, best: 0.45 },
      trumfDiscount: { shell: 0.3 },
      tankenDiscount: { tanken: 0.5, esso: 0.45 },
      yxVisaDiscount: { yx: 0.4 },
      essoMasterCardDiscount: { esso: 0.4 },
      shellMasterCardDiscount: { shell: 0.4, shellexpress: 0.4 },
      circleKExtraMasterCardDiscount: { circlekautomat: 0.2, circlek: 0.4, best: 0.4 },
      snarveienPlussDiscount: { shell: 0.5 },
      '365PrivatDiscount': { esso: 0.34 }, // 3.65% rabatt håndteres separat
      flexiVisaDiscount: {}, // 4% rabatt på alle stasjoner håndteres separat
      nafXtraDiscount: { circlek: 0.65, circlekautomat: 0.45, best: 0.65 },
      nafMedlemDiscount: { circlek: 0.45, circlekautomat: 0.25, best: 0.45 },
      dnbMasterCardDiscount: {}, // 3% rabatt håndteres separat
      dnbMasterCardSagaDiscount: {}, // 4% rabatt håndteres separat
      drivEnergiDiscount: { driv: 0.4 },
      percentDiscounts: {
        '365PrivatDiscount': { esso: 3.65, all: 2 }, // 3.65% rabatt hos Esso
        flexiVisaDiscount: { all: 4 }, // 4% rabatt på alle stasjoner
        dnbMasterCardDiscount: { all: 3 }, // 3% rabatt på alle stasjoner
        dnbMasterCardSagaDiscount: { all: 4 } // 4% rabatt på alle stasjoner
      }
    };

    const language = this.homey.i18n.getLanguage();
    moment.locale(language === 'no' ? 'nb' : 'en');

    if (this.deviceId.includes('closestCheapGasStation')) {
      this.homey.app.dDebug(`Not getting prices for ${this.getName()} because it is a closestCheapGasStation`, 'FuelPrices');

      if (!this.hasCapability('meter_fuelprices_gasPrice95')) {
        await this.addCapability('meter_fuelprices_gasPrice95');
      }
      if (!this.hasCapability('sensor_fuelprices_cheapest95Station')) {
        await this.addCapability('sensor_fuelprices_cheapest95Station');
      }
      if (!this.hasCapability('meter_fuelprices_gasPrice98')) {
        await this.addCapability('meter_fuelprices_gasPrice98');
      }
      if (!this.hasCapability('sensor_fuelprices_cheapest98Station')) {
        await this.addCapability('sensor_fuelprices_cheapest98Station');
      }
      if (!this.hasCapability('meter_fuelprices_dieselPrice')) {
        await this.addCapability('meter_fuelprices_dieselPrice');
      }
      if (!this.hasCapability('sensor_fuelprices_cheapestDieselStation')) {
        await this.addCapability('sensor_fuelprices_cheapestDieselStation');
      }      
      if (!this.hasCapability('sensor_fuelprices_lastUpdate')) {
        await this.addCapability('sensor_fuelprices_lastUpdate');
      }

      if (this.hasCapability('sensor_fuelprices_stationName')) {
        await this.removeCapability('sensor_fuelprices_stationName');
      }

      const capabilities = this.getCapabilities();
      const expectedOrder = [
        'meter_fuelprices_gasPrice95',
        'sensor_fuelprices_cheapest95Station',
        'meter_fuelprices_gasPrice98',
        'sensor_fuelprices_cheapest98Station',
        'meter_fuelprices_dieselPrice',
        'sensor_fuelprices_cheapestDieselStation',
        'sensor_fuelprices_lastUpdate'
      ];

      let j = 0;
      const isInOrder = capabilities.every((item, i) => {
        while (j < expectedOrder.length && expectedOrder[j] !== item) {
          j++;
        }
        return j < expectedOrder.length;
      });

      if (!isInOrder) {
        this.homey.app.dDebug(`Capabilities for ${this.getName()} are not in the correct order. Reordering...`, 'FuelPrices');
        for (const capability of capabilities) {
          if (this.hasCapability(capability)) {
            await this.removeCapability(capability);
          }
        }
        for (const capability of expectedOrder) {
          if (!this.hasCapability(capability)) {
            await this.addCapability(capability);
          }
        }
        this.homey.app.dDebug(`Capabilities for ${this.getName()} are now in the correct order`, 'FuelPrices');
      } else {
        this.homey.app.dDebug(`Capabilities for ${this.getName()} are in the correct order`, 'FuelPrices');
      }

      await this.initializeStations();
      await this.getClosestCheapGasStation();

      this.interval = this.homey.setInterval(async () => {
        await this.getClosestCheapGasStation();
      }, 20 * 60 * 1000);

    } else {
      if (!this.hasCapability('sensor_fuelprices_stationName')) {
        await this.addCapability('sensor_fuelprices_stationName');
      }
      if (!this.hasCapability('meter_fuelprices_gasPrice95')) {
        await this.addCapability('meter_fuelprices_gasPrice95');
      }
      if (!this.hasCapability('meter_fuelprices_gasPrice98')) {
        await this.addCapability('meter_fuelprices_gasPrice98');
      }
      if (!this.hasCapability('meter_fuelprices_dieselPrice')) {
        await this.addCapability('meter_fuelprices_dieselPrice');
      }
      if (!this.hasCapability('sensor_fuelprices_lastUpdate')) {
        await this.addCapability('sensor_fuelprices_lastUpdate');
      }

      const capabilities = this.getCapabilities();
      const expectedOrder = [
        'sensor_fuelprices_stationName',
        'meter_fuelprices_gasPrice95',
        'meter_fuelprices_gasPrice98',
        'meter_fuelprices_dieselPrice',
        'sensor_fuelprices_lastUpdate'
      ];

      let j = 0;
      const isInOrder = capabilities.every((item, i) => {
        while (j < expectedOrder.length && expectedOrder[j] !== item) {
          j++;
        }
        return j < expectedOrder.length;
      });

      if (!isInOrder) {
        this.homey.app.dDebug(`Capabilities for ${this.getName()} are not in the correct order. Reordering...`, 'FuelPrices');
        for (const capability of capabilities) {
          if (this.hasCapability(capability)) {
            await this.removeCapability(capability);
          }
        }
        for (const capability of expectedOrder) {
          if (!this.hasCapability(capability)) {
            await this.addCapability(capability);
          }
        }
        this.homey.app.dDebug(`Capabilities for ${this.getName()} are now in the correct order`, 'FuelPrices');
      } else {
        this.homey.app.dDebug(`Capabilities for ${this.getName()} are in the correct order`, 'FuelPrices');
      }

      this.homey.setTimeout(async () => {
        await this.getPrices();
      }, 1000);

      this.interval = this.homey.setInterval(async () => {
        await this.getPrices();
      }, 20 * 60 * 1000);
    }
    await this.updateTimeAgo();
  }

  async getPrices() {
    this.homey.app.dDebug(`Getting prices for ${this.getName()}`, 'FuelPrices');
    try {
      const url = `http://crdx.us/fuelstations/station/prices?stationId=${this.settings.station}`;
      const response = await axios.get(url);

      const data = response.data.station;

      const uniqueFuelTypes = Object.keys(data);
      const latestPrices = {};

      for (const type of uniqueFuelTypes) {
        if (data[type] && data[type].price) {
          let discountedPrice = data[type].price;

          const fullStationName = await this.getCapabilityValue('sensor_fuelprices_stationName');
          const formattedBrand = await this.extractBrand(fullStationName);

          let maxDiscount = 0;
          let maxPercentDiscount = 0;

          // Sjekk faste rabatter
          for (const [discountKey, discountValue] of Object.entries(this.activeDiscounts)) {
            if (this.settings[discountKey] && discountValue[formattedBrand]) {
              maxDiscount = Math.max(maxDiscount, discountValue[formattedBrand]);
            }
          }

          // Sjekk prosentvise rabatter
          for (const [discountKey, discountValue] of Object.entries(this.activeDiscounts.percentDiscounts)) {
            if (this.settings[discountKey]) {
              if (discountValue[formattedBrand]) {
                maxPercentDiscount = Math.max(maxPercentDiscount, discountValue[formattedBrand]);
              } else if (discountValue.all) {
                maxPercentDiscount = Math.max(maxPercentDiscount, discountValue.all);
              }
            }
          }

          // Kalkuler endelig pris
          discountedPrice -= maxDiscount;
          discountedPrice -= (discountedPrice * maxPercentDiscount / 100);

          // Legg til den rabatterte prisen i latestPrices
          latestPrices[type] = discountedPrice;
        }
      }

      const fullStationName = await this.getCapabilityValue('sensor_fuelprices_stationName');
      this.homey.app.dDebug(`Cheapest prices for ${fullStationName}: ${JSON.stringify(latestPrices, null, 2)}`, 'FuelPrices');

      const latestTimestamp = Math.max(...uniqueFuelTypes.map(type => data[type]?.timestamp || 0));
      const typesAtLatestTimestamp = uniqueFuelTypes.filter(type => data[type]?.timestamp === latestTimestamp).join(', ');

      latestPrices.lastUpdated = `${moment(latestTimestamp).fromNow()} (${typesAtLatestTimestamp})`;
      this.latestPriceUpdate = latestTimestamp;
      this.latestPriceType = typesAtLatestTimestamp;

      const allPossibleFuelTypes = ['95', '98', 'D', 'FD']; // Alle mulige drivstofftyper
      const apiFuelTypes = Object.keys(data); // Henter drivstofftypene som faktisk finnes i API-responsen

      for (const type of allPossibleFuelTypes) {
        const capability = `meter_fuelprices_${type === 'D' ? 'dieselPrice' : type === 'FD' ? 'coloredDieselPrice' : `gasPrice${type}`}`;

        if (this.hasCapability(capability)) {
          if (latestPrices[type]) {
            await this.setCapabilityValue(capability, latestPrices[type]);
            await this.setCapabilityValue('sensor_fuelprices_lastUpdate', `${latestPrices.lastUpdated}`);
          } else if (!apiFuelTypes.includes(type)) { // Sjekker om typen finnes i API-responsen
            await this.removeCapability(capability);
            this.homey.app.dDebug(`${type} is not available for ${this.getName()}. Removing capability.`, 'FuelPrices');
          }
        } else {
          if (apiFuelTypes.includes(type)) { // Sjekker om typen finnes i API-responsen
            await this.addCapability(capability);
            if (latestPrices[type]) {
              await this.setCapabilityValue(capability, latestPrices[type]);
            }
            this.homey.app.dDebug(`${type} is available for ${this.getName()}. Adding capability.`, 'FuelPrices');
          }
        }
      }

      this.homey.app.dDebug(`Prices updated for ${this.getName()}`, 'FuelPrices');

      return latestPrices;
    } catch (error) {
      this.homey.app.dError(`Error getting prices: ${error}`, 'FuelPrices');
    }
  }

  async getClosestCheapGasStation() {
    this.homey.app.dDebug(`Getting closest cheap gas station`, 'FuelPrices');

    const nearbyStations = await this.getSpecificStationData();
    if (!nearbyStations) {
      this.homey.app.dError(`Ingen stasjoner funnet`, 'FuelPrices');
      for (const type of ['95', '98', 'D']) {
        const capability = type === 'D' ? 'meter_fuelprices_dieselPrice' : `meter_fuelprices_gasPrice${type}`;
        const sensor = type === 'D' ? 'sensor_fuelprices_cheapestDieselStation' : `sensor_fuelprices_cheapest${type}Station`;
        await this.setCapabilityValue(capability, null);
        await this.setCapabilityValue(sensor, null);
      }
      await this.setCapabilityValue('sensor_fuelprices_lastUpdate', 'Ingen stasjoner funnet');
      return null;
    }
    this.homey.app.dDebug(`Stasjoner innenfor ${this.settings.distance} km: ${nearbyStations.length}`, 'FuelPrices');

    const fuelTypes = ['95', '98', 'D'];
    const cheapestPrices = {};

    fuelTypes.forEach(type => {
      let cheapestStation = null;
      let cheapestPrice = Infinity;
      let cheapestTimestamp = null;

      nearbyStations.forEach(station => {
        let latestPrice = station[type];

        if (!latestPrice || !latestPrice.price || !latestPrice.stationId) {
          return;
        }

        let currentStation = this.nearbyStations.find(s => s.id === latestPrice.stationId);
        const formattedBrand = currentStation.brand.replace(/[\s-]/g, '').toLowerCase();
        let discountedPrice = latestPrice.price;

        let maxDiscount = 0;
        let maxPercentDiscount = 0;

        // Sjekk faste rabatter
        for (const [discountKey, discountValue] of Object.entries(this.activeDiscounts)) {
          if (this.settings[discountKey] && discountValue[formattedBrand]) {
            maxDiscount = Math.max(maxDiscount, discountValue[formattedBrand]);
          }
        }

        // Sjekk prosentvise rabatter
        for (const [discountKey, discountValue] of Object.entries(this.activeDiscounts.percentDiscounts)) {
          if (this.settings[discountKey]) {
            if (discountValue[formattedBrand]) {
              maxPercentDiscount = Math.max(maxPercentDiscount, discountValue[formattedBrand]);
            } else if (discountValue.all) {
              maxPercentDiscount = Math.max(maxPercentDiscount, discountValue.all);
            }
          }
        }

        // Kalkuler endelig pris
        discountedPrice -= maxDiscount;
        discountedPrice -= (discountedPrice * maxPercentDiscount / 100);

        // Sjekk om den rabatterte prisen er lavere enn den billigste prisen vi har funnet så langt
        if (discountedPrice < cheapestPrice) {
          cheapestPrice = discountedPrice;
          cheapestStation = currentStation;
          cheapestTimestamp = latestPrice.timestamp;
        }
      });

      if (cheapestStation) {
        cheapestPrices[type] = {
          stationId: cheapestStation.id,
          station: `${cheapestStation.brand} ${cheapestStation.name}`,
          price: cheapestPrice,
          timestamp: cheapestTimestamp,
          timestampConverted: moment(cheapestTimestamp).locale('nb').format('DD.MM.YYYY HH:mm'),
        };
      } else {
        this.homey.app.dDebug(`Ingen billigste stasjon funnet for ${type}`, 'FuelPrices');
      }
    });

    this.homey.app.dDebug(`Cheapest prices: ${JSON.stringify(cheapestPrices, null, 2)}`, 'FuelPrices');

    if (cheapestPrices) {
      for (const type of fuelTypes) {
        const capability = type === 'D' ? 'meter_fuelprices_dieselPrice' : `meter_fuelprices_gasPrice${type}`;
        const sensor = type === 'D' ? 'sensor_fuelprices_cheapestDieselStation' : `sensor_fuelprices_cheapest${type}Station`;

        if (cheapestPrices[type]) {
          await this.setCapabilityValue(sensor, cheapestPrices[type].station);
          await this.setCapabilityValue(capability, cheapestPrices[type].price);
        } else {
          await this.removeCapability(capability);
          await this.removeCapability(sensor);
          this.homey.app.dDebug(`Type ${type} is not available. Removing capability.`, 'FuelPrices');
        }
      }

      // Finn den sist oppdaterte prisen av de tre og bruk den som siste oppdatering
      const latestTimestamp = Math.max(...Object.keys(cheapestPrices).map(type => cheapestPrices[type]?.timestamp || 0));
      const typesAtLatestTimestamp = Object.keys(cheapestPrices).filter(type => cheapestPrices[type]?.timestamp === latestTimestamp).join(', ');
      this.latestPriceUpdate = latestTimestamp;
      this.latestPriceType = typesAtLatestTimestamp;
    } else {
      this.homey.app.dError(`No prices found for ${this.getName()}`, 'FuelPrices');
    }

    return cheapestPrices;
  }

  async getSpecificStationData() {
    if (!this.nearbyStations || this.nearbyStations.length === 0) {
      this.homey.app.dError('No nearby stations found.', 'FuelPrices');
      return null;
    }

    const stationIds = this.nearbyStations.map(s => s.id).join(',');

    try {
      const response = await axios.get(`https://crdx.us/fuelstations/nearby/prices?stationIds=${stationIds}`);
      return response.data.stations;
    } catch (error) {
      this.homey.app.dError(`Error: ${error}`, 'FuelPrices');
      return null;
    }
  }

  async initializeStations() {
    const lat = this.homey.geolocation.getLatitude();
    const lon = this.homey.geolocation.getLongitude();
    const rangeKm = this.settings.distance;

    try {
      const response = await axios.get(`https://crdx.us/fuelstations/nearby?lat=${lat}&lon=${lon}&range=${rangeKm}`);
      const nearbyStations = response.data.stations;

      this.nearbyStations = nearbyStations.map(station => ({
        id: station.id,
        name: station.name,
        brand: station.brand
      }));

      return true;
    } catch (error) {
      this.homey.app.dError(`Error: ${error}`, 'FuelPrices');
      return false;
    }
  }

  async updateTimeAgo() {
    if (this.hasCapability('sensor_fuelprices_lastUpdate')) {
      if (this.latestPriceUpdate && this.latestPriceType) {
        const timeSinceUpdate = moment(this.latestPriceUpdate).fromNow();
        await this.setCapabilityValue('sensor_fuelprices_lastUpdate', `${timeSinceUpdate} (${this.latestPriceType})`);
      } else {
        await this.setCapabilityValue('sensor_fuelprices_lastUpdate', 'Ingen nye priser');
      }
    } else {
      this.homey.app.dError(`Capability sensor_fuelprices_lastUpdate is missing. Not updating.`, 'FuelPrices');
    }
    this.timeSinceInterval = this.homey.setInterval(async () => {
      if (this.hasCapability('sensor_fuelprices_lastUpdate')) {
        if (this.latestPriceUpdate && this.latestPriceType) {
          const timeSinceUpdate = moment(this.latestPriceUpdate).fromNow();
          await this.setCapabilityValue('sensor_fuelprices_lastUpdate', `${timeSinceUpdate} (${this.latestPriceType})`);
        } else {
          await this.setCapabilityValue('sensor_fuelprices_lastUpdate', 'Ingen nye priser');
        }
      } else {
        this.homey.app.dError(`Capability sensor_fuelprices_lastUpdate is missing. Not updating.`, 'FuelPrices');
      }
    }, 60 * 1000);
  }

  async extractBrand(fullStationName) {
    const knownBrands = [
      "Circle K",
      "Circle K Automat",
      "Best",
      "Shell",
      "Shell Express",
      "Esso",
      "Esso Express",
      "YX",
      "YX 7-Eleven",
      "Uno X",
      "1-2-3",
      "Driv",
      "St1",
      "Jæren Olje",
    ];

    // Sorterer merkene etter lengde, fra lengst til kortest
    const sortedBrands = knownBrands.sort((a, b) => b.length - a.length);

    for (const brand of sortedBrands) {
      if (fullStationName && fullStationName.length > 0) {
        if (fullStationName.includes(brand)) {
          return brand.replace(/[\s-]/g, '').toLowerCase();
        }
      } else {
        this.homey.app.dError(`No station name found for ${this.getName()}`, 'FuelPrices');
        return 'Ukjent';
      }
    }
    return null;
  }

  async onAdded() {
    this.homey.app.dDebug(`${this.getName()} has been added`, 'FuelPrices');
    if (this.hasCapability('sensor_fuelprices_stationName')) {
      await this.setCapabilityValue('sensor_fuelprices_stationName', this.getName());
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (this.getData().id.includes('closestCheapGasStation')) {
      if (changedKeys.some(key => key.endsWith('Discount'))) {
        this.settings = newSettings;
        this.homey.app.dDebug(`Discounts were changed for ${this.getName()}. Updating prices.`, 'FuelPrices');
        await this.getClosestCheapGasStation();
      }
    } else {
      if (changedKeys.some(key => key.endsWith('Discount'))) {
        this.settings = newSettings;
        this.homey.app.dDebug(`Discounts were changed for ${this.getName()}. Updating prices.`, 'FuelPrices');
        await this.getPrices();
      }
    }
    this.homey.app.dDebug(`${this.getName()} settings were changed`, 'FuelPrices');
  }

  async onRenamed(name) {
    this.homey.app.dDebug(`${this.getName()} was renamed to ${name}`, 'FuelPrices');
  }

  async onDeleted() {
    this.homey.clearInterval(this.interval);
    this.homey.clearInterval(this.timeSinceInterval);

    this.homey.app.dDebug(`${this.getName()} has been deleted`, 'FuelPrices');
  }
}

module.exports = FuelPrices;
