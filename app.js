'use strict';

const Homey = require('homey');
const { Log } = require('homey-log');

class App extends Homey.App {

    async onInit() {
        this.homeyLog = new Log({ homey: this.homey });
        this.userLanguage = this.homey.i18n.getLanguage();

        await this.initFlows();

        this.homey.settings.unset('debugLog');

        this.dDebug('Norweigan Public Services has been initialized');

        if (Homey.env.DEBUG === true) {
        }
    }

    async testConnection() {
        return true;
    }

    async initFlows() {
        this.dDebug('Initializing flows...');

        this.wastePickupTomorrow = this.homey.flow.getDeviceTriggerCard('wastePickupTomorrow');

        const isWaste = this.homey.flow.getConditionCard('isWaste');
        isWaste.registerRunListener(async (args, state) => {
            const wasteDaysLeft = await args.device.getCapabilityValue('measure_next_waste_days_left');
            if (args.when === "wasteToday") {
                if (wasteDaysLeft === 0) {
                    return true;
                }
            } else if (args.when === "wasteTomorrow") {
                if (wasteDaysLeft === 1) {
                    return true;
                }
            }
            return false;
        });

        const isWaste_v2 = this.homey.flow.getConditionCard('isWaste_v2');
        isWaste_v2.registerRunListener(async (args, state) => {
            //const wasteDaysLeft = await args.device.getCapabilityValue('measure_next_waste_days_left');
            const nextWastePickups = await args.device.getStoreValue(`nextWastePickups`);
            const pickupToken = this.homey.flow.getToken(`nextWasteTypes-${args.device.deviceID}_v2`);

            //this.dDebug('Checking wasteDaysLeft: ' + wasteDaysLeft);
            this.dDebug(`Next pickups in days: ${JSON.stringify(nextWastePickups.map(pickup => pickup.diffDays))}`);

            // Sjekk for henting i dag
            if (args.when === "wasteToday") {
                const wasteTypesString = await this.getMatchingWasteTypes(nextWastePickups, 0);
                if (wasteTypesString !== false) {
                    await pickupToken.setValue(wasteTypesString);
                }
                return nextWastePickups.some(pickup => pickup.diffDays === 0);
            }

            // Sjekk for henting i morgen
            else if (args.when === "wasteTomorrow") {
                const wasteTypesString = await this.getMatchingWasteTypes(nextWastePickups, 1);
                if (wasteTypesString !== false) {
                    await pickupToken.setValue(wasteTypesString);
                }
                return nextWastePickups.some(pickup => pickup.diffDays === 1);
            }

            return false;
        });

        const isPost = this.homey.flow.getConditionCard('isPost');
        isPost.registerRunListener(async (args, state) => {
            const postDaysLeft = await args.device.getCapabilityValue('meter_posten_sensor');
            if (args.when === "postToday") {
                if (postDaysLeft === 0) {
                    return true;
                }
            } else if (args.when === "postTomorrow") {
                if (postDaysLeft === 1) {
                    return true;
                }
            }
            return false;
        });

        const isFlagday = this.homey.flow.getConditionCard('isFlagday');
        isFlagday.registerRunListener(async (args, state) => {
            const flagDayCount = await args.device.getCapabilityValue('meter_flagg_sensor');
            const flagDays = await args.device.getFlagDays();
            const nextFlagDay = await args.device.getNextFlagDayInfo(flagDays);
            const dayType = nextFlagDay.details;

            if (dayType !== "flaggdag") {
                return false;
            }
            if (args.when === "today") {
                if (flagDayCount === 0) {
                    return true;
                }
            } else if (args.when === "tomorrow") {
                if (flagDayCount === 1) {
                    return true;
                }
            } else if (args.when === "in2days") {
                if (flagDayCount === 2) {
                    return true;
                }
            }
            return false;
        });

        const isFlagdayWhen = this.homey.flow.getConditionCard('isFlagdayWhen');
        isFlagdayWhen.registerRunListener(async (args, state) => {
            const flagDay = this.homey.flow.getToken(`flagg_${args.droptoken}`);
            const diffDays = new Date(flagDay.__value).getDate() - new Date().getDate();
            if (args.when === "today") {
                if (diffDays === 0) {
                    return true;
                }
            } else if (args.when === "tomorrow") {
                if (diffDays === 1) {
                    return true;
                }
            } else if (args.when === "in2days") {
                if (diffDays === 2) {
                    return true;
                }
            }
            return false;
        });

        const isMarkedDay = this.homey.flow.getConditionCard('isMarkedDay');
        isMarkedDay.registerRunListener(async (args, state) => {
            const flagDayCount = await args.device.getCapabilityValue('meter_flagg_sensor');
            const flagDays = await args.device.getFlagDays();
            const nextFlagDay = await args.device.getNextFlagDayInfo(flagDays);
            const dayType = nextFlagDay.type;

            //this.dDebug('Flagday: ' + dayType + ' - ' + flagDayCount);

            if (dayType !== "Merkedag") {
                return false;
            }
            if (args.when === "today") {
                if (flagDayCount === 0) {
                    return true;
                }
            } else if (args.when === "tomorrow") {
                if (flagDayCount === 1) {
                    return true;
                }
            } else if (args.when === "in2days") {
                if (flagDayCount === 2) {
                    return true;
                }
            }
            return false;
        });

        const isSpecificWaste = this.homey.flow.getConditionCard('isSpecificWaste');
        isSpecificWaste.registerRunListener(async (args, state) => {
            const wasteDaysLeft = await args.device.runCalendarUpdate();
            const groupedWasteInfo = wasteDaysLeft.groupedWasteInfo;
            const wasteType = groupedWasteInfo.find(waste => waste.wasteType === args.type);
            const date = wasteType.date;
            const diffDays = new Date(date).getDate() - new Date().getDate();

            if (args.when === "today") {
                if (diffDays === 0) {
                    return true;
                }
            } else if (args.when === "tomorrow") {
                if (diffDays === 1) {
                    return true;
                }
            }
            return false;
        });
    }

