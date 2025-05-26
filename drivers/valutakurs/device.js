'use strict';

const { Device } = require('homey');
const axios = require('axios');

class ExchangeRates extends Device {

	async onInit() {
		this.homey.app.dDebug('ExchangeRates has been initialized', 'Valutakurs');

		this.settings = await this.getSettings();

		const currencyCapabilities = Object.entries(this.settings)
			.filter(([key, value]) => key.length === 3 && typeof value === 'boolean');

		this.capabilities = this.getCapabilities();

		for (const [currency, isEnabled] of currencyCapabilities) {
			const capabilityName = `meter_exchangerates_${currency.toLowerCase()}`;
			if (isEnabled) {
				if (!this.hasCapability(capabilityName)) {
					await this.addCapability(capabilityName);
				}
			} else {
				if (this.hasCapability(capabilityName)) {
					await this.removeCapability(capabilityName);
				}
			}
		}

		this.currencyCodes = currencyCapabilities.map(([currency, _]) => currency).join('+');

		await this.updateDevice();
		this.interval = this.homey.setInterval(async () => {
			await this.updateDevice();
		}, 6 * 60 * 60 * 1000);
	}

	async updateDevice() {
		this.homey.app.dDebug('Updating exchange rates', 'Valutakurs');

		const currencyRates = await this.updateExchangeRates();
		if (currencyRates) {
			for (const currency in currencyRates) {
				if (this.hasCapability(`meter_exchangerates_${currency.toLowerCase()}`)) {
					this.homey.app.dDebug(`Updating ${currency} to ${currencyRates[currency]}`, 'Valutakurs');
					await this.setCapabilityValue(`meter_exchangerates_${currency.toLowerCase()}`, currencyRates[currency]);
				}
			}
		}
	}

	async updateExchangeRates() {
		try {
			const response = await axios.get(`https://data.norges-bank.no/api/data/EXR/B.USD+${this.currencyCodes.toUpperCase()}.NOK.SP?format=sdmx-json&lastNObservations=1&locale=no`);
			const data = response.data;
			const series = data.data.dataSets[0].series;
			const baseCurrencies = data.data.structure.dimensions.series[1].values;

			const currencyRates = {};

			baseCurrencies.forEach((currency, index) => {
				const key = `0:${index}:0:0`;
				if (series[key]) {
					currencyRates[currency.id] = parseFloat(series[key].observations['0'][0]);
				}
			});

			return currencyRates;
		} catch (error) {
			console.error('Failed to fetch currency rates:', error);
			return null;
		}
	}

	async onAdded() {
		this.homey.app.dDebug('ExchangeRates has been added', 'Valutakurs');
	}

	async onSettings({ oldSettings, newSettings, changedKeys }) {
		this.homey.app.dDebug('ExchangeRates settings where changed', 'Valutakurs');

		const currencyCapabilities = Object.entries(newSettings)
			.filter(([key, value]) => key.length === 3 && typeof value === 'boolean');

		for (const [currency, isEnabled] of currencyCapabilities) {
			const capabilityName = `meter_exchangerates_${currency.toLowerCase()}`;
			if (isEnabled) {
				if (!this.hasCapability(capabilityName)) {
					await this.addCapability(capabilityName);
				}
			} else {
				if (this.hasCapability(capabilityName)) {
					await this.removeCapability(capabilityName);
				}
			}
		}

		this.currencyCodes = currencyCapabilities.map(([currency, _]) => currency).join('+');
		return await this.updateDevice();
	}

	async onRenamed(name) {
		this.homey.app.dDebug('ExchangeRates was renamed', 'Valutakurs');
	}

	async onDeleted() {
		this.homey.clearInterval(this.interval);

		this.homey.app.dDebug('ExchangeRates has been deleted', 'Valutakurs');
	}

}

module.exports = ExchangeRates;
