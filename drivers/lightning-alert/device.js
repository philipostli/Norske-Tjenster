'use strict';

const { Device } = require('homey');
const { riskOfLightning } = require('../../lib/util');

class LightningAlert extends Device {
    async onInit() {
        this.homey.app.dDebug('LightningAlert has been initialized', 'LightningAlert');
        this.settings = await this.getSettings();
        this.lastAlertTimestamp = 0;
        this.location = `${this.homey.geolocation.getLatitude(), this.homey.geolocation.getLongitude()}`;

        this._lightningRegistererd = this.homey.flow.getDeviceTriggerCard('lightningRegistererd');

        await this.updateDevice();
        this.interval = this.homey.setInterval(() => this.updateDevice(), 60 * 1000);
    }

    async updateDevice() {
        const lightningData = await riskOfLightning(this.location, this.settings.dangerRadius);

        if (lightningData && lightningData.data && lightningData.data.timestamp > this.lastAlertTimestamp) {
            this.homey.app.dDebug(`[${lightningData.data.timestamp.toLocaleString('nb', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}] Danger of lightning! Lightning strike detected at ${lightningData.data.latitude}, ${lightningData.data.longitude} (${lightningData.data.city}). Approx. ${parseFloat(lightningData.data.distance / 1000).toFixed(1)} km away.`, 'LightningAlert');
            this.lastAlertTimestamp = lightningData.data.timestamp;

            await this.setCapabilityValue('alarm_lightning_warning', true);
            await this.setCapabilityValue('sensor_lightning_peakCurrent', lightningData.data.peakCurrent);
            await this.setCapabilityValue('sensor_lightning_distance', parseFloat(lightningData.data.distance / 1000).toFixed(1));
            await this.setCapabilityValue('sensor_lightning_location', lightningData.data.city);
            await this.setCapabilityValue('sensor_lightning_timestamp', lightningData.data.timestamp.toLocaleString('nb', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }));

            this._lightningRegistered.trigger(this, {
                timestamp: lightningData.data.timestamp,
                location: lightningData.data.city,
                coordinates: `${lightningData.data.latitude}, ${lightningData.data.longitude}`,
                peakCurrent: `${lightningData.data.peakCurrent} A`,
            }).catch((error) => this.homey.app.dError('Error while sending lightningRegistered:', 'LightningAlert', error));

            return true;
        } else {
            await this.setCapabilityValue('alarm_lightning_warning', false);
            this.homey.app.dDebug('No risk of lightning', 'LightningAlert');

            return false;
        }
    }

    async onAdded() {
        await this.setCapabilityValue('alarm_lightning_warning', true);
        await this.setCapabilityValue('sensor_lightning_peakCurrent', 0);
        await this.setCapabilityValue('sensor_lightning_distance', 0);
        await this.setCapabilityValue('sensor_lightning_location', 'Ingen lynnedslag');
        await this.setCapabilityValue('sensor_lightning_timestamp', 'Ingen lynnedslag');

        this.homey.app.dDebug('LightningAlert has been added', 'LightningAlert');
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.homey.app.dDebug('LightningAlert settings were changed', 'LightningAlert');
    }

    async onRenamed(name) {
        this.homey.app.dDebug('LightningAlert was renamed', 'LightningAlert');
    }

    async onDeleted() {
        this.homey.app.dDebug('LightningAlert has been deleted', 'LightningAlert');
    }

}

module.exports = LightningAlert;
