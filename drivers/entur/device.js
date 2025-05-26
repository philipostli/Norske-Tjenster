'use strict';

const { Device } = require('homey');
const axios = require('axios');
const { DateTime } = require('luxon');

class Entur extends Device {
  async onInit() {
    this.homey.app.dDebug(this.getName() + ' has been initialized', 'Entur');
    // Hent stopp-id fra enhetsinnstillinger
    this.id = this.getData().id;
    this.stopId = this.getSetting('station');
    this.filteredStopId = this.getSetting('dirFilter');
    this.capabilityType = 'bus';
    this.iconSet = false;
    this.interval = null;

    this.triggeredDepartures = new Set();

    this.homey.clearInterval(this.updateDeviceInterval);
    this.homey.clearInterval(this.rotateDepInfoInterval);
    this.homey.clearInterval(this.getDepInfoInterval);
    this.homey.clearInterval(this.slideDepInfoInterval);
    this.homey.clearInterval(this.staticDepInfoInterval);
    this.homey.clearInterval(this.interval);

    this.settings = await this.getSettings();

    // Set initial capability values
    await this.setCapabilityValue('sensor_entur_bus_stop', 'Initializing...');
    await this.setCapabilityValue('sensor_entur_bus_line', '');
    await this.setCapabilityValue('sensor_entur_bus_dest', '');
    await this.setCapabilityValue('sensor_entur_bus_dep', '');
    await this.setCapabilityValue('sensor_entur_bus_fullText', '');

    // Oppdater enheten med en gang
    await this.updateDevice();
    this.updateDeviceInterval = this.homey.setInterval(async () => {
      await this.updateDevice();
    }, 20000);

    await this.checkDepartureSetting();
  }

  async checkDepartureSetting() {
    //this.homey.app.dDebug(this.settings.departureText);
    if (this.settings.departureText) {
      if (this.settings.departureText === 'departureTextRotate') {
        this.homey.clearInterval(this.rotateDepInfoInterval);
        this.homey.clearInterval(this.slideDepInfoInterval);
        this.homey.clearInterval(this.staticDepInfoInterval);
        return await this.rotateDepartureInformation();
      } else if (this.settings.departureText === 'departureTextSlide') {
        this.homey.clearInterval(this.rotateDepInfoInterval);
        this.homey.clearInterval(this.slideDepInfoInterval);
        this.homey.clearInterval(this.staticDepInfoInterval);
        return await this.slideDepartureInformation();
      } else if (this.settings.departureText === 'departureTextStatic') {
        this.homey.clearInterval(this.rotateDepInfoInterval);
        this.homey.clearInterval(this.slideDepInfoInterval);
        this.homey.clearInterval(this.staticDepInfoInterval);
        return await this.staticDepartureInformation();
      } else {
        this.homey.clearInterval(this.rotateDepInfoInterval);
        this.homey.clearInterval(this.slideDepInfoInterval);
        this.homey.clearInterval(this.staticDepInfoInterval);
        return await this.staticDepartureInformation();
      }
    } else {
      this.homey.clearInterval(this.rotateDepInfoInterval);
      this.homey.clearInterval(this.slideDepInfoInterval);
      this.homey.clearInterval(this.staticDepInfoInterval);
      return await this.staticDepartureInformation();
    }
  }

  async onAdded() {
    this.homey.app.dDebug(this.getName() + ' has been added', 'Entur');
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.homey.app.dDebug(this.getName() + ' settings were changed', 'Entur');

    if (changedKeys.includes('departureText')) {
      this.settings.departureText = newSettings.departureText;
      this.homey.setTimeout(async () => {
        return await this.checkDepartureSetting();
      }, 2000);
    } else if (changedKeys.includes('timeToWalk')) {
      this.settings.timeToWalk = newSettings.timeToWalk;
      this.homey.setTimeout(async () => {
        return await this.updateDevice();
      }, 2000);
    }
  }

