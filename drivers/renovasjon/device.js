'use strict';

const { Device } = require('homey');
const axios = require('axios');
const cheerio = require('cheerio');

class Renovasjon extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    let device = this; // We're in a Device instance
    let tokens = {};
    let state = {};

    let currentDate = new Date();
    let currentYear = currentDate.getFullYear();
    let currentMonth = currentDate.getMonth();
    let currentDay = currentDate.getDate();
    let currentHour = currentDate.getHours();
    let currentMinute = currentDate.getMinutes();
    let currentSecond = currentDate.getSeconds();
    if (currentMonth < 10) {
      currentMonth = '0' + currentMonth;
    }
    if (currentDay < 10) {
      currentDay = '0' + currentDay;
    }
    if (currentHour < 10) {
      currentHour = '0' + currentHour;
    }
    if (currentMinute < 10) {
      currentMinute = '0' + currentMinute;
    }
    if (currentSecond < 10) {
      currentSecond = '0' + currentSecond;
    }
    this._currentTime = `${currentDay}.${currentMonth}.${currentYear}: ${currentHour}:${currentMinute}:${currentSecond}`;

    const nextWasteTypes = await this.homey.flow.createToken(`nextWasteTypes-${this.getData().id}`, {
      type: "string",
      title: `Avfall neste henting - ${this.getSetting('streetName')} ${this.getSetting('houseNumber')}`,
      value: `Laster...`
    });

    this.nextWasteTypes = nextWasteTypes;
    this.nextWasteTypes.setValue = this.nextWasteTypes.setValue.bind(this.nextWasteTypes);

    // Stopp tidligere intervall om det finnes
    if (this.interval) {
      clearInterval(this.interval);
      console.log('Cleared interval');
    } else {
      this.interval = null;
      console.log('No interval to clear');
    }

    // Logger at Renovasjon-modulen er initialisert
    this.log(this.getName() + ' has been initialized');

    try {
      // Itererer gjennom avfallstypene og fjerner sensorer for disse
      ['general',
        'paper',
        'bio',
        'glass',
        'drinking_carton',
        'special',
        'plastic',
        'wood',
        'textile',
        'garden',
        'metal',
        'ewaste',
        'cardboard',
        'furniture',
        'plastic_packaging',
        'sub_waste',
        'glassiglo',
        'dangerous',
        'bio_cabin',
        'general_cabin',
        'paper_cabin',
        'reno_sensor'
      ].forEach(id => {
        //this.removeRenoCap(`sensor_waste_${id}`);
      });
      if (!this.hasCapability('measure_next_waste_days_left') && this.hasCapability('sensor_waste_general')) {
        this.addRenoCap('measure_next_waste_days_left');
      }
      if (this.hasCapability('reno_sensor')) {
        this.removeRenoCap('reno_sensor');
      }
    } catch (error) {
      // Logger feilmelding dersom det oppstår en feil
      console.error(error.code);
    }

    // Kaller "ready" for å indikere at modulen er klar for bruk
    this.ready();
  }

  /**
   * onUninit
   */
  async onUninit() {
    await this.homey.flow.unregisterToken(`nextWasteTypes-${this.getData().id}`);
  }

  /**
 * onAdded is called when the user adds the device, called just after pairing.
 */
  async onAdded() {
    this.log(this.getName() + ' has been added');
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
    this.log(this.getName() + ' settings where changed: ', changedKeys);
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log(this.getName() + ' was renamed to ' + name);
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    await this.unregisterToken();
    this.homey.clearInterval(this.interval);
    this.log(this.getName() + ' has been deleted');
  }

  async unregisterToken() {
    await this.homey.flow.unregisterToken(`nextWasteTypes-${this.getData().id}`);
    return true;
  }

  async ready() {
    const pollInterval = 1*60*60*1000;
    const pollIntervalReadable = pollInterval / 1000 / 60 / 60;
    this.log(this.getName() + ' is ready');
    const settings = await this.getSettings();
    if (settings.provider) {
      const settingProvider = settings.provider
      if (settingProvider == "Oslo kommune") {
        this.processOsloKommuneResponse(`${settings.streetName} ${settings.houseNumber}`);
        //this.interval = setInterval(() => this.processOsloKommuneResponse(`${settings.streetName} ${settings.houseNumber}`), pollInterval);
        
        this.interval = this.homey.setInterval(async () => {
          this.processOsloKommuneResponse(`${settings.streetName} ${settings.houseNumber}`);
        }, pollInterval);

        this.log(`Intervall satt til ${pollIntervalReadable} time`);
      } else if (settingProvider == "Min renovasjon") {
        this.processMinRenovasjonResponse(settings.countyId, settings.streetName, settings.addressCode, settings.houseNumber);
        //this.interval = setInterval(() => this.processMinRenovasjonResponse(settings.countyId, settings.streetName, settings.addressCode, settings.houseNumber), pollInterval);
        
        this.interval = this.homey.setInterval(async () => {
          this.processMinRenovasjonResponse(settings.countyId, settings.streetName, settings.addressCode, settings.houseNumber);
        }, pollInterval);

        this.log(`Intervall satt til ${pollIntervalReadable} time`);
      } else if (settingProvider == "Innherred Renovasjon") {
        this.processInnherredRenovasjonResponse(settings.addressID);
        //this.interval = setInterval(() => this.processInnherredRenovasjonResponse(settings.addressID), pollInterval);
        
        this.interval = this.homey.setInterval(async () => {
          this.processInnherredRenovasjonResponse(settings.addressID);
        }, pollInterval);

        this.log(`Intervall satt til ${pollIntervalReadable} time`);
      } else if (settingProvider == "Stavanger kommune") {
        this.processStavangerKommuneResponse(settings.addressID);
        //this.interval = setInterval(() => this.processStavangerKommuneResponse(settings.addressID), pollInterval);
        
        this.interval = this.homey.setInterval(async () => {
          this.processStavangerKommuneResponse(settings.addressID);
        }, pollInterval);
        
        this.log(`Intervall satt til ${pollIntervalReadable} time`);
      } else if (settingProvider == "BIR") {
        this.processBirResponse(settings.addressID, `${settings.streetName} ${settings.houseNumber}`);
        //this.interval = setInterval(() => this.processBirResponse(settings.addressID, `${settings.streetName} ${settings.houseNumber}`), pollInterval);
        
        this.interval = this.homey.setInterval(async () => {
          this.processBirResponse(settings.addressID, `${settings.streetName} ${settings.houseNumber}`);
        }, pollInterval);
        
        this.log(`Intervall satt til ${pollIntervalReadable} time`);
      } else if (settingProvider == "Glør") {
        this.processGlørResponse(settings.addressID);
        //this.interval = setInterval(() => this.processGlørResponse(settings.addressID), pollInterval);
        
        this.interval = this.homey.setInterval(async () => {
          this.processGlørResponse(settings.addressID);
        }, pollInterval);
        
        this.log(`Intervall satt til ${pollIntervalReadable} time`);
      } else if (settingProvider == "ReMidt") {
        this.processReMidtResponse(settings.addressID);
        //this.interval = setInterval(() => this.processReMidtResponse(settings.addressID), pollInterval);
        
        this.interval = this.homey.setInterval(async () => {
          this.processReMidtResponse(settings.addressID);
        }, pollInterval);
        
        this.log(`Intervall satt til ${pollIntervalReadable} time`);
      } else if (settingProvider == "Avfall Sør") {
        this.processAvfallSorResponse(settings.addressID);
        //this.interval = setInterval(() => this.processAvfallSorResponse(settings.addressID), pollInterval);
        
        this.interval = this.homey.setInterval(async () => {
          this.processAvfallSorResponse(settings.addressID);
        }, pollInterval);
        
        this.log(`Intervall satt til ${pollIntervalReadable} time`);
      }
    }
  }

  async addRenoCap(id) {
    if (!this.hasCapability(id)) {
      await this.addCapability(id);
      return true;
    }
    return false;
  }

  async removeRenoCap(id) {
    if (this.hasCapability(id)) {
      await this.removeCapability(id);
      return true;
    }
    return false;
  }

  async updateRenoCap(id, value) {
    if (this.hasCapability(id)) {
      await this.setCapabilityValue(id, value);
      return true;
    }
    return false;
  }

  async updateRenoCapOptions(id, options) {
    if (this.hasCapability(id)) {
      await this.setCapabilityOptions(id, options);
      return true;
    }
    return false;
  }

  async getRenoCap() {
    return this.getCapabilities();
  }

  /**
   * Min Renovasjon
   */
  async processMinRenovasjonResponse(countyID, streetName, streetCode, houseNumber) {
    this.log(`${this._currentTime}: Henter data fra Min Renovasjon`);
    try {
      const apiurl = `https://komteksky.norkart.no/komtek.renovasjonwebapi/api/tommekalender/?kommunenr=${countyID}&gatenavn=${streetName}&gatekode=${streetCode}&husnr=${houseNumber}`;
      const response = await axios({
        url: apiurl,
        method: 'get',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'RenovasjonAppKey': 'AE13DEEC-804F-4615-A74E-B4FAC11F0A30',
          'Kommunenr': countyID,
        },
      });

      if (response.status !== 200) {
        this.log('Det har oppstått en feil! Fikk statuskode: ' + response.status + '.');
        return;
      }

      const data = response.data;
      const wasteData = {};

      data.forEach(item => {
        const fraction = item.FraksjonId;
        item.Tommedatoer.forEach(dateString => {
          const date = new Date(dateString);
          if (!wasteData[fraction] || date < wasteData[fraction]) {
            wasteData[fraction] = date;
          }
        });
      });

      //this.log(wasteData);

      const groupedWasteInfo = await this.groupSimilarWasteTypes(wasteData);
      const nextDateByWasteType = await this.getNextDateByWasteType(groupedWasteInfo);
      const wasteTypesByDays = await this.getWasteTypesByDays(nextDateByWasteType);
      await this.updateWasteTypes(nextDateByWasteType);
      this.updateMeasureNextWasteDaysLeft(wasteTypesByDays);
      //this.log(groupedWasteInfo);
      await this.setDeviceStore(wasteTypesByDays);

      return groupedWasteInfo;
    } catch (error) {
      console.error(error.code);
      if (error.response) {
        // Feil i API-responsen
        this.error('Fant ingen tømmekalender for denne adressen');
      } else {
        // Annen feil
        console.warn('En annen feil har oppstått:', error.message);
      }
    }
  }

  /**
   * ReMidt
   */
  async processReMidtResponse(id) {
    this.log('Henter data fra ReMidt');
    const url = `https://kalender.renovasjonsportal.no/api/address/${id}/details`;
    const response = await axios.get(url);

    const data = response.data;
    const wasteData = {};

    if (data.disposals && data.disposals.length > 0) {
      data.disposals.forEach((disposal) => {
        const fraction = disposal.fraction;
        const date = new Date(disposal.date);

        if (fraction === 'Glass og metallemballasje') {
          if (!wasteData['Glass'] || date < wasteData['Glass']) {
            wasteData['Glass'] = date;
          }
          if (!wasteData['Metall'] || date < wasteData['Metall']) {
            wasteData['Metall'] = date;
          }
        } else {
          if (!wasteData[fraction] || date < wasteData[fraction]) {
            wasteData[fraction] = date;
          }
        }
      });
    } else {
      console.error('Feil ved behandling av data: data.disposals mangler');
      return null;
    }

    const groupedWasteInfo = await this.groupSimilarWasteTypes(wasteData);
    const nextDateByWasteType = await this.getNextDateByWasteType(groupedWasteInfo);
    const wasteTypesByDays = await this.getWasteTypesByDays(nextDateByWasteType);
    await this.updateWasteTypes(nextDateByWasteType);
    this.updateMeasureNextWasteDaysLeft(wasteTypesByDays);
    await this.setDeviceStore(wasteTypesByDays);

    return groupedWasteInfo;
  }

  /**
   * Glør
   */
  async processGlørResponse(id) {
    this.log('Henter data fra Glør');
    const url = `https://proaktiv.glor.offcenit.no/details?id=${id}`;
    const response = await axios.get(url);

    const data = response.data;
    const wasteData = {};

    if (data && data.length > 0) {
      data.forEach((item) => {
        const date = new Date(item.dato);
        const avfallType = item.fraksjon.replace(/ /g, '_').replace('-', '');

        if (avfallType === 'Papir,_papp_og_sekker_plastemballasje') {
          if (!wasteData['Papp'] || date < wasteData['Papp']) {
            wasteData['Papp'] = date;
          }
          if (!wasteData['Plast'] || date < wasteData['Plast']) {
            wasteData['Plast'] = date;
          }
        } else {
          if (!wasteData[avfallType] || date < wasteData[avfallType]) {
            wasteData[avfallType] = date;
          }
        }
      });
      //this.log(wasteData);
    } else {
      console.log('Ingen resultater funnet i responsen fra Glør. Fortsetter...');
      return null;
    }

    const groupedWasteInfo = await this.groupSimilarWasteTypes(wasteData);
    const nextDateByWasteType = await this.getNextDateByWasteType(groupedWasteInfo);
    const wasteTypesByDays = await this.getWasteTypesByDays(nextDateByWasteType);
    await this.updateWasteTypes(nextDateByWasteType);
    this.updateMeasureNextWasteDaysLeft(wasteTypesByDays);
    await this.setDeviceStore(wasteTypesByDays);

    return groupedWasteInfo;
  }

  /**
   * BIR
   */
  async processBirResponse(id, address) {
    this.log('Henter data fra BIR');
    const url = `https://bir.no/adressesoek/?rId=${id}&name=${encodeURIComponent(address)}`;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const title = $('title').text();
    if (title === "En feil har oppstått") {
      console.log(`Ingen resultater funnet i responsen fra BIR. Fortsetter...`);
      return null;
    }

    const wasteData = {};

    const listItems = $('ul.address-page-box__list li');
    for (let i = 0; i < listItems.length; i++) {
      const listItem = listItems[i];
      const wasteType = $(listItem).find('.text-content__inner').contents().filter(function () {
        return this.nodeType === 3;
      }).text().trim();

      const dateMonth = $(listItem).find('.date__month').text().trim();
      const dateYear = new Date().getFullYear();

      const dateStr = `${dateMonth} ${dateYear}`;
      const dateMatch = dateStr.match(/(\d{1,2})\. (\w+) (\d{4})/i);
      if (dateMatch) {
        const monthName = dateMatch[2];
        const month = await this.getMonthNumber(monthName);
        const date = new Date(`${dateMatch[3]}-${month}-${dateMatch[1]}`);

        if (wasteType == "Papir og plastemballasje") {
          wasteData['Papp'] = date;
          wasteData['Plast'] = date;
        }

        if (date >= new Date()) {
          wasteData[wasteType] = date;
        }
      }
    }

    const groupedWasteInfo = await this.groupSimilarWasteTypes(wasteData);
    const nextDateByWasteType = await this.getNextDateByWasteType(groupedWasteInfo);
    const wasteTypesByDays = await this.getWasteTypesByDays(nextDateByWasteType);
    await this.updateWasteTypes(nextDateByWasteType);
    this.updateMeasureNextWasteDaysLeft(wasteTypesByDays);
    await this.setDeviceStore(wasteTypesByDays);

    return groupedWasteInfo;
  }

  /**
   * Stavanger kommune
   */
  async processStavangerKommuneResponse(id = this.getSetting('addressID')) {
    this.log('Henter data fra Stavanger kommune');
    const url = `https://www.stavanger.kommune.no/renovasjon-og-miljo/tommekalender/finn-kalender/show?id=${id}`;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const wasteDataByDate = {};

    const wasteTable = $('.waste-calendar.js-waste-calendar tbody');
    if (wasteTable.length > 0) {
      wasteTable.find('.waste-calendar__item').each((i, row) => {
        const dateStr = $(row).find('td:first-child').text().trim();
        const wasteTypes = $(row).find('img').map((i, img) => $(img).attr('title').trim().replace('/papir', '')).get();
        const dateMatch = dateStr.match(/^(\d{1,2})\.(\d{2})/);
        if (dateMatch) {
          const day = parseInt(dateMatch[1]);
          const month = parseInt(dateMatch[2]) - 1;
          const year = new Date().getFullYear();
          const date = new Date(year, month, day);
          const isoDate = date.toISOString().substring(0, 10);
          if (!wasteDataByDate[isoDate]) {
            wasteDataByDate[isoDate] = {};
          }
          for (const wasteType of wasteTypes) {
            if (!wasteDataByDate[isoDate][wasteType] || date < wasteDataByDate[isoDate][wasteType]) {
              wasteDataByDate[isoDate][wasteType] = date;
            }
          }
        }
      });
    } else {
      console.log('Data hentet er tomt.');
    }

    const wasteData = {};
    for (const [isoDate, wasteTypes] of Object.entries(wasteDataByDate)) {
      for (const [wasteType, date] of Object.entries(wasteTypes)) {
        if (!wasteData[wasteType] || date < wasteData[wasteType]) {
          wasteData[wasteType] = date;
        }
      }
    }

    const groupedWasteInfo = await this.groupSimilarWasteTypes(wasteData);
    const nextDateByWasteType = await this.getNextDateByWasteType(groupedWasteInfo);
    const wasteTypesByDays = await this.getWasteTypesByDays(nextDateByWasteType);
    await this.updateWasteTypes(nextDateByWasteType);
    this.updateMeasureNextWasteDaysLeft(wasteTypesByDays);
    await this.setDeviceStore(wasteTypesByDays);

    return groupedWasteInfo;
  }

  /**
   * Innherred Renovasjon
   */
  async processInnherredRenovasjonResponse(id = this.getSetting('addressID')) {
    this.log('Henter data fra Innherred Renovasjon');
    const url = `https://innherredrenovasjon.no/tommeplan/${id}/`;
    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      const errorBox = $('section.garbage-disposal.gd-error');
      if (errorBox.length > 0) {
        console.log(`Ingen resultater funnet i responsen fra Innherred Renovasjon. Fortsetter...`);
        return null;
      }

      const wasteData = {};
      const fractions = $('.gd__fraction');

      for (let i = 0; i < fractions.length; i++) {
        const fraction = fractions.eq(i);
        const wasteType = fraction.find('.gd__fraction-name').text().trim().replace(/[/\s]/g, '');
        const nextDate = fraction.find('.gd__next-date').text().trim();
        const dateMatch = nextDate.match(/(\d{1,2})\.\s*(\w+)/i);
        if (dateMatch) {
          const day = parseInt(dateMatch[1]);
          const monthName = dateMatch[2];
          const month = await this.getMonthNumber(monthName);
          const year = new Date().getFullYear();
          const date = new Date(year, month - 1, day);

          if (wasteType === 'Glass-ogmetallemballasje') {
            wasteData['Glass'] = date;
            wasteData['Metall'] = date;
          } else if (wasteType === 'Papppapir') {
            wasteData['Papp'] = date;
          } else {
            const formattedWasteType = await this.formatWasteType(wasteType);
            wasteData[formattedWasteType] = date;
          }
        }
      }

      const nextPickupDates = {};
      for (const [wasteType, date] of Object.entries(wasteData)) {
        if (date && Date.parse(date)) {
          const nextDate = new Date(date);
          nextPickupDates[wasteType] = nextDate;
        }
      }

      //this.log(`wasteData:`, wasteData);
      //this.log(`nextPickupDates:`, nextPickupDates);

      const groupedWasteInfo = await this.groupSimilarWasteTypes(nextPickupDates);
      //this.log(`groupedWasteInfo:`, groupedWasteInfo);
      const nextDateByWasteType = await this.getNextDateByWasteType(groupedWasteInfo);
      const wasteTypesByDays = await this.getWasteTypesByDays(nextDateByWasteType);
      await this.updateWasteTypes(nextDateByWasteType);
      this.updateMeasureNextWasteDaysLeft(wasteTypesByDays);
      await this.setDeviceStore(wasteTypesByDays);

      return groupedWasteInfo;
    } catch (error) {
      console.error(`Feil ved henting av data fra ${url}:`, error.code);
      return null;
    }
  }

  /**
   * Oslo kommune
   */
  async processOsloKommuneResponse(address) {
    this.log('Henter data fra Oslo kommune');
    const addressParts = address.split(" ");
    const streetName = encodeURIComponent(addressParts.slice(0, -1).join(" "));
    const houseNumber = addressParts.slice(-1)[0];
    const houseNumberRegex = /^(\d+)([A-Za-z])?$/;
    const match = houseNumber.match(houseNumberRegex);
    const number = match[1];
    const letter = match[2] ? encodeURIComponent(match[2].toUpperCase()) : '';

    const url = `https://www.oslo.kommune.no/xmlhttprequest.php?service=ren.search&street=${streetName}&number=${number}&letter=${letter}&street_id=${this.getSetting('addressCode')}`;

    try {
      const response = await axios.get(url);
      if (response.status === 200 && response.data && Object.keys(response.data).length > 0) {
        const results = response.data.data.result;
        const collectionDates = {};

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const services = result.HentePunkts[0].Tjenester;

          for (let j = 0; j < services.length; j++) {
            const service = services[j];
            const fraction = service.Fraksjon.Tekst;
            const date = service.TommeDato;
            const frequencyText = service.Hyppighet.Tekst;

            if (date && Date.parse(date)) {
              const dateMatch = date.match(/(\d{1,2})\.\s*(\w+)/i);
              const day = parseInt(dateMatch[1]);
              const month = parseInt(dateMatch[2]) - 1;
              const year = new Date().getFullYear();
              const dateObj = new Date(year, month, day);
              const currentDate = new Date();

              if (dateObj >= currentDate) {
                if (!collectionDates[fraction] || dateObj < collectionDates[fraction]) {
                  collectionDates[fraction] = dateObj;
                }
              } else if (frequencyText && frequencyText.includes('uke')) {
                let frequency = frequencyText.match(/(\d+)/);
                frequency = frequency[0];
                if (frequency > 0 && !collectionDates[fraction]) {
                  const intervalDate = new Date(dateObj);
                  while (intervalDate < currentDate) {
                    intervalDate.setDate(intervalDate.getDate() + (7 * frequency));
                  }
                  if (intervalDate >= currentDate) {
                    collectionDates[fraction] = intervalDate;
                  }
                }
              }
            }
          }
        }

        // Splitting av fraksjoner etter riktig dato
        if (collectionDates['Restavfall']) {
          collectionDates['Rest'] = collectionDates['Restavfall'];
          collectionDates['Plast'] = collectionDates['Restavfall'];
          collectionDates['Mat'] = collectionDates['Restavfall'];
          delete collectionDates['Restavfall'];
        }

        const nextPickupDates = {};
        for (const [wasteType, date] of Object.entries(collectionDates)) {
          if (date && Date.parse(date)) {
            const nextDate = new Date(date);
            nextPickupDates[wasteType] = nextDate;
          }
        }

        const groupedWasteInfo = await this.groupSimilarWasteTypes(nextPickupDates);
        const nextDateByWasteType = await this.getNextDateByWasteType(groupedWasteInfo);
        const wasteTypesByDays = await this.getWasteTypesByDays(nextDateByWasteType);
        await this.updateWasteTypes(nextDateByWasteType);
        this.updateMeasureNextWasteDaysLeft(wasteTypesByDays);
        await this.setDeviceStore(wasteTypesByDays);

        return groupedWasteInfo;
      }
    } catch (error) {
      console.error(`Feil ved henting av data fra ${url}:`, error.code);
    }

    return null;
  }

  /**
   * Avfall Sør
   */
  async processAvfallSorResponse(id) {
    this.log('Henter data fra Avfall Sør');
    const url = `https://avfallsor.no/henting-av-avfall/finn-hentedag/${id}/`;
    try {
      const response = await axios.get(url);
      if (response.status === 200 && response.data) {
        const html = response.data;
        const $ = cheerio.load(html);
        const wasteData = {};

        // Finn alle h3-elementer inne i .pickup-days-small
        const dateElements = $('.pickup-days-small h3');
        const specialCases = ['Glass- og metallemballasje', 'Papp, papir og plastemballasje'];

        for (const element of dateElements) {
          const currentYear = new Date().getFullYear();

          const date = $(element).text().trim(); // Hent teksten fra h3-elementet
          const wasteTypeElement = $(element).next('.info-boxes').find('.info-boxes-box div:first-child');
          const wasteType = wasteTypeElement.contents().filter((_, el) => el.nodeType === 3).text().trim().replace(/\s+/g, ' '); // Fjern whitespace-karakterer

          const dateParts = date.split(' ');
          const day = parseInt(dateParts[1].replace('.', ''));
          const monthString = dateParts[2];
          const month = await this.getMonthNumber(monthString);
          const formattedDate = new Date(currentYear, month - 1, day);

          if (specialCases.includes(wasteType)) {
            if (!wasteData[wasteType]) {
              wasteData[wasteType] = formattedDate;
            }
          } else {
            const wasteTypes = wasteType.split(' ');

            for (const type of wasteTypes) {
              const formattedWasteType = type.replace(':', '');

              if (!wasteData[formattedWasteType]) {
                wasteData[formattedWasteType] = formattedDate;
              }
            }
          }
        }

        const nextPickupDates = {};
        for (const [wasteType, date] of Object.entries(wasteData)) {
          if (date && Date.parse(date)) {
            const nextDate = new Date(date);
            nextPickupDates[wasteType] = nextDate;
          }
        }

        // Filter ut kun første nærmeste dato frem i tid for hver avfallstype
        const filteredPickupDates = {};
        const currentDate = new Date();

        for (const [wasteType, date] of Object.entries(nextPickupDates)) {
          if (date >= currentDate) {
            if (!filteredPickupDates[wasteType] || date < filteredPickupDates[wasteType]) {
              filteredPickupDates[wasteType] = date;
            }
          }
        }

        // Sjekk om spesialtilfellene mangler og legg dem til med riktig dato
        const specialCasesMissing = specialCases.filter(wasteType => !filteredPickupDates[wasteType]);

        for (const wasteType of specialCasesMissing) {
          const formattedDate = new Date(); // Bruk dagens dato
          filteredPickupDates[wasteType] = formattedDate.toLocaleDateString('nb-NO');
        }

        const groupedWasteInfo = await this.groupSimilarWasteTypes(filteredPickupDates);
        const nextDateByWasteType = await this.getNextDateByWasteType(groupedWasteInfo);
        const wasteTypesByDays = await this.getWasteTypesByDays(nextDateByWasteType);
        await this.updateWasteTypes(nextDateByWasteType);
        this.updateMeasureNextWasteDaysLeft(wasteTypesByDays);
        await this.setDeviceStore(wasteTypesByDays);

        return groupedWasteInfo;
      }
    } catch (error) {
      console.error(`Feil ved henting av data fra ${url}:`, error.code);
    }

    return null;
  }

  async getNextDateByWasteType(groupedWasteInfo) {
    const nextDateByWasteType = {};
    for (const wasteTypeObj of groupedWasteInfo) {
      const wasteType = wasteTypeObj.wasteType;
      const date = wasteTypeObj.date;
      const wasteTypeShort = wasteTypeObj.shortWasteType;
      if (date && Date.parse(date)) {
        const nextDate = new Date(date);
        nextDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));

        const formatter = new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
        const formattedDate = formatter.format(nextDate);
        nextDateByWasteType[wasteType] = { wasteType, formattedDate, diffDays, wasteTypeShort };
      } else {
        console.log(`Skipping ${wasteType} with date ${date}`);
      }
    }
    return nextDateByWasteType;
  }

  async getWasteTypesByDays(nextDateByWasteType) {
    const currentDay = new Date();
    const closestDiffDays = Math.min(...Object.values(nextDateByWasteType).map(({ diffDays }) => diffDays));
    const closestWasteTypes = Object.values(nextDateByWasteType).filter(({ diffDays }) => diffDays === closestDiffDays);

    if (closestWasteTypes.length === 1) {
      const { wasteTypeShort } = closestWasteTypes[0];
      const wasteTypeDays = parseFloat(closestDiffDays);
      const wasteTypeString = `${closestDiffDays === 1 ? 'dag' : 'dager'} (${wasteTypeShort})`;
      return { days: wasteTypeDays, wasteTypeString: wasteTypeString, wasteTypes: closestWasteTypes };
    } else {
      const wasteTypeDays = parseFloat(closestDiffDays);
      const wasteTypeString = `${closestDiffDays === 1 ? 'dag' : 'dager'} (${closestWasteTypes.map(({ wasteTypeShort }) => wasteTypeShort).join(', ')})`;
      return { days: closestDiffDays, wasteTypeString: wasteTypeString, wasteTypes: closestWasteTypes };
    }
  }

  async updateMeasureNextWasteDaysLeft(wasteTypesByDays) {
    //this.log(this.hasCapability('measure_next_waste_days_left'));
    if (this.hasCapability('measure_next_waste_days_left')) {
      this.updateRenoCap('measure_next_waste_days_left', wasteTypesByDays.days);
      this.updateRenoCapOptions('measure_next_waste_days_left', { 'units': wasteTypesByDays.wasteTypeString });
      return wasteTypesByDays;
    } else {
      await this.addRenoCap('measure_next_waste_days_left');
      this.updateRenoCap('measure_next_waste_days_left', wasteTypesByDays.days);
      this.updateRenoCapOptions('measure_next_waste_days_left', { 'units': wasteTypesByDays.wasteTypeString });
      return wasteTypesByDays;
    }
  }

  async updateWasteTypes(nextDateByWasteType) {
    for (const wasteType in nextDateByWasteType) {
      const { formattedDate, diffDays } = nextDateByWasteType[wasteType];
      await this.addRenoCap(`sensor_waste_${wasteType}`);
      this.updateRenoCap(`sensor_waste_${wasteType}`, formattedDate);
    }
  }

  async setDeviceStore(nextDateByWasteType) {
    if (!nextDateByWasteType) {
      this.log('nextDateByWasteType is undefined... ', nextDateByWasteType);
      return false;
    }
    const wasteTypeShorts = nextDateByWasteType.wasteTypes.map(({ wasteTypeShort }) => this._capitalize(wasteTypeShort));

    if (wasteTypeShorts.length === 1) {
      const [firstShort] = wasteTypeShorts;
      const longWasteType = this._capitalize(firstShort.toLowerCase());
      await this.nextWasteTypes.setValue(longWasteType);
      //this.log(longWasteType);
    } else if (wasteTypeShorts.length === 2) {
      const [firstShort, secondShort] = wasteTypeShorts;
      const longWasteType = this._capitalize(`${firstShort.toLowerCase()} og ${secondShort.toLowerCase()}`);
      await this.nextWasteTypes.setValue(longWasteType);
      //this.log(longWasteType);
    } else {
      const [firstShort, ...remainingShorts] = wasteTypeShorts;
      const remainingString = remainingShorts.slice(0, -1).join(', ');
      const lastShort = remainingShorts.slice(-1)[0];
      const longWasteType = this._capitalize(`${firstShort.toLowerCase()}, ${remainingString.toLowerCase()} og ${lastShort.toLowerCase()}`);
      await this.nextWasteTypes.setValue(longWasteType);
      //this.log(longWasteType);
    }
  }

  _capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  async getMonthNumber(monthName) {
    const monthNames = [
      ['jan', 'januar'],
      ['feb', 'februar'],
      ['mar', 'mars'],
      ['apr', 'april'],
      ['mai'],
      ['jun', 'juni'],
      ['jul', 'juli'],
      ['aug', 'august'],
      ['sep', 'september'],
      ['okt', 'oktober'],
      ['nov', 'november'],
      ['des', 'desember']
    ];

    return new Promise((resolve, reject) => {
      for (let i = 0; i < monthNames.length; i++) {
        if (monthNames[i].some(name => monthName.toLowerCase().startsWith(name))) {
          resolve(i + 1);
        }
      }
      reject(new Error(`Could not find month number for month name "${monthName}"`));
    });
  }

  async splitWasteInfo(wasteInfo) {
    const updatedWasteInfo = {};

    for (const [key, value] of Object.entries(wasteInfo)) {
      if (key === "Hermetikk-_og_glassemballasje") {
        updatedWasteInfo["Hermetikk"] = value;
        updatedWasteInfo["Glass"] = value;
      } else if (key === "Papir,_papp_og_sekker_plastemballasje") {
        updatedWasteInfo["Papp"] = value;
        updatedWasteInfo["SekkerPlastemballasje"] = value;
      } else {
        updatedWasteInfo[key] = value;
      }
    }
    return updatedWasteInfo;
  }

  async formatWasteType(wasteType) {
    const formatted = wasteType
      .replace(/([A-Z])/g, ' $1') // Legg til mellomrom før store bokstaver
      .replace(/([0-9])/g, ' $1') // Legg til mellomrom før tall
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Legg til mellomrom mellom små og store bokstaver
      .replace(/_/g, ' ') // Erstatt understreker med mellomrom
      .replace(/Og/g, ', ') // Erstatt "Og" med komma og mellomrom
      .trim() // Fjern eventuelle ekstra mellomrom før og etter
      .toLowerCase() // Gjør alle bokstaver små
      .replace(/\b\w/g, (l) => l.toUpperCase()); // Gjør første bokstav i hvert ord stor

    return formatted;
  }

  async groupSimilarWasteTypes(wasteInfo) {
    // Returnerer en tom array hvis inndataene er 'undefined' eller 'null'
    if (!wasteInfo) return [];

    const wasteTypeMapping = {
      paper: ['Papir', 'Papp', 'Papp og papir', 'Papir Og Plastemballasje', 'Papp/papir', 'Papir,_papp_og_sekker_plastemballasje', 2, '2', 13, '13', 28, '28', 'Papp, papir og plastemballasje'],
      plastic: ['Plast', 'Papir Og Plastemballasje', 'Sekker_plastemballasje', 'Sekker Plastemballasje', 'Papir,_papp_og_sekker_plastemballasje', 'Plastemballasje', 7, '7', 'Papp, papir og plastemballasje'],
      general: ['Restavfall', 1, '1', 27, '27', 'Rest', 17, '17'],
      bio: ['Mat', 'Bio', 'Matavfall', 'Våtorganisk', 3, '3', 26, '26', 17, '17', 'Bioavfall'],
      glass: ['Glass og metallemballasje', 'Glass', 'Glassemballasje', 4, '4', 'Metall', 'Hermetikk', 11, '11', 'Metallavfall', 'Glass- og metallemballasje'],
      //metal: ['Glass og metallemballasje', 'Metall', 'Hermetikk', 4, 11, 'Metallavfall'],
    };

    const wasteTypesPrettyShort = {
      general: 'Rest',
      paper: 'Papp',
      bio: 'Mat',
      plastic: 'Plast',
      glass: 'Glass/Metall',
      //metal: 'Metall',
    };

    const wasteTypesPretty = {
      general: 'Restavfall',
      paper: 'Papp/papir',
      bio: 'Matavfall',
      plastic: 'Plastavfall',
      glass: 'Glass/metall',
    }

    const groupedWasteInfo = [];

    for (const [wasteType, date] of Object.entries(wasteInfo)) {
      for (const [group, types] of Object.entries(wasteTypeMapping)) {
        if (types.includes(wasteType)) {
          const currentDate = new Date(date);
          const existingWasteType = groupedWasteInfo.find((w) => w.wasteType === group);
          const formattedWasteType = wasteTypesPrettyShort[group];
          const formattedWasteTypeLong = wasteTypesPretty[group];
          if (!existingWasteType || currentDate > new Date(existingWasteType.date)) {
            if (existingWasteType) {
              existingWasteType.date = date;
            } else {
              groupedWasteInfo.push({
                wasteType: group,
                date: date,
                shortWasteType: formattedWasteType,
                longWasteType: formattedWasteTypeLong,
              });
            }
          }
        }
      }
    }
    return groupedWasteInfo;
  }

}

module.exports = Renovasjon;
