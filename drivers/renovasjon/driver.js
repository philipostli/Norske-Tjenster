'use strict';

const { Driver } = require('homey');
const axios = require('axios');
const cheerio = require('cheerio');

class Renovasjon extends Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.homey.app.dDebug('Renovasjon has been initialized', 'Renovasjon');
  }

  async onPair(session) {
    this.addressData = {
      "streetName": "",
      "houseNumber": "",
      "postCode": "",
      "countyId": "",
      "addressCode": "",
      "provider": "",
      "addressID": ""
    }
    // Show a specific view by ID
    await session.showView("start");

    session.setHandler("settingsChanged", async (data) => {
      return await this.onSettingsChanged(data);
    });

    session.setHandler("getApiResult", async (data) => {
      //this.log("getApiResult: ");
      //this.log(data);
      return await this.getApiResult(data);
    });

    session.setHandler("getSettings", async () => {
      //this.log("getSettings: ");
      ///this.log(this.addressData);
      return this.addressData;
    });

    session.setHandler("list_devices", async () => {
      return await this.onPairListDevices(session);
    });

    session.setHandler("showView", async (viewId) => {
      if (viewId === "loadingData") {
        const address = `${this.addressData.streetName} ${this.addressData.houseNumber}`;
        this.sendProcessInfo(`Søker etter ${address}. Vent litt...`, session);
        const result = await this.searchAddressForAddressId(address, session, () => { });
        if (result && result.id && result.provider) {
          const { id, provider } = result;
          this.addressData["provider"] = provider;
          this.addressData["addressID"] = id;
          this.sendProcessInfo(`Fant ${address} hos ${provider}. Søker etter avfallsinformasjon...`, session);
          const wasteInfo = await this.searchAddressForWasteInfo(id, address, session);
          if (wasteInfo) {
            await this.onDataFound(wasteInfo, this.addressData, id, session);
          } else {
            this.sendProcessInfo(`Ingen avfallsinformasjon funnet for ${address}.`, session);
          }
        } else {
          this.sendProcessInfo(`Ingen leverandør funnet for ${address}.`, session);
        }
      }
    });

    session.setHandler("changeProvider", async (data) => {
      const provider = data;
      this.homey.app.dDebug(`Provider changed to ${provider}`, 'Renovasjon');

      if (provider === "Min renovasjon") {
        this.addressData["provider"] = provider;
        this.homey.app.dDebug(this.addressData, 'Renovasjon');

        try {
          const response = await this.searchForAddressIdMinRenovasjon(this.addressData);
          this.homey.app.dDebug(response.status, 'Renovasjon');
          this.homey.app.dDebug(response, 'Renovasjon');
          this.homey.app.dDebug(response.data, 'Renovasjon');
          if (response.status === 200) {
            if (response.data && response.data.length > 0) {
              this.addressData["addressID"] = `${this.addressData.streetName} ${this.addressData.houseNumber}`;
              this.log('Success! ' + response);
              await session.nextView();
              return response;
            }
          } else {
            this.homey.app.dError(`Det har oppstått en feil! Fikk statuskode: ${response}.`, 'Renovasjon');
            return response;
          }
        } catch (error) {
          this.homey.app.dError(`${error}`, 'Renovasjon');
          return error;
        }
      } else {
        this.homey.app.dError(`Provider not supported`, 'Renovasjon');
        return false;
      }
    });
  }

  // onDataFound funksjonen som tar imot resultatene
  async onDataFound(data, addressData, id, session) {
    await session.emit("renoResult", data, addressData);
    await session.nextView();
  }

  async sendProcessInfo(data, session) {
    if (!session) {
      this.homey.app.dError("Session is not defined.", 'Renovasjon');
      return;
    }
    return await session.emit("reno", data);
  }

  async onSettingsChanged(data) {
    //this.log("Event settingsChanged: ");
    //this.log(data);
    this.addressData = data;
    return true;
  }

  async getApiResult(data) {
    try {
      const apiurl = "https://ws.geonorge.no/adresser/v1/sok?sok=" + data.streetName + "%20" + data.houseNumber + ",%20" + data.postCode;
      const response = await axios.get(apiurl, {
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        }
      });
      return response.data;
    } catch (error) {
      this.error(error.code);
      return { error: "An error occurred during the API call" };
    }
  }

  async checkAddressCompatibility(data) {
    this.homey.app.dDebug(data, 'Renovasjon');
    const { streetName, houseNumber, countyId, streetCode } = data;
    const apiurl = `https://komteksky.norkart.no/komtek.renovasjonwebapi/api/tommekalender/?kommunenr=${countyId}&gatenavn=${streetName}&gatekode=${streetCode}&husnr=${houseNumber}`;
    axios({
      url: apiurl,
      method: 'get',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'RenovasjonAppKey': 'AE13DEEC-804F-4615-A74E-B4FAC11F0A30',
        'Kommunenr': countyId,
      },
    }).then(response => {
      const result = response.json();
      //this.log(result);
      if (response.status !== 200) {
        this.homey.app.dError(`Det har oppstått en feil! Fikk statuskode: ${response.status}.`, 'Renovasjon');
        return response.status;
      } else {
        this.homey.app.dDebug(`Success! ${response.status}`, 'Renovasjon');
        return response.status;
      }
    }).catch(error => {
      // Handle the error here
      this.homey.app.dError(`${error.code}`, 'Renovasjon');
    });
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices(session) {
    let devices = [];

    let deviceName = `Renovasjon ${this.addressData["streetName"]} ${this.addressData["houseNumber"]}`;
    //let deviceId = crypto.randomBytes(16).toString('hex');
    let deviceId = this.addressData["streetName"] + this.addressData["houseNumber"];
    let device = {
      name: deviceName,
      data: {
        id: deviceId
      },
      settings: {
        streetName: this.addressData["streetName"],
        houseNumber: this.addressData["houseNumber"],
        postCode: this.addressData["postCode"],
        countyId: this.addressData["countyId"],
        addressCode: this.addressData["addressCode"],
        provider: this.addressData["provider"],
        addressID: this.addressData["addressID"],
      }
    };
    devices.push(device);
    this.log(device);
    return devices;
  }

  async searchForAddressIdMinRenovasjon(addressData) {
    this.log(addressData);
    const { streetName, houseNumber, countyId, addressCode } = addressData;
    const url = `https://komteksky.norkart.no/komtek.renovasjonwebapi/api/tommekalender/?kommunenr=${encodeURIComponent(countyId)}&gatenavn=${encodeURIComponent(streetName)}&gatekode=${encodeURIComponent(addressCode)}&husnr=${encodeURIComponent(houseNumber)}`;

    try {
      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'RenovasjonAppKey': 'AE13DEEC-804F-4615-A74E-B4FAC11F0A30',
          'Kommunenr': countyId,
        },
      });

      this.log(response.status);
      if (response.status !== 200) {
        this.log('Det har oppstått en feil! Fikk statuskode: ' + response.status + '.');
        return false;
      } else {
        const id = `${streetName} ${houseNumber}`;
        this.log('Success! ' + response.status);
        return response;
      }
    } catch (error) {
      console.error(error.code);
    }
  }

  async searchAddressForAddressId(address, session) {
    const addressParts = address.split(" ");
    const streetName = encodeURIComponent(addressParts.slice(0, -1).join(" "));
    const houseNumber = addressParts.slice(-1)[0];
    const houseNumberRegex = /^(\d+)([A-Za-z])?$/;
    const match = houseNumber.match(houseNumberRegex);
    const number = match[1];
    const letter = match[2] ? encodeURIComponent(match[2].toUpperCase()) : '';

    const apiList = [
      `https://komteksky.norkart.no/komtek.renovasjonwebapi/api/tommekalender/?kommunenr=${encodeURIComponent(this.addressData.countyId)}&gatenavn=${encodeURIComponent(this.addressData.streetName)}&gatekode=${encodeURIComponent(this.addressData.addressCode)}&husnr=${encodeURIComponent(this.addressData.houseNumber)}`,
      `https://kalender.renovasjonsportal.no/api/address/${encodeURIComponent(address)}`,
      `https://proaktiv.glor.offcenit.no/search?q=${encodeURIComponent(address)}`,
      `https://www.stavanger.kommune.no/api/renovasjonservice/AddressSearch?address=${encodeURIComponent(address)}`,
      //`https://bir.no/api/search/AddressSearch?q=${encodeURIComponent(address)}`,
      `https://bir.no/api/search/AddressSearch?q=${streetName}%20${number}%20${letter}`,
      `https://innherredrenovasjon.no/wp-json/ir/v1/addresses/${encodeURIComponent(address)}`,
      //`https://www.oslo.kommune.no/xmlhttprequest.php?service=ren.search&street=${encodeURIComponent(address.split(" ").slice(0, -1).join(" "))}&number=${address.split(" ").slice(-1)[0]}`
      `https://www.oslo.kommune.no/xmlhttprequest.php?service=ren.search&street=${streetName}&number=${number}&letter=${letter}&street_id=${this.addressData.addressCode}`,
      `https://trv.no/wp-json/wasteplan/v2/adress/?s=${streetName}%20${number}%20${letter}`,
      `https://avfallsor.no/wp-json/addresses/v1/address?address=${streetName}%20${number}%20${letter}`
    ];

    const apiHeaders = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'RenovasjonAppKey': 'AE13DEEC-804F-4615-A74E-B4FAC11F0A30',
      'Kommunenr': this.addressData.countyId,
    };

    let id = null;
    let apiFound = false;
    let provider = null;

    for (let api of apiList) {
      if (apiFound) {
        break;
      }
      try {
        if (api.includes('komteksky.norkart.no')) {
          api = {
            url: api,
            method: 'get',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              'RenovasjonAppKey': 'AE13DEEC-804F-4615-A74E-B4FAC11F0A30',
              'Kommunenr': this.addressData.countyId,
            }
          };
        } else {
          api = {
            url: api,
            method: 'get'
          };
        }
        //this.log(JSON.stringify(api.headers));
        //console.dir(api);
        const response = await axios(api);
        if (response.status === 200 && response.data) {
          if (api.url.includes('kalender.renovasjonsportal.no')) {
            this.sendProcessInfo(`Sjekker ${address} hos ReMidt...`, session);
            if (response.data.searchResults && response.data.searchResults.length > 0) {
              id = response.data.searchResults[0]?.id;
              provider = "ReMidt";
              apiFound = true;
            }
          } else if (api.url.includes('proaktiv.glor.offcenit.no')) {
            this.sendProcessInfo(`Sjekker ${address} hos Glør...`, session);
            if (response.data.length > 0) {
              id = response.data[0]?.id;
              provider = "Glør";
              apiFound = true;
            }
          } else if (api.url.includes('stavanger.kommune.no')) {
            this.sendProcessInfo(`Sjekker ${address} hos Stavanger kommune...`, session);
            if (response.data.Result && response.data.Result.length > 0) {
              id = response.data.Result[0]?.id;
              provider = "Stavanger kommune";
              apiFound = true;
            }
          } else if (api.url.includes('bir.no')) {
            this.sendProcessInfo(`Sjekker ${address} hos BIR...`, session);
            const responseData = response.data;
            if (responseData && responseData.length > 0) {
              id = responseData[0].Id;
              provider = "BIR";
              apiFound = true;
            }
          } else if (api.url.includes('innherredrenovasjon.no')) {
            this.sendProcessInfo(`Sjekker ${address} hos Innherred Renovasjon...`, session);
            if (response.data.data.results.length > 0) {
              id = response.data.data.results[0]?.id;
              provider = "Innherred Renovasjon";
              apiFound = true;
            }
          } else if (api.url.includes('oslo.kommune.no')) {
            this.sendProcessInfo(`Sjekker ${address} hos Oslo kommune...`, session);
            //console.log(response.data.data.result);
            this.log(api.url);
            if (response.data.data.result && response.data.data.result.length > 0) {
              provider = "Oslo kommune";
              apiFound = true;
              id = address;
            }
          } else if (api.url.includes('komteksky.norkart.no')) {
            this.sendProcessInfo(`Sjekker ${address} hos Min renovasjon...`, session);
            //this.log(response);
            if (response.data && response.data.length > 0) {
              provider = "Min renovasjon";
              apiFound = true;
              id = address;
            }
          } else if (api.url.includes('trv.no')) {
            this.sendProcessInfo(`Sjekker ${address} hos Trondheim Renholdsverk (TRV)...`, session);
            if (response.data && response.data.length > 0) {
              provider = "TRV";
              apiFound = true;
              id = response.data[0].id;
            }
          } else if (api.url.includes('avfallsor.no')) {
            this.sendProcessInfo(`Sjekker ${address} hos Avfall Sør...`, session);
            this.log(response.data);
            if (response.data) {
              const firstAddress = Object.values(response.data)[0];
              if (firstAddress && firstAddress.href) {
                const startIndex = firstAddress.href.indexOf('finn-hentedag/') + 'finn-hentedag/'.length;
                id = firstAddress.href.substring(startIndex);
                provider = "Avfall Sør";
                apiFound = true;
              }
            }
          }
          if (id) {
            this.sendProcessInfo(`Adresse ${address} funnet hos ${provider}`, session);
            return { id, provider };
          }
        }
      } catch (error) {
        console.error(`Feil ved henting av data fra ${provider}:`, error.code);
      }
    }

    if (id) {
      return id;
    } else {
      this.sendProcessInfo(`Ingen adresse-ID funnet for ${address}.`, session);
      return null;
    }
  }

  async searchAddressForWasteInfo(id, address, session) {
    const addressParts = address.split(" ");
    const streetName = encodeURIComponent(addressParts.slice(0, -1).join(" "));
    const houseNumber = addressParts.slice(-1)[0];
    const houseNumberRegex = /^(\d+)([A-Za-z])?$/;
    const match = houseNumber.match(houseNumberRegex);
    const number = match[1];
    const letter = match[2] ? encodeURIComponent(match[2].toUpperCase()) : '';

    const urlList = [
      `https://kalender.renovasjonsportal.no/api/address/${id}/details`,
      `https://proaktiv.glor.offcenit.no/details?id=${id}`,
      `https://bir.no/adressesoek/?rId=${id}&name=${encodeURIComponent(address)}`,
      `https://innherredrenovasjon.no/tommeplan/${id}/`,
      `https://www.stavanger.kommune.no/renovasjon-og-miljo/tommekalender/finn-kalender/show?id=${id}`,
      //`https://www.oslo.kommune.no/xmlhttprequest.php?service=ren.search&street=${encodeURIComponent(address.split(" ").slice(0, -1).join(" "))}&number=${address.split(" ").slice(-1)[0]}`
      `https://www.oslo.kommune.no/xmlhttprequest.php?service=ren.search&street=${streetName}&number=${number}&letter=${letter}&street_id=${this.addressData.addressCode}`
    ];

    let wasteInfo = null;
    let wasteInfoFound = false;
    let provider = null;

    for (const url of urlList) {
      if (wasteInfoFound) {
        break;
      }
      try {
        const response = await axios.get(url);
        if (response.status === 200 && response.data && Object.keys(response.data).length > 0) {
          let wasteData;
          if (url.includes('kalender.renovasjonsportal.no')) {
            this.sendProcessInfo(`Sjekker ${id} mot ReMidt...`, session);
            provider = "ReMidt";
            wasteData = processRenovasjonsportalResponse(response.data);
          } else if (url.includes('proaktiv.glor.offcenit.no')) {
            this.sendProcessInfo(`Sjekker ${id} mot Glør...`, session);
            provider = "Glør";
            wasteData = processProaktivResponse(response.data);
          } else if (url.includes('bir.no')) {
            this.sendProcessInfo(`Sjekker ${id} mot BIR...`, session);
            provider = "BIR";
            wasteData = processBirResponse(response.data);
          } else if (url.includes('innherredrenovasjon.no')) {
            this.sendProcessInfo(`Sjekker ${id} mot Innherred Renovasjon...`, session);
            provider = "Innherred Renovasjon";
            wasteData = processInnherredRenovasjonResponse(response.data);
            if (!wasteData) {
              continue;
            }
          } else if (url.includes('stavanger.kommune.no')) {
            this.sendProcessInfo(`Sjekker ${id} mot Stavanger kommune...`, session);
            provider = "Stavanger kommune";
            wasteData = processStavangerKommuneResponse(response.data);
          } else if (url.includes('oslo.kommune.no')) {
            this.sendProcessInfo(`Sjekker ${address} mot Oslo kommune...`, session);
            provider = "Oslo kommune";
            wasteData = processOsloKommuneResponse(response.data);
          } else if (url.includes('avfallsor.no')) {
            this.sendProcessInfo(`Sjekker ${address} mot Oslo kommune...`, session);
            provider = "Avfall Sør";
            wasteData = processAvfallSorResponse(response.data);
          }

          if (wasteData) {
            this.sendProcessInfo(`Avfallsinformasjon funnet for ${address}.`, session);
            wasteInfo = wasteData;
            wasteInfoFound = true;
          }
        }
      } catch (error) {
        console.error(`Feil ved henting av data fra ${url}. Fortsetter...`, error.code);
      }
    }

    if (wasteInfo) {
      const groupedWasteInfo = groupSimilarWasteTypes(wasteInfo);
      for (const [wasteType, date] of Object.entries(groupedWasteInfo)) {
        const formatter = new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
        const formattedDate = formatter.format(date);
        groupedWasteInfo[wasteType] = formattedDate;
      }
      this.sendProcessInfo(`Fant tømmekalender for ${address} hos ${provider}!`, session);
      //this.log(wasteInfo);
      return groupedWasteInfo;
    } else {
      this.sendProcessInfo(`Ingen avfallsinformasjon funnet for ${address}.`, session);
    }

    return wasteInfo;
  }
}