  async onRenamed(name) {
    this.homey.app.dDebug(this.getName() + ' was renamed', 'Entur');
  }

  async onDeleted() {
    this.homey.app.dDebug(this.getName() + ' has been deleted', 'Entur');
    this.homey.clearInterval(this.updateDeviceInterval);
    this.homey.clearInterval(this.rotateDepInfoInterval);
    this.homey.clearInterval(this.getDepInfoInterval);
    this.homey.clearInterval(this.slideDepInfoInterval);
    this.homey.clearInterval(this.staticDepInfoInterval);
    this.homey.clearInterval(this.interval);

    this.homey.app.dDebug('Intervals cleared', 'Entur');
  }

  async fetchStopPlaceInfo() {
    // Definer GraphQL-spørringen
    const query = `
      query ($id: String!, $lines: [ID!]!) {
        stopPlace(id: $id) {
          name
          id
          quays {
            id
            name
            publicCode
            stopType
            lines {
              id
              name
              publicCode
              transportMode
              transportSubmode
            }
          }
          estimatedCalls(arrivalDeparture: both, whiteListed: {lines: $lines}, numberOfDepartures: 500, numberOfDeparturesPerLineAndDestinationDisplay: 20) {
            quay {
              id
              name
              publicCode
              stopType
            }
            expectedDepartureTime
            expectedArrivalTime
            aimedDepartureTime
            realtime
            cancellation
            destinationDisplay {
              frontText
            }
            serviceJourney {
              line {
                id
                name
                publicCode
                transportMode
                operator {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `;

    const apiUrl = 'https://api.entur.io/journey-planner/v3/graphql';
    try {
      let routeFilterSetting = await this.getSetting('routeFilter') || '';
      routeFilterSetting = routeFilterSetting.replace(/'/g, ''); // Fjern alle enkeltfnutter
      if (routeFilterSetting !== null && routeFilterSetting !== undefined && routeFilterSetting !== '') {
        routeFilterSetting = JSON.parse(routeFilterSetting); // Konverter til JSON
      } else {
        routeFilterSetting = [];
      }

      let lines = [];
      if (Array.isArray(routeFilterSetting)) {
        lines = routeFilterSetting.map(item => item.id);
      }

      const response = await axios.post(apiUrl, {
        query: query,
        variables: { id: this.stopId, lines: lines },
      }, {
        headers: {
          'Content-Type': 'application/json',
          'ET-Client-Name': 'Coderax-NorskeTjenesterHomey',
        }
      });

      return response.data.data.stopPlace;
    } catch (error) {
      // Håndter feil
      this.homey.app.dError('Feil ved henting av data: ' + error, 'Entur');
    } finally {
      // Utføres alltid
    }
  }

  async fetchQuayInfo() {
    // Definer GraphQL-spørringen
    const query = `
      query ($ids: [String!]!, $lines: [ID!]!) {
        quays(ids: $ids) {
          name
          id
          publicCode
          estimatedCalls(arrivalDeparture: both, whiteListed: {lines: $lines}, numberOfDepartures: 500, numberOfDeparturesPerLineAndDestinationDisplay: 20) {
            quay {
              id
              name
              publicCode
              stopType
            }
            expectedDepartureTime
            expectedArrivalTime
            aimedDepartureTime
            realtime
            cancellation
            destinationDisplay {
              frontText
            }
            serviceJourney {
              line {
                id
                name
                publicCode
                transportMode
                operator {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `;

    const apiUrl = 'https://api.entur.io/journey-planner/v3/graphql';
    try {
      let routeFilterSetting = await this.getSetting('routeFilter') || '';
      routeFilterSetting = routeFilterSetting.replace(/'/g, ''); // Fjern alle enkeltfnutter
      if (routeFilterSetting !== null && routeFilterSetting !== undefined && routeFilterSetting !== '') {
        routeFilterSetting = JSON.parse(routeFilterSetting); // Konverter til JSON
      } else {
        routeFilterSetting = [];
      }

      let lines = [];
      if (Array.isArray(routeFilterSetting)) {
        lines = routeFilterSetting.map(item => item.id);
      }

      let dirFilterSetting = await this.getSetting('dirFilter') || '';
      dirFilterSetting = dirFilterSetting.replace(/'/g, ''); // Fjern alle enkeltfnutter
      if (dirFilterSetting !== null && dirFilterSetting !== undefined && dirFilterSetting !== '') {
        dirFilterSetting = JSON.parse(dirFilterSetting); // Konverter til JSON
      } else {
        dirFilterSetting = [];
      }

      let quays = [];
      if (Array.isArray(dirFilterSetting)) {
        quays = dirFilterSetting.map(item => item.id);
      }

      const response = await axios.post(apiUrl, {
        query: query,
        variables: { ids: quays, lines: lines },
      }, {
        headers: {
          'Content-Type': 'application/json',
          'ET-Client-Name': 'Coderax-NorskeTjenesterHomey',
        }
      });

      return response.data.data.quays;
    } catch (error) {
      // Håndter feil
      this.homey.app.dError('Feil ved henting av data: ' + error, 'Entur');
    } finally {
      // Utføres alltid
    }
  }

  async updateDevice() {
    this.homey.app.dDebug(`Updating device ${this.getName()}`, 'Entur');
    try {
      let stopPlace;
      let dirFilterSetting = await this.getSetting('dirFilter') || '';
      dirFilterSetting = dirFilterSetting.replace(/'/g, ''); // Fjern alle enkeltfnutter

      if (dirFilterSetting !== null && dirFilterSetting !== undefined && dirFilterSetting !== '') {
        dirFilterSetting = JSON.parse(dirFilterSetting); // Konverter til JSON
      } else {
        dirFilterSetting = [];
      }

      if (dirFilterSetting.length > 0) {
        stopPlace = await this.fetchQuayInfo();
      } else {
        stopPlace = await this.fetchStopPlaceInfo();
      }

      if (!stopPlace) {
        this.homey.app.dError('No stop place found', 'Entur');
        return;
      }

      if (Array.isArray(stopPlace)) {
        // Vi sjekker gjennom alle stopPlace.quays.
        stopPlace = stopPlace.find(quay => quay.estimatedCalls.length > 0);

        // Vi sjekker gjennom alle quays estimatedCalls, og finner alle avganger. Så returnerer vi den tidligste avgangen som stopPlace.estimatedCalls.
        stopPlace.estimatedCalls = stopPlace.estimatedCalls.filter(call => call.expectedDepartureTime || call.expectedArrivalTime);
        stopPlace.estimatedCalls = stopPlace.estimatedCalls.sort((a, b) => {
          const aTime = a.expectedDepartureTime || a.expectedArrivalTime;
          const bTime = b.expectedDepartureTime || b.expectedArrivalTime;
          return aTime - bTime;
        });
      }

      if (stopPlace.publicCode) {
        if (dirFilterSetting.length > 1) {
          // Vi finner den riktige publicCode for stopPlace, som hører til den neste avgangen. publicCode ligger under stopPlace.estimatedCalls.quay.publicCode.
          stopPlace.publicCode = stopPlace.estimatedCalls[0].quay.publicCode;
        } else {
          stopPlace.publicCode = stopPlace.publicCode;
        }
      }

      let stopPlaceName = `${stopPlace.name} ${stopPlace.publicCode ? '(' + stopPlace.publicCode + ')' : ''}`;
      const estimatedCalls = stopPlace.estimatedCalls;
      let timeToDeparture = DateTime.fromJSDate(new Date()).setZone('Europe/Oslo'); // Antatt at du er i Norge
      //this.homey.app.dDebug('timeToWalk:', this.settings.timeToWalk);
      timeToDeparture = timeToDeparture.plus({ minutes: this.settings.timeToWalk });

      const nextDeparture = estimatedCalls.find(call => DateTime.fromJSDate(new Date(call.expectedDepartureTime)).setZone('Europe/Oslo') > timeToDeparture);
      //this.homey.app.dDebug('Next departure:', nextDeparture);
      const nextArrival = estimatedCalls.find(call => call.expectedArrivalTime);

      if (!nextDeparture) {
        this.homey.app.dError('No next departure found', 'Entur');
      } else {
        let transportMode = nextDeparture.serviceJourney.line.transportMode.toLowerCase();
        if (this.iconSet === false) {
          await this.changeDeviceIcon(transportMode);
        }
      }

      const formatTime = (isoString, format = 'seconds') => {
        const departureTime = DateTime.fromISO(isoString, { zone: 'Europe/Oslo' });
        const now = DateTime.now().setZone('Europe/Oslo');
        const differenceInSeconds = departureTime.diff(now, 'seconds').seconds;
        const differenceInMinutes = departureTime.diff(now, 'minutes').minutes;

        if (format === 'minutes') {
          return Math.round(differenceInMinutes);
        } else {
          if (differenceInSeconds < 60) {
            return `${Math.round(differenceInSeconds)} ${this.homey.__({ no: 'sek', en: 'sec' })}`;
          } else if (differenceInSeconds < 600) {
            return `${Math.round(differenceInSeconds / 60)} min`;
          } else {
            return departureTime.toLocaleString(DateTime.TIME_24_SIMPLE);
          }
        }
      };

      const lineDepartures = [];
      if (stopPlace && stopPlace.estimatedCalls) {
        stopPlace.estimatedCalls.forEach(call => {
          const line = call.serviceJourney.line;
          //this.homey.app.dDebug('Line:', line);

          let currentLine = lineDepartures.find(existingLine => existingLine.line.publicCode === line.publicCode);

          if (!currentLine) {
            currentLine = {
              line: line,
              calls: [],
            };
            lineDepartures.push(currentLine);
          }

          // Vi pusher alle avganger til currentLine.calls som hører til den linjen vi er på. Så setter vi også inn differenceInMinutes.
          call.differenceInMinutes = formatTime(call.expectedDepartureTime, 'minutes');
          currentLine.calls.push(call);
        });
      } else {
        this.homey.app.dError('Estimated calls not found or not an array', 'Entur');
      }

      if (lineDepartures.length === 0) {
        this.homey.app.dError('No line departures found.', 'Entur');
      } else {
        const flowArguments = await this.driver._depTrigger.getArgumentValues(this);

        if (flowArguments && flowArguments.length > 0) {
          const flowArgumentsLine = flowArguments[0].lineName.publicCode;
          const flowArgumentsDepTime = flowArguments[0].depTime;
          const matchedDeparture = lineDepartures.find(departure => departure.line.publicCode === flowArgumentsLine);

          if (matchedDeparture) {
            const aimedDepartureTime = matchedDeparture.calls[0].aimedDepartureTime;
            const linePublicCode = matchedDeparture.line.publicCode;
            const differenceInMinutes = matchedDeparture.calls[0].differenceInMinutes;
            const stopPlaceName = `${matchedDeparture.calls[0].quay.name} ${matchedDeparture.calls[0].quay.publicCode ? '(' + matchedDeparture.calls[0].quay.publicCode + ')' : ''}`;

            const departureKey = `${linePublicCode}-${aimedDepartureTime}`;
            if (!this.triggeredDepartures.has(departureKey)) {
              if (flowArgumentsLine === linePublicCode && differenceInMinutes <= flowArgumentsDepTime) {
                if (differenceInMinutes <= flowArgumentsDepTime && linePublicCode === flowArgumentsLine) {
                  await this.driver.triggerFlowCard(this, { stationName: stopPlaceName, lineName: linePublicCode, depTime: differenceInMinutes });
                  this.triggeredDepartures.add(departureKey);
                }
              }
            }
          } else {
            this.homey.app.dError('No matched departure found.', 'Entur');
          }
        }
      }

      if (nextDeparture) {
        const departureTimeFormatted = formatTime(nextDeparture.expectedDepartureTime);
        const departureLine = nextDeparture.serviceJourney.line.publicCode;
        const departureDestination = nextDeparture.destinationDisplay.frontText;
        stopPlaceName = `${nextDeparture.quay.name} ${nextDeparture.quay.publicCode ? '(' + nextDeparture.quay.publicCode + ')' : ''}`;

        await this.setCapabilityValue(`sensor_entur_${this.capabilityType}_stop`, stopPlaceName);
        await this.setCapabilityValue(`sensor_entur_${this.capabilityType}_line`, departureLine);
        await this.setCapabilityValue(`sensor_entur_${this.capabilityType}_dest`, departureDestination);
        await this.setCapabilityValue(`sensor_entur_${this.capabilityType}_dep`, departureTimeFormatted);
      }
    } catch (error) {
      // Håndter feil
      this.homey.app.dError('Feil ved henting av data: ' + error, 'Entur');
    }
  }

  async stringToArray(routeFilterString) {
    if (!routeFilterString) return [];
    return routeFilterString.split(",");
  }

  async arrayToString(lines) {
    const stringifiedLines = lines.map(line => {
      return line;
    });

    return stringifiedLines.join(',');
  }

  async getLinesFromStopPlace(station) {
    // Definer GraphQL-spørringen
    const query = `
      query ($id: String!) {
        stopPlace(id: $id) {
          name
          id
          quays {
            id
            name
            publicCode
            stopType
            lines {
              id
              name
              publicCode
              transportMode
              transportSubmode
              operator {
                id
                name
              }
            }
          }
        }
      }
      `;
    const apiUrl = 'https://api.entur.io/journey-planner/v3/graphql';
    try {
      const response = await axios.post(apiUrl, {
        query: query,
        variables: { id: station },
      }, {
        headers: {
          'Content-Type': 'application/json',
          'ET-Client-Name': 'Coderax-NorskeTjenesterHomey',
        }
      });

      let lines = [];
      if (response.data.data.stopPlace.quays.length > 0) {
        for (const quay of response.data.data.stopPlace.quays) {
          for (const line of quay.lines) {
            // Vi sjekker om linjen allerede er lagt til i listen
            if (!lines.find(existingLine => existingLine.id === line.id)) {
              // Vi sjekker om publicCode er forskjellig fra navnet
              if (line.publicCode !== line.name) {
                line.name = `[${line.publicCode}] ${line.name}`;
              }
              lines.push({
                id: line.id,
                text: line.name,
                operator: {
                  id: line.operator.id,
                  name: line.operator.name,
                }
              });
            }
          }
        }
      }

      return lines;
    } catch (error) {
      // Håndter feil
      this.homey.app.dError('Feil ved henting av data: ' + error, 'Entur');
    } finally {
      // Utføres alltid
    }
  }

  async updateDeviceSettings(lines) {
    return new Promise(async (resolve, reject) => {
      try {
        const originalSettings = await this.getSettings();
        this.homey.app.dDebug('Original settings:', 'Entur', originalSettings);

        // Convert array to the desired string format
        const routeFilterString = await this.arrayToString(lines);

        // Update only the routeFilter value
        const updatedRouteFilter = { routeFilter: routeFilterString };
        this.homey.app.dDebug('Updated routeFilter:', 'Entur', updatedRouteFilter);

        const updatedSettings = await this.setSettings(updatedRouteFilter);
        this.homey.app.dDebug('Updated settings:', 'Entur', updatedSettings);

        resolve(updatedSettings);
      } catch (error) {
        // Håndter feil
        this.homey.app.dError('Error updating settings:', 'Entur', error);
        reject(error);
      }
    });
  }

  async slideDepartureInformation() {
    // Declare fullText and index outside the getDepInfoInterval function to make them available in both intervals.
    let fullText = '';
    let index = 0;
    const VISIBLE_LENGTH = 7;

    // Hent verdien til alle sensorene som er satt på enheten
    this.getDepInfoInterval = this.homey.setInterval(async () => {
      const senVal = await this.getSensorValues();
      if (!senVal) {
        this.homey.app.dError('No sensor values found', 'Entur');
        return;
      }
      if (!senVal.dep || !senVal.line || !senVal.dest) {
        this.homey.app.dError('No sensor values found', 'Entur');
        return;
      }

      const lineDest = `[${senVal.line}] ${senVal.dest}`;
      const depText = `${this.homey.__('entur.device.slideDepInfo.depText', { stopName: senVal.stop })}:`;

      if (senVal.dep.includes('min')) {
        senVal.dep = this.homey.__('entur.device.slideDepInfo.leavesIn', { dep: senVal.dep });
      } else if (senVal.dep.includes('sek') || senVal.dep.includes('sec')) {
        senVal.dep = this.homey.__('entur.device.slideDepInfo.leavesNow');
      } else {
        senVal.dep = this.homey.__('entur.device.slideDepInfo.leavesAt', { dep: senVal.dep });
      }

      fullText = `${depText} ${lineDest} ${senVal.dep} `; // Extra space at the end for better visualization
    }, 5000);

    // Interval to slide the text every 500ms
    this.slideDepInfoInterval = this.homey.setInterval(async () => {
      if (fullText) {
        const visibleText = fullText.substring(index, index + VISIBLE_LENGTH);
        await this.setCapabilityValue(`sensor_entur_${this.capabilityType}_fullText`, visibleText);

        index++;

        if (index + VISIBLE_LENGTH > fullText.length + 5) {
          index = 0;  // reset the index to start from the beginning
        }
      }
    }, 800);
  }

  async rotateDepartureInformation() {
    // Loop gjennom alle sensorene og bytt verdi på sensor_entur_bus_fullText hver 5. sekund
    let i = 0;
    this.rotateDepInfoInterval = this.homey.setInterval(async () => {
      // Hent verdien til alle sensorene som er satt på enheten
      const senVal = await this.getSensorValues();
      if (!senVal || !senVal.dep || !senVal.line || !senVal.dest) {
        this.homey.app.dError('No sensor values found', 'Entur');
        return;
      }

      const lineDest = `[${senVal.line}] ${senVal.dest}`;
      const depText = this.homey.__('entur.device.rotateDepInfo.depText');

      if (senVal.dep.includes('min')) {
        senVal.dep = this.homey.__('entur.device.rotateDepInfo.leavesIn', { dep: senVal.dep });
      } else if (senVal.dep.includes('sek') || senVal.dep.includes('sec')) {
        senVal.dep = this.homey.__('entur.device.rotateDepInfo.leavesNow');
      } else {
        senVal.dep = `kl. ${senVal.dep}`;
      }

      const sensorArray = [depText, lineDest, senVal.dep];

      await this.setCapabilityValue(`sensor_entur_${this.capabilityType}_fullText`, sensorArray[i]);
      i++;
      if (i === sensorArray.length) {
        i = 0;
      }
    }, 3500);
  }

  async staticDepartureInformation() {
    // Hent verdien til alle sensorene som er satt på enheten
    this.staticDepInfoInterval = this.homey.setInterval(async () => {
      const senVal = await this.getSensorValues();
      if (!senVal || !senVal.dep || !senVal.line || !senVal.dest) {
        this.homey.app.dError('No sensor values found', 'Entur');
        return;
      }

      const lineDest = `[${senVal.line}] ${senVal.dest}`;
      const depText = this.homey.__('entur.device.staticDepInfo.depText');

      if (senVal.dep.includes('min')) {
        senVal.dep = this.homey.__('entur.device.staticDepInfo.leavesIn', { dep: senVal.dep });
      } else if (senVal.dep.includes('sek') || senVal.dep.includes('sec')) {
        senVal.dep = this.homey.__('entur.device.staticDepInfo.leavesNow');
      } else {
        senVal.dep = this.homey.__('entur.device.staticDepInfo.leavesAt', { dep: senVal.dep });
      }

      const sensorArray = [depText, lineDest, senVal.dep];

      await this.setCapabilityValue(`sensor_entur_${this.capabilityType}_fullText`, sensorArray.join(' '));
    }, 10000);
  }

  async getSensorValues() {
    const sensorValues = {
      stop: await this.getCapabilityValue(`sensor_entur_${this.capabilityType}_stop`),
      line: await this.getCapabilityValue(`sensor_entur_${this.capabilityType}_line`),
      dest: await this.getCapabilityValue(`sensor_entur_${this.capabilityType}_dest`),
      dep: await this.getCapabilityValue(`sensor_entur_${this.capabilityType}_dep`),
    };

    return sensorValues;
  }

  async changeDeviceIcon(type) {
    if (type === 'bus') {
      if (this.hasCapability('sensor_entur_train_dep') || this.hasCapability('sensor_entur_train_line') || this.hasCapability('sensor_entur_train_dest') || this.hasCapability('sensor_entur_train_stop') || this.hasCapability('sensor_entur_train_fullText')) {
        await this.removeCapability('sensor_entur_train_dep');
        await this.removeCapability('sensor_entur_train_line');
        await this.removeCapability('sensor_entur_train_dest');
        await this.removeCapability('sensor_entur_train_stop');
        await this.removeCapability('sensor_entur_train_fullText');

        await this.addCapability('sensor_entur_bus_stop');
        await this.addCapability('sensor_entur_bus_line');
        await this.addCapability('sensor_entur_bus_dest');
        await this.addCapability('sensor_entur_bus_dep');
        await this.addCapability('sensor_entur_bus_fullText');

        this.capabilityType = 'bus';
        this.iconSet = true;
      } else {
        await this.addCapability('sensor_entur_bus_stop');
        await this.addCapability('sensor_entur_bus_line');
        await this.addCapability('sensor_entur_bus_dest');
        await this.addCapability('sensor_entur_bus_dep');
        await this.addCapability('sensor_entur_bus_fullText');

        this.capabilityType = 'bus';
        this.iconSet = true;
      }
    } else if (type === 'rail') {
      if (this.hasCapability('sensor_entur_bus_dep') || this.hasCapability('sensor_entur_bus_line') || this.hasCapability('sensor_entur_bus_dest') || this.hasCapability('sensor_entur_bus_stop') || this.hasCapability('sensor_entur_bus_fullText')) {
        await this.removeCapability('sensor_entur_bus_dep');
        await this.removeCapability('sensor_entur_bus_line');
        await this.removeCapability('sensor_entur_bus_dest');
        await this.removeCapability('sensor_entur_bus_stop');
        await this.removeCapability('sensor_entur_bus_fullText');

        await this.addCapability('sensor_entur_train_stop');
        await this.addCapability('sensor_entur_train_line');
        await this.addCapability('sensor_entur_train_dest');
        await this.addCapability('sensor_entur_train_dep');
        await this.addCapability('sensor_entur_train_fullText');

        this.capabilityType = 'train';
        this.iconSet = true;
      } else {
        await this.addCapability('sensor_entur_train_stop');
        await this.addCapability('sensor_entur_train_line');
        await this.addCapability('sensor_entur_train_dest');
        await this.addCapability('sensor_entur_train_dep');
        await this.addCapability('sensor_entur_train_fullText');

        this.capabilityType = 'train';
        this.iconSet = true;
      }
    }
  }
}

module.exports = Entur;