    async formatWastePickupText(wasteType) {
        wasteType = wasteType !== undefined ? wasteType.toLowerCase() : 'waste';

        switch (wasteType) {
            case 'general':
                wasteType = this.homey.__({ en: 'General waste', no: 'Restavfall' });
                break;
            case 'paper':
                wasteType = this.homey.__({ en: 'Paper', no: 'Papir' });
                break;
            case 'plastic':
                wasteType = this.homey.__({ en: 'Plastic packaging', no: 'Plastemballasje' });
                break;
            case 'glass':
                wasteType = this.homey.__({ en: 'Glass and metal', no: 'Glass og metall' });
                break;
            case 'bio':
                wasteType = this.homey.__({ en: 'Food waste', no: 'Matavfall' });
                break;
            case 'garden':
                wasteType = this.homey.__({ en: 'Garden waste', no: 'Hageavfall' });
                break;
            case 'christmastree':
                wasteType = this.homey.__({ en: 'Christmas tree', no: 'Juletre' });
                break;
            case 'other':
                wasteType = this.homey.__({ en: 'Other waste', no: 'Annet avfall' });
                break;
            default:
                wasteType = this.homey.__({ en: 'Waste', no: 'Avfall' });
        }

        return `${wasteType}`;
    }

    async getMatchingWasteTypes(nextWastePickups, diffDays) {
        // Konverter diffDays til en array hvis det ikke allerede er en
        if (!Array.isArray(diffDays)) {
            diffDays = [diffDays];
        }

        // Filtrer ut avfallstyper som matcher noen av verdiene i diffDays
        const matchingWasteTypes = nextWastePickups
            .filter(pickup => diffDays.includes(pickup.diffDays))
            .map(pickup => pickup.wasteType);

        // Sjekk om det finnes noen matchende avfallstyper
        if (matchingWasteTypes.length === 0) {
            return false;
        }

        // Hent formaterte tekststrenger for hver avfallstype
        const formattedWasteTypes = await Promise.all(
            matchingWasteTypes.map(wasteType => this.formatWastePickupText(wasteType))
        );

        // Fjerner ordet "avfall" fra alle unntatt den siste
        for (let i = 0; i < formattedWasteTypes.length - 1; i++) {
            formattedWasteTypes[i] = formattedWasteTypes[i].replace('avfall', '');
        }

        // Setter sammen tekststrengen
        let wasteTypesString;
        if (formattedWasteTypes.length === 1) {
            wasteTypesString = formattedWasteTypes[0];
        } else if (formattedWasteTypes.length === 2) {
            formattedWasteTypes[1] = formattedWasteTypes[1].toLowerCase();
            wasteTypesString = formattedWasteTypes.join(' og ');
        } else if (formattedWasteTypes.length > 2) {
            const lastWasteType = formattedWasteTypes.pop();
            wasteTypesString = formattedWasteTypes.join(', ') + ' og ' + lastWasteType.toLowerCase();
        }

        return wasteTypesString;
    }

    async onUninit() {
        this.dDebug('Norweigan Public Services has been unitialized');
    }

    async logIt(args) {
        if (Homey.env.DEBUG === true) {
            this.log(args);
        }
    }

    async dLog(severity, message, driver, data) {
        const severityColor = (severity) => {
            switch (severity) {
                case 'DEBUG':
                    return "\x1b[35mDEBUG\x1b[0m";
                case 'INFO':
                    return "\x1b[34mINFO\x1b[0m";
                case 'WARNING':
                    return "\x1b[33mWARNING\x1b[0m";
                case 'ERROR':
                    return "\x1b[31mERROR\x1b[0m";
                default:
                    return "\x1b[35mDEBUG\x1b[0m";
            }
        };

        if (!this.homey) {
            this.log(`${severityColor(severity)} [${driver}]: ${message}`, data || '');
            return;
        }

        if (this.homey) {
            const now = new Date();

            let datestring = now.toLocaleDateString(this.userLanguage, {
                dateStyle: 'short',
                timeZone: 'Europe/Oslo'
            });
            let timestring = now.toLocaleTimeString(this.userLanguage, {
                timeStyle: 'medium',
                timeZone: 'Europe/Oslo'
            });

            let debugDateString = `${datestring} ${timestring}`;
            datestring = `${datestring} - ${timestring}`;

            const debugLog = this.homey.settings.get('debugLog') || [];
            const entry = { registered: debugDateString, severity, driver, message };
            if (data) {
                if (typeof data === 'string') {
                    entry.data = { data };
                } else if (data.message) {
                    entry.data = { error: data.message, stacktrace: data.stack };
                } else {
                    entry.data = data;
                }
            }

            debugLog.push(entry);
            if (debugLog.length > 100) {
                debugLog.splice(0, 1);
            }

            this.homey.log(`${severityColor(severity)} [${driver}]: ${message}`, data || '');
            this.homey.settings.set('debugLog', debugLog);
            this.homey.api.realtime('debugLog', entry);
        }
    }

    async dInfo(message, driver = 'App', data) {
        await this.dLog('INFO', message, driver, data);
    }

    async dDebug(message, driver = 'App', data) {
        await this.dLog('DEBUG', message, driver, data);
    }

    async dWarn(message, driver = 'App', data) {
        await this.dLog('WARNING', message, driver, data);
    }

    async dError(message, driver = 'App', data) {
        await this.dLog('ERROR', message, driver, data);
    }
}

module.exports = App;