/**
 * Under er funksjoner som
 * sjekker adresse ID hos
 * de forskjellige leverandørene.
 */

/**
 * ReMidt
 */
function processRenovasjonsportalResponse(data) {
  if (data.disposals.length === 0) {
    console.log('Ingen resultater funnet i responsen fra ReMidt. Fortsetter...');
    return null;
  }

  const wasteData = {};

  if (data.disposals) {
    for (const disposal of data.disposals) {
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
    }
  } else {
    console.error('Feil ved behandling av data: data.disposals mangler');
  }

  return wasteData;
}

/**
 * Glør
 */
function processProaktivResponse(data) {
  const wasteData = {};

  if (data && data.length > 0) {
    data.forEach((item) => {
      let fraction = item.fraksjon.replace(/ /g, '_').replace('-', '');

      if (fraction === 'Papir,_papp_og_sekker_plastemballasje') {
        wasteData['Papp'] = new Date(item.dato);
        wasteData['Plast'] = new Date(item.dato);
      } else {
        const date = new Date(item.dato);

        if (!wasteData[fraction]) {
          wasteData[fraction] = date;
        } else if (date < wasteData[fraction]) {
          wasteData[fraction] = date;
        }
      }
    });
  } else {
    console.log('Ingen resultater funnet i responsen fra Glør. Fortsetter...');
    return null;
  }

  return groupSimilarWasteTypes(wasteData);
}

