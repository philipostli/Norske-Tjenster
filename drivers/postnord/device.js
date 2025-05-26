'use strict';

const { Device } = require('homey');
const axios = require('axios');

class PostNord extends Device {

  async onInit() {
    clearInterval(this.interval);
    this.trackingNumber = await this.getSetting('trackingNumber');
    this.ready();
    this.homey.app.dDebug(this.getName() + ' has been initialized', 'PostNord');
  }

  async onAdded() {
    this.ready();
    this.homey.app.dDebug(this.getName() + ' has been added', 'PostNord');
  }

  async ready() {
    await this.getPackageTrackingInfo(this.trackingNumber);
    await this.triggerFlow();
    const pollInterval = 60 * 1000;
    //this.interval = setInterval(() => this.getPackageTrackingInfo(this.trackingNumber), pollInterval);
    this.interval = this.homey.setInterval(async () => {
      await this.getPackageTrackingInfo(this.trackingNumber);
      await this.triggerFlow();
    }, pollInterval);

    await this.setCapabilityOptions('sensor_PostNord.sender', {
      title: {
        no: "Avsender",
        en: "Sender"
      }
    }).then(() => {
      //this.homey.app.dDebug('Capability options set to:', this.getCapabilityOptions('sensor_PostNord.sender'));
    }).catch((error) => {
      this.homey.app.dError(error, 'PostNord');
    });
  }

  async getPackageTrackingInfo(trackingNumber) {
    try {
      const headers = {
        'X-Bap-Key': 'web-ncp',
      };
      const response = await axios.get(`https://api2.postnord.com/rest/shipment/v5/trackandtrace/recipientview?id=${trackingNumber}&locale=no`, { headers });
      const packageInfo = response?.data?.TrackingInformationResponse?.shipments[0];

      if (!packageInfo) {
        this.homey.app.dError('No package info found', 'PostNord');
        return null;
      }

      const sender = packageInfo?.consignor?.name;
      const info = packageInfo?.statusText.body;

      await this.setCapabilityValue('sensor_PostNord.sender', sender);
      await this.setCapabilityValue('sensor_PostNord.info', info);

      return { sender, info }
    } catch (error) {
      console.error(error.message);
      return null;
    }
  }

  async triggerFlow() {
    //Trigger flow action kort hvis pakkestatus er endret fra forrige sjekk
    const events = await this.getPackageTrackingInfo(this.trackingNumber);
    if (!events) return;
    const lastEvent = events;
    const senderName = lastEvent.sender;
    const lastEventDescription = lastEvent.info;
    const lastEventKey = senderName + lastEventDescription;
    const lastEventKeyOld = await this.getStoreValue('lastEventKey');

    const tokens = {
      trackingSender: senderName,
      trackingNumber: this.trackingNumber,
      trackingEvent: lastEventDescription
    };

    const state = {};

    if (lastEventKey !== lastEventKeyOld) {
      await this.setStoreValue('lastEventKey', lastEventKey);
      this.homey.app.dDebug('Triggering flow for ' + this.getName() + '.', 'PostNord');
      await this.driver.triggerFlow(this, tokens, state);
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.trackingNumber = newSettings.trackingNumber;
    await this.getPackageTrackingInfo(newSettings.trackingNumber);
    await this.onInit();
    this.homey.setTimeout(async () => await this.onInit(), 1000);
    this.homey.app.dDebug(this.getName() + ' settings where changed', 'PostNord');
  }

  async onRenamed(name) {
    this.homey.app.dDebug(this.getName() + ' was renamed to ' + name, 'PostNord');
  }

  async onDeleted() {
    this.homey.clearInterval(this.interval);

    this.homey.app.dDebug(this.getName() + ' has been deleted', 'PostNord');
  }

}

module.exports = PostNord;
