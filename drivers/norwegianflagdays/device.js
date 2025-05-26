'use strict';

const { Device } = require('homey');
const axios = require('axios');
const cheerio = require('cheerio');
const Holidays = require('date-holidays');

class NorwegianFlagdays extends Device {
    async onInit() {
        this.homey.app.dDebug(`${this.getName()} is initializing`, 'NorwegianFlagdays');
        const language = this.homey.i18n.getLanguage();
        this.hd = new Holidays('NO', '', '', {
            languages: language === 'no' ? 'no' : 'en',
        });
        this.homey.app.dDebug(`${this.getName()} has language ${language}`, 'NorwegianFlagdays');

        if (!this.hasCapability('sensor_flagg')) {
            await this.addCapability('sensor_flagg');
            this.homey.app.dInfo(`${this.getName()} added capability sensor_flagg`, 'NorwegianFlagdays');
        } else if (!this.hasCapability('meter_flagg_sensor')) {
            await this.addCapability('meter_flagg_sensor');
            this.homey.app.dInfo(`${this.getName()} added capability meter_flagg_sensor`, 'NorwegianFlagdays');
        } else if (!this.hasCapability('sensor_flagg_type')) {
            await this.addCapability('sensor_flagg_type');
            this.homey.app.dInfo(`${this.getName()} added capability sensor_flagg_type`, 'NorwegianFlagdays');
        }

        await this.manageTokens();
        this.homey.app.dInfo(`${this.getName()} has been initialized`, 'NorwegianFlagdays');
    }


    async ready() {
        const flagDays = await this.getFlagDays();
        await this.getNextFlagDay(flagDays);
        this.interval = this.homey.setInterval(async () => {
            await this.getNextFlagDay(flagDays);
        }, 1 * 60 * 60 * 1000);
    }

