'use strict';

const { Device } = require('homey');
const axios = require('axios');

class PostenTracking extends Device {

  async onInit() {
    clearInterval(this.interval);
    this.trackingNumber = await this.getSetting('trackingNumber');
    this.ready();
    this.homey.app.dDebug(this.getName() + ' has been initialized', 'PostenTracking');
  }

  async onAdded() {
    this.ready();
    this.homey.app.dDebug(this.getName() + ' has been added', 'PostenTracking');
  }

  async ready() {
    if (!this.hasCapability('sensor_tracking')) {
      await this.addCapability('sensor_tracking');
    }
    await this.getPackageTrackingInfo(this.trackingNumber);
    await this.triggerFlow();
    const pollInterval = 60 * 1000;
    //this.interval = setInterval(() => this.getPackageTrackingInfo(this.trackingNumber), pollInterval);
    this.interval = this.homey.setInterval(async () => {
      await this.getPackageTrackingInfo(this.trackingNumber);
      await this.triggerFlow();
    }, pollInterval);
  }

  async getPackageTrackingInfo(trackingNumber) {
    try {
      const response = await axios.get(`https://sporing.posten.no/tracking/api/fetch?query=${trackingNumber}&lang=no`);
      const consignmentSet = response?.data?.consignmentSet;
      if (!consignmentSet || !consignmentSet.length) {
        this.homey.app.dError("Invalid response from tracking API", 'PostenTracking');
        return null;
      }
      const events = consignmentSet[0].packageSet[0].eventSet;
      const packageInfo = consignmentSet[0].packageSet[0];
      const formattedEvents = events.map(event => {
        const date = new Date(event.dateIso);
        const weekday = date.toLocaleString('no', { weekday: 'long' });
        const day = date.getDate();
        const month = date.toLocaleString('no', { month: 'long' });
        const year = date.toLocaleString('no', { year: 'numeric' });
        const time = date.toLocaleString('no', { timeStyle: 'short' });
        const datetimestring = `${weekday} ${day}. ${month} ${year} - ${time}`;
        const description = event.description.replace(/(<([^>]+)>)/gi, "");
        const senderName = consignmentSet[0].senderName;

        return { datetimestring, description, senderName }
      });
      await this.setCapabilityValue('sensor_tracking', formattedEvents[0].description);
      await this.setCapabilityValue('sensor_tracking_sender', packageInfo.senderName);

      //await this.triggerFlow();

      return formattedEvents;
    } catch (error) {
      this.homey.app.dError(error.message, 'PostenTracking');
      return null;
    }
  }

  async triggerFlow() {
    //Trigger flow action kort hvis pakkestatus er endret fra forrige sjekk
    const events = await this.getPackageTrackingInfo(this.trackingNumber);
    if (!events) return;
    const lastEvent = events[0];
    const lastEventDescription = lastEvent.description;
    const lastEventDate = lastEvent.datetimestring;
    const lastEventKey = lastEventDate + lastEventDescription;
    const lastEventKeyOld = await this.getStoreValue('lastEventKey');
    const senderName = lastEvent.senderName;

    const tokens = {
      trackingSender: senderName,
      trackingNumber: this.trackingNumber,
      trackingEvent: lastEventDescription,
      trackingDate: lastEventDate
    };

    const state = {};

    if (lastEventKey !== lastEventKeyOld) {
      await this.setStoreValue('lastEventKey', lastEventKey);
      this.homey.app.dDebug('Triggering flow for ' + this.getName() + '.', 'PostenTracking');
      await this.driver.triggerFlow(this, tokens, state);
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.trackingNumber = newSettings.trackingNumber;
    await this.getPackageTrackingInfo(newSettings.trackingNumber);
    await this.onInit();
    this.homey.setTimeout(async () => await this.onInit(), 1000);
    this.homey.app.dDebug(this.getName() + ' settings where changed', 'PostenTracking');
  }

  async onRenamed(name) {
    this.homey.app.dDebug(this.getName() + ' was renamed to ' + name, 'PostenTracking');
  }

  async onDeleted() {
    this.homey.clearInterval(this.interval);

    this.homey.app.dDebug(this.getName() + ' has been deleted', 'PostenTracking');
  }

}

module.exports = PostenTracking;
