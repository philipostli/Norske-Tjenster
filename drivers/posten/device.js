'use strict';

const { Device } = require('homey');
const axios = require('axios');

class Posten extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.homey.app.dDebug('[Device] Posten initialization started', 'Posten');
    
    try {
      // Initialize the device
      await this.ready();
      this.homey.app.dDebug('[Device] Posten initialization completed', 'Posten');
    } catch (error) {
      this.homey.app.dError(`[Device] Error during initialization: ${error.message}`, 'Posten');
      throw error; // Propagate the error to show it in the device overview
    }
  }

  async ready() {
    try {
      this.homey.app.dDebug('[Device] Setting up polling interval', 'Posten');
      
      // Clear any existing interval
      if (this.interval) {
        this.homey.clearInterval(this.interval);
        this.interval = null;
      }
      
      // Set up the polling interval
      const pollInterval = this.getSetting('pollInterval')*1000;
      this.interval = this.homey.setInterval(async () => {
        try {
          await this.updateDevice();
        } catch (error) {
          this.homey.app.dError('[Device] Error in update interval: ' + error.message, 'Posten');
        }
      }, pollInterval);
      
      this.homey.app.dDebug('[Device] Posten is ready', 'Posten');
      
      // Perform initial update
      await this.updateDevice();
    } catch (error) {
      this.homey.app.dError('[Device] Error in ready: ' + error.message, 'Posten');
      throw error; // Propagate the error
    }
  }

  async updateDevice(postnr = this.getSetting('postnr')) {
    try {
      // Check if device still exists
      if (!this.getData() || !this.getData().id) {
        this.homey.app.dDebug('Device no longer exists, stopping updates', 'Posten');
        if (this.interval) {
          this.homey.clearInterval(this.interval);
          this.interval = null;
        }
        return;
      }

      this.homey.app.dDebug(`Fetching data for postal code: ${postnr}`, 'Posten');
      
      // Make a direct request to the new API endpoint
      const response = await axios.get(`https://www.posten.no/levering-av-post/_/service/no.posten.website/delivery-days`, {
        params: {
          postalCode: postnr
        },
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      this.homey.app.dDebug('API response received', 'Posten');
      const data = response.data;
      
      if (!data || !data.delivery_dates) {
        this.homey.app.dError('Invalid response format from API', 'Posten');
        if (this.hasCapability('posten_sensor')) {
          await this.setCapabilityValue('posten_sensor', 'Ugyldig API respons');
        }
        if (this.hasCapability('meter_posten_sensor')) {
          await this.setCapabilityValue('meter_posten_sensor', 0);
        }
        return false;
      }
      
      const deliveryDates = data.delivery_dates;
      const nextDeliveryDate = deliveryDates[0];
      
      if (nextDeliveryDate) {
        const responseDate = new Date(nextDeliveryDate).setHours(0, 0, 0, 0);
        const today = new Date().setHours(0, 0, 0, 0);
        const diffTime = Math.abs(responseDate - today);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
          if (this.hasCapability('posten_sensor')) {
            await this.setCapabilityValue('posten_sensor', 'I dag');
          }
          if (this.hasCapability('meter_posten_sensor')) {
            await this.setCapabilityValue('meter_posten_sensor', 0);
            await this.setCapabilityOptions('meter_posten_sensor', { units: { no: "dager", en: "days" } });
          }
          return true;
        } else if (diffDays === 1) {
          if (this.hasCapability('posten_sensor')) {
            await this.setCapabilityValue('posten_sensor', 'I morgen');
          }
          if (this.hasCapability('meter_posten_sensor')) {
            await this.setCapabilityValue('meter_posten_sensor', 1);
            await this.setCapabilityOptions('meter_posten_sensor', { units: { no: "dag", en: "day" } });
          }
          return false;
        } else {
          const formatter = new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
          const formattedDate = formatter.format(responseDate);
          if (this.hasCapability('posten_sensor')) {
            await this.setCapabilityValue('posten_sensor', formattedDate);
          }
          if (this.hasCapability('meter_posten_sensor')) {
            await this.setCapabilityValue('meter_posten_sensor', diffDays);
            await this.setCapabilityOptions('meter_posten_sensor', { units: { no: "dager", en: "days" } });
          }
          return false;
        }
      } else {
        if (this.hasCapability('posten_sensor')) {
          await this.setCapabilityValue('posten_sensor', 'Ingen data tilgjengelig');
        }
        if (this.hasCapability('meter_posten_sensor')) {
          await this.setCapabilityValue('meter_posten_sensor', 0);
          await this.setCapabilityOptions('meter_posten_sensor', { units: { no: "dager", en: "days" } });
        }
        return false;
      }
    } catch (error) {
      this.homey.app.dError('Error fetching delivery dates: ' + error.message, 'Posten');
      if (error.response) {
        this.homey.app.dError('API response status: ' + error.response.status, 'Posten');
        this.homey.app.dError('API response data: ' + JSON.stringify(error.response.data), 'Posten');
      }
      
      // Check if device still exists before trying to update capabilities
      if (this.getData() && this.getData().id) {
        if (this.hasCapability('posten_sensor')) {
          await this.setCapabilityValue('posten_sensor', 'Kunne ikke hente data');
        }
        if (this.hasCapability('meter_posten_sensor')) {
          await this.setCapabilityValue('meter_posten_sensor', 0);
        }
      }
      return false;
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.homey.app.dDebug('New Posten device added', 'Posten');
    
    try {
      // Log device information for debugging
      const deviceData = this.getData();
      const settings = this.getSettings();
      this.homey.app.dDebug(`[Device] Device data: ${JSON.stringify(deviceData)}`, 'Posten');
      this.homey.app.dDebug(`[Device] Device settings: ${JSON.stringify(settings)}`, 'Posten');
      
      // Ensure device is ready and perform initial update
      await this.ready();
      this.homey.app.dDebug('[Device] Initial setup completed for new device', 'Posten');
    } catch (error) {
      this.homey.app.dError(`[Device] Error during device setup: ${error.message}`, 'Posten');
      throw error; // Propagate the error to show it in the device overview
    }
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.homey.app.dDebug('Posten settings were changed', 'Posten');
    if (changedKeys.includes('postnr')) {
      this.updateDevice(newSettings.postnr);
    }
    if (changedKeys.includes('pollInterval')) {
      clearInterval(this.interval);
      const pollInterval = newSettings.pollInterval*1000;
      this.interval = this.homey.setInterval(async () => {
        await this.updateDevice();
      }, pollInterval);
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.homey.app.dDebug('Posten was renamed', 'Posten');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.homey.clearInterval(this.interval);
    
    this.homey.app.dDebug('Posten has been deleted', 'Posten');
  }

}

module.exports = Posten;