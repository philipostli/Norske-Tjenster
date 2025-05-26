'use strict';

const { Driver } = require('homey');
const axios = require('axios');

class PostenTracking extends Driver {

  async onInit() {
    this._newTrackingInfo = this.homey.flow.getDeviceTriggerCard('newShipmentEvent');
    this.homey.app.dDebug('Posten Sporing has been initialized', 'PostenTracking');
  }

  triggerFlow(device, tokens, state) {
    this._newTrackingInfo
      .trigger(device, tokens, state)
      .catch(this.error);
  }

  async onPair(session) {
    session.trackingNumber = ""; // Lagre trackingNumber som en egenskap på session-objektet
    session.lanugage = this.homey.i18n.getLanguage();

    session.setHandler("checkTracking", async (data) => {
      session.trackingNumber = data.trackingNumber; // Lagre trackingNumber som en egenskap på session-objektet
      return await this.checkTracking(data.trackingNumber);
    });

    session.setHandler("list_devices", async () => {
      return await this.onPairListDevices(session);
    });
  }

  async onPairListDevices(session) {
    let devices = [];

    let deviceName = `Sporing ${session.trackingNumber}`; // Bruk session.trackingNumber
    let deviceId = session.trackingNumber; // Bruk session.trackingNumber
    let device = {
      name: deviceName,
      data: {
        id: deviceId
      },
      settings: {
        trackingNumber: session.trackingNumber,
      }
    };
    devices.push(device);
    console.log(device);
    return devices;
  }

  async checkTracking(trackingNumber) {
    this.homey.app.dDebug(`Sporingsnummer: ${trackingNumber}`, 'PostenTracking');

    try {
      const response = await axios.get(`https://sporing.posten.no/tracking/api/fetch?query=${trackingNumber}&lang=no`);
      console.log(response.status);
      const consignmentSet = response?.data?.consignmentSet;
      if (response.status !== 200 || response.status === 400) {
        this.homey.app.dError(`Fant ingen sporingsinformasjon for sporingsnummer: ${trackingNumber}. Feilmelding: ${response.data.errorCode}`, 'PostenTracking');
        throw new Error(response.data.errorCode);
      } else {
        this.homey.app.dDebug(`Sporingsinformasjon for sporingsnummer: ${trackingNumber} OK`, 'PostenTracking');
        return true;
      }
    } catch (error) {
      this.homey.app.dError(`Fant ingen sporingsinformasjon for sporingsnummer: ${trackingNumber}. Feilmelding: ${error.message}`, 'PostenTracking');
      return false;
    }
  }
}

module.exports = PostenTracking;