/**
 * BIR
 */
function processBirResponse(data) {
  const $ = cheerio.load(data);
  const title = $('title').text();
  if (title === "En feil har oppstått") {
    console.log(`Ingen resultater funnet i responsen fra BIR. Fortsetter...`);
    return null;
  }

  const wasteData = {};

  $('.address-page-box__list__item').each((i, listItem) => {
    const wasteTypeRaw = $(listItem).find('.text-content__inner').contents().filter(function () {
      return this.nodeType === 3;
    }).text().trim();
    const wasteType = wasteTypeRaw; // Fjern formatering av avfallstypen her

    const dateDay = $(listItem).find('.date__day').text().trim();
    const dateMonth = $(listItem).find('.date__month').text().trim();

    const dateStr = `${dateDay} ${dateMonth}`;
    const dateMatch = dateStr.match(/(\d{1,2})\. (\w+)/i);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const monthName = dateMatch[2];
      const month = getMonthNumber(monthName);
      const year = new Date().getFullYear();
      const date = new Date(year, month - 1, day);

      if (date >= new Date()) {
        wasteData[wasteType] = date;
      }
    }
  });

  //console.log('Raw waste data:', wasteData);

  const groupedWasteData = groupSimilarWasteTypes(wasteData);
  //console.log('Grouped waste data:', groupedWasteData);

  if (Object.keys(groupedWasteData).length === 0) {
    console.log('Data hentet er tomt.');
    return null;
  }

  return groupedWasteData;
}

