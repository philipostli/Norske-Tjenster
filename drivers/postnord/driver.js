'use strict';

const { Driver } = require('homey');
const axios = require('axios');

class PostNord extends Driver {

  async onInit() {
    this._newTrackingInfo = this.homey.flow.getDeviceTriggerCard('newPostNordInfo');
    this.homey.app.dDebug('PostNord has been initialized', 'PostNord');
  }

  triggerFlow(device, tokens, state) {
    this._newTrackingInfo
      .trigger(device, tokens, state)
      .catch(this.error);
  }

  async onPair(session) {
    session.trackingNumber = ""; // Lagre trackingNumber som en egenskap på session-objektet

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

    let deviceName = `PostNord Sporing ${session.trackingNumber}`; // Bruk session.trackingNumber
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
    this.homey.app.dDebug(device, 'PostNord');
    return devices;
  }

  async checkTracking(trackingNumber) {
    this.homey.app.dDebug(`Sporingsnummer: ${trackingNumber}`, 'PostNord');

    try {
      const headers = {
        'X-Bap-Key': 'web-ncp',
      };
      const response = await axios.get(`https://api2.postnord.com/rest/shipment/v5/trackandtrace/recipientview?id=${trackingNumber}&locale=no`, { headers });
      //this.homey.app.dDebug(response.status);
      const consignmentSet = response?.data?.TrackingInformationResponse?.shipments[0];
      if (response.status !== 200 || response.status === 400) {
        throw new Error(response.status);
      } else {
        if (!consignmentSet) {
          this.homey.app.dError(`Fant ingen sporingsinformasjon for sporingsnummer: ${trackingNumber}. Feilmelding: ${response.data.errorCode}`, 'PostNord');
          return false;
        }
        this.homey.app.dDebug(`Sporingsinformasjon for sporingsnummer: ${trackingNumber} OK`, 'PostNord');
        return true;
      }
    } catch (error) {
      this.homey.app.dError(`Fant ingen sporingsinformasjon for sporingsnummer: ${trackingNumber}. Feilmelding: ${error.message}`, 'PostNord');
      return false;
    }
  }
}

module.exports = PostNord;