    async onAdded() {
        this.homey.app.dInfo(`${this.getName()} has been added`, 'NorwegianFlagdays');
    }

    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.homey.setTimeout(async () => {
            if (changedKeys.includes('dayTypeFlagDay') || changedKeys.includes('dayTypeHoliday') || changedKeys.includes('dayTypeAnniversary') || changedKeys.includes('dayTypeOther')) {
                const flagDays = await this.getFlagDays();
                await this.getNextFlagDay(flagDays);
                await this.manageTokens();
            }
        }, 1000);
        this.homey.app.dInfo(`${this.getName()} settings were changed`, 'NorwegianFlagdays');
    }

    async onRenamed(name) {
        this.homey.app.dInfo(`${this.getName()} has been renamed to ${name}`, 'NorwegianFlagdays');
    }

    async onDeleted() {
        this.homey.clearInterval(this.interval);

        for (const FlowToken of this._flagTokens) {
            await this.deleteToken(FlowToken);
            await this.unsetStoreValue('flagTokens');
        }
        for (const FlowToken of this.nextFlagDayToken) {
            await this.deleteToken(FlowToken);
            await this.unsetStoreValue('nextFlagDayToken');
        }

        this.homey.app.dInfo(`${this.getName()} has been deleted`, 'NorwegianFlagdays');
    }

    async manageTokens() {
        this._flagTokens = [await this.getStoreValue('flagTokens')] || [];
        this._store = await this.getStore();
        if (!this._flagTokens.length > 0 || this._flagTokens[0] === null) {
            await this.setTokens();
        } else {
            for (const FlowToken of this._flagTokens) {
                await this.deleteToken(FlowToken);
                await this.unsetStoreValue('flagTokens');
            }
            await this.setTokens();
        }
        this._nextFlagDayToken = [await this.getStoreValue('nextFlagDayToken')] || [];
        if (!this._nextFlagDayToken.length > 0 || this._nextFlagDayToken[0] === null) {
            await this.setNextFlagDayToken();
        } else {
            for (const FlowToken of this._nextFlagDayToken) {
                await this.deleteToken(FlowToken);
                await this.unsetStoreValue('nextFlagDayToken');
            }
            await this.setNextFlagDayToken();
        }
    }

    async getFilterSettings() {
        const filterSettings = await this.getSettings();
        const activeFilters = [];
        for (const key in filterSettings) {
            if (key.includes('dayType') && filterSettings[key] === true) {
                activeFilters.push(key.replace('dayType', '').toLowerCase());
            }
        }
        return activeFilters;
    }

    async getFlagDays() {
        try {
            const activeFilters = await this.getFilterSettings();
            const holidays = this.hd.getHolidays(new Date().getFullYear());

            const flagDays = [];
            const flagDaysStore = [];

            holidays.forEach(holiday => {
                const date = holiday.date;
                const duration = {
                    start: holiday.start,
                    end: holiday.end,
                };
                const name = holiday.name;
                const type = holiday.type;
                let typeFormatted = holiday.type.toLowerCase();
                let details;
                switch (typeFormatted) {
                    case 'public':
                        typeFormatted = 'flagday';
                        details = this.homey.__({ en: 'Flag day', no: 'Flaggdag' });
                        break;
                    case 'bank':
                        typeFormatted = 'holiday';
                        details = this.homey.__({ en: 'Holiday', no: 'Ferie' });
                        break;
                    case 'observance':
                        typeFormatted = 'anniversary';
                        details = this.homey.__({ en: 'Anniversary', no: 'Merkedag' });
                        break;
                    default:
                        typeFormatted = 'other';
                        details = this.homey.__({ en: 'Other', no: 'Annen' });
                }
                const convertedDate = new Date(date);

                if (activeFilters.includes(typeFormatted)) {
                    if (!isNaN(convertedDate.getTime())) {
                        flagDays.push({ date: convertedDate, name, type, typeFormatted, details, duration });
                    }
                }
                if (!isNaN(convertedDate.getTime())) {
                    flagDaysStore.push({ date: convertedDate, name, type, typeFormatted, details, duration });
                }
            });

            await this.setStoreValue('flagDays', flagDaysStore).catch(this.error);

            this.homey.app.dInfo(`${this.getName()} has been updated`, 'NorwegianFlagdays');
            return flagDays;
        } catch (error) {
            this.homey.app.dError('Error fetching flag days', 'NorwegianFlagdays', { error: error?.response?.data || error?.message });
        }
    }

    async getFlagDaysss() {
        try {
            const activeFilters = await this.getFilterSettings();
            const currentYear = new Date().getFullYear();
            const response = await axios.get('https://www.timeanddate.no/merkedag/norge/' + currentYear);
            const $ = cheerio.load(response.data);

            const flagDaysTable = $('table').first();
            const rows = flagDaysTable.find('tbody tr');

            const flagDays = [];
            const flagDaysStore = [];

            rows.each((index, row) => {
                const columns = $(row).find('td, th');

                if (index === 0 || columns.length < 2) {
                    return;
                }

                const date = $(columns[0]).text().trim();
                const name = $(columns[2]).text().trim();
                const type = $(columns[3]).text().trim();
                let typeFormatted = $(columns[3]).text().trim().toLowerCase();
                let details = $(columns[4]).text().trim();

                switch (typeFormatted) {
                    case 'flaggdag':
                        typeFormatted = 'flagday';
                        break;
                    case 'helligdag':
                        typeFormatted = 'holiday';
                        break;
                    case 'merkedag':
                    case 'merkedag (mange banker stengt)':
                        typeFormatted = 'anniversary';
                        break;
                    case 'jevndøgn / solverv':
                    case 'overgang til / fra sommertid':
                        typeFormatted = 'other';
                        break;
                    default:
                        typeFormatted = 'other';
                }

                // Sjekk om det finnes et bilde i den siste kolonnen
                if ($(columns[4]).find('img').length > 0) {
                    details = 'flaggdag';
                }

                const day = date.split('.')[0].trim();
                const month = date.split('.')[1].trim();

                const monthNames = {
                    jan: 'January',
                    feb: 'February',
                    mar: 'March',
                    apr: 'April',
                    mai: 'May',
                    jun: 'June',
                    jul: 'July',
                    aug: 'August',
                    sep: 'September',
                    okt: 'October',
                    nov: 'November',
                    des: 'December',
                };

                const fullYear = new Date().getFullYear();
                const yearAddedDate = `${day} ${monthNames[month]} ${fullYear}`;
                const convertedDate = new Date(yearAddedDate);

                if (activeFilters.includes(typeFormatted)) {
                    if (!isNaN(convertedDate.getTime())) {
                        flagDays.push({ date: convertedDate, name, type, typeFormatted, details });
                    }
                }
                if (!isNaN(convertedDate.getTime())) {
                    flagDaysStore.push({ date: convertedDate, name, type, typeFormatted, details });
                }
            });

            await this.setStoreValue('flagDays', flagDaysStore).catch(this.error);

            this.homey.app.dDebug(`${this.getName()} has been updated`, 'NorwegianFlagdays');

            return flagDays;
        } catch (error) {
            this.homey.app.dError('Error fetching flag days', 'NorwegianFlagdays', { error: error?.response?.data || error?.message });
        }
    }

    async setTokens() {
        try {
            const flagDays = await this.getFlagDays();
            for (const flagDay of flagDays) {
                const flagDaydate = flagDay.date.toLocaleDateString("nb-NO", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                if (!this._flagToken) {
                    this._flagToken = await this.homey.flow.createToken(`flagg_${flagDay.name}`, {
                        type: 'string',
                        title: flagDaydate,
                    });
                }
                await this._flagToken.setValue(`${flagDay.name}`);
                const tokenData = {
                    id: this._flagToken.id,
                    name: flagDay.name,
                    value: flagDaydate,
                }
                this._flagTokens.push(this._flagToken);
            }
            //this.homey.app.dDebug(this._flagTokens);
            await this.setStoreValue('flagTokens', this._flagTokens.id).catch(this.error);
            return true;
        } catch (error) {
            this.homey.app.dError('Error fetching flag days', 'NorwegianFlagdays', { error: error?.response?.data || error?.message });
        }
    }

    async setNextFlagDayToken() {
        try {
            const flagDays = await this.getFlagDays();
            let nextFlagDay = await this.getNextFlagDay(flagDays);
            nextFlagDay = flagDays.find((flagDay) =>
                flagDay.typeFormatted === 'flagday' &&
                flagDay.date.toISOString().split('T')[0] >= new Date().toISOString().split('T')[0]
            );
            if (!nextFlagDay) return false;
            this.homey.app.dDebug(`Neste flaggdag er ${nextFlagDay.name}, ${nextFlagDay.date.toLocaleDateString('nb-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, 'NorwegianFlagdays');

            this.nextFlagDayToken = await this.homey.flow.createToken(`nextFlagDayToken`, {
                type: 'string',
                title: 'Neste flaggdag',
            });

            await this.nextFlagDayToken.setValue(`${nextFlagDay.name}`);

            this._nextFlagDayToken.push(this.nextFlagDayToken);

            await this.setStoreValue('nextFlagDayToken', this._nextFlagDayToken.id).catch(this.error);
            return true;
        } catch (error) {
            this.homey.app.dError('Error fetching flag days', 'NorwegianFlagdays', error);
        }
    }

    async deleteToken(tokenId) {
        //this.homey.app.dDebug(tokenId);
        this.homey.app.dDebug('Unregistering tokens', 'NorwegianFlagdays');
        if (!tokenId) {
            return;
        } else {
            await this.homey.flow.unregisterToken(tokenId);
            this.homey.app.dDebug(`Token ${tokenId.id} has been deleted`, 'NorwegianFlagdays');
            return true;
        }
    }

    async getNextFlagDay(flagDays) {
        if (!flagDays) return false;

        const currentDate = new Date().toISOString().split('T')[0];
        const nextFlagDay = flagDays.find((flagDay) => flagDay.date.toISOString().split('T')[0] >= currentDate);

        if (nextFlagDay) {
            //this.homey.app.dDebug(`Neste flaggdag er ${nextFlagDay.name} den ${nextFlagDay.date.toLocaleDateString()}`);
            await this.setCapabilityValue('sensor_flagg', nextFlagDay.name);
            await this.setCapabilityOptions('sensor_flagg', {
                title: {
                    "no":
                        nextFlagDay.date.toLocaleDateString("nb-NO", {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                        }),
                    "en":
                        nextFlagDay.date.toLocaleDateString("en-GB", {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                        })
                }
            });

            const diffDays = Math.ceil((nextFlagDay.date.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
            const type = nextFlagDay?.details;
            await this.setCapabilityValue('meter_flagg_sensor', diffDays);
            await this.setCapabilityValue('sensor_flagg_type', type);

            return nextFlagDay;
        } else {
            this.homey.app.dDebug('Ingen flaggdager i nær fremtid', 'NorwegianFlagdays');
            return false;
        }
    }

    async getNextFlagDayInfo(flagDays) {
        if (!flagDays) return false;

        const currentDate = new Date().toISOString().split('T')[0];
        const nextFlagDay = flagDays.find((flagDay) => flagDay.date.toISOString().split('T')[0] >= currentDate);
        if (nextFlagDay) {
            return nextFlagDay;
        } else {
            return false;
        }
    }
}

module.exports = NorwegianFlagdays;