/**
 * Stavanger kommune
 */
function processStavangerKommuneResponse(html) {
  const wasteData = {};

  const $ = cheerio.load(html);
  const wasteTable = $('.waste-calendar.js-waste-calendar tbody');
  if (wasteTable.length > 0) {
    wasteTable.find('.waste-calendar__item').each((i, row) => {
      const dateStr = $(row).find('td:first-child').text().trim();
      let wasteType = $(row).find('img').attr('title').trim();
      wasteType = wasteType.replace('/papir', ''); // Fjern '/papir' fra avfallstypen
      const dateMatch = dateStr.match(/^(\d{1,2})\.(\d{2})/);
      if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]) - 1;
        const year = new Date().getFullYear();
        const date = new Date(year, month, day);
        if (!wasteData[wasteType] || date < wasteData[wasteType]) {
          wasteData[wasteType] = date;
        }
      }
    });
  } else {
    console.log('Data hentet er tomt.');
  }

  return groupSimilarWasteTypes(wasteData);
}

/**
 * Innherred Renovasjon
 */
function processInnherredRenovasjonResponse(data) {
  const $ = cheerio.load(data);
  const errorBox = $('section.garbage-disposal.gd-error');
  if (errorBox.length > 0) {
    console.log(`Ingen resultater funnet i responsen fra Innherred Renovasjon. Fortsetter...`);
    return null;
  }

  const wasteData = {};

  $('.gd__fraction').each((i, fraction) => {
    const wasteType = $(fraction).find('.gd__fraction-name').text().trim().replace(/[/\s]/g, '');
    const nextDate = $(fraction).find('.gd__next-date').text().trim();
    const dateMatch = nextDate.match(/(\d{1,2})\.\s*(\w+)/i);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const monthName = dateMatch[2];
      const month = getMonthNumber(monthName);
      const year = new Date().getFullYear();
      const date = new Date(year, month - 1, day);

      if (wasteType === 'Glass-ogmetallemballasje') {
        wasteData['Glass'] = date;
        wasteData['Metall'] = date;
      } else if (wasteType === 'Papppapir') {
        wasteData['Papp'] = date;
      } else {
        const formattedWasteType = formatWasteType(wasteType);
        wasteData[formattedWasteType] = date;
      }
    }
  });

  const groupedWasteData = groupSimilarWasteTypes(wasteData);

  if (Object.keys(groupedWasteData).length === 0) {
    console.log('Data hentet er tomt.');
    return null;
  }

  return groupedWasteData;
}

/**
 * Oslo kommune
 */
function processOsloKommuneResponse(responseData) {
  const results = responseData.data.result;
  const collectionDates = {
    Restavfall: null,
    Plast: null,
    Mat: null,
    Papir: null,
  };

  results.forEach((result) => {
    const services = result.HentePunkts[0].Tjenester;
    services.forEach((service) => {
      const fraction = service.Fraksjon.Tekst;
      const date = service.TommeDato;

      if (!collectionDates[fraction] || new Date(date) < new Date(collectionDates[fraction])) {
        collectionDates[fraction] = date;

        // Sett samme dato for Plast og Mat som for Restavfall
        if (fraction === 'Restavfall') {
          collectionDates['Plast'] = date;
          collectionDates['Mat'] = date;
        }
      }
    });
  });

  //console.log(collectionDates);
  return collectionDates;
}

function getMonthNumber(monthName) {
  const monthNames = [
    ['jan', 'januar'], ['feb', 'februar'], ['mar', 'mars'], ['apr', 'april'],
    ['mai'], ['jun', 'juni'], ['jul', 'juli'], ['aug', 'august'],
    ['sep', 'september'], ['okt', 'oktober'], ['nov', 'november'], ['des', 'desember']
  ];
  for (let i = 0; i < monthNames.length; i++) {
    if (monthNames[i].some(name => monthName.toLowerCase().startsWith(name))) {
      return i + 1;
    }
  }
  return -1;
}

function splitWasteInfo(wasteInfo) {
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

function formatWasteType(wasteType) {
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

function groupSimilarWasteTypes(wasteInfo) {
  const wasteTypeMapping = {
    'Papp': ['Papir', 'Papp', 'Papp og papir', 'Papir Og Plastemballasje', 'Papp/papir', 'Papir,_papp_og_sekker_plastemballasje'],
    'Plastavfall': ['Plast', 'Papir Og Plastemballasje', 'Sekker_plastemballasje', 'Sekker Plastemballasje', 'Papir,_papp_og_sekker_plastemballasje', 'Plastemballasje'],
    'Restavfall': ['Restavfall'],
    'Matavfall': ['Mat', 'Bio', 'Matavfall', 'Våtorganisk'],
    'Glass': ['Glass og metallemballasje', 'Glass', 'Glassemballasje'],
    'Metall': ['Glass og metallemballasje', 'Metall', 'Hermetikk'],
  };

  const groupedWasteInfo = {};

  for (const [wasteType, date] of Object.entries(wasteInfo)) {
    const formattedWasteType = formatWasteType(wasteType);

    for (const [group, types] of Object.entries(wasteTypeMapping)) {
      if (types.includes(formattedWasteType)) {
        const currentGroupDate = groupedWasteInfo[group];
        const currentDate = new Date(date);

        if (!currentGroupDate || currentDate > new Date(currentGroupDate)) {
          groupedWasteInfo[group] = date;
        }
      }
    }
  }

  return groupedWasteInfo;
}

module.exports = Renovasjon;
