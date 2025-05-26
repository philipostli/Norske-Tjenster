const axios = require('axios');
const cheerio = require('cheerio');
//const { Driver } = require('homey');

async function searchAddressForAddressId(address) {
  const addressParts = address.split(" ");
  const streetName = encodeURIComponent(addressParts.slice(0, -1).join(" "));
  const houseNumber = addressParts.slice(-1)[0];
  const houseNumberRegex = /^(\d+)([A-Za-z])?$/;
  const match = houseNumber.match(houseNumberRegex);
  const number = match[1];
  const letter = match[2] ? encodeURIComponent(match[2].toUpperCase()) : '';

  const apiList = [
    /*`https://komteksky.norkart.no/komtek.renovasjonwebapi/api/tommekalender/?kommunenr=${encodeURIComponent(this.addressData.countyId)}&gatenavn=${encodeURIComponent(this.addressData.streetName)}&gatekode=${encodeURIComponent(this.addressData.addressCode)}&husnr=${encodeURIComponent(this.addressData.houseNumber)}`,
    `https://kalender.renovasjonsportal.no/api/address/${encodeURIComponent(address)}`,
    `https://proaktiv.glor.offcenit.no/search?q=${encodeURIComponent(address)}`,
    `https://www.stavanger.kommune.no/api/renovasjonservice/AddressSearch?address=${encodeURIComponent(address)}`,
    */`https://bir.no/api/search/AddressSearch?q=${streetName}%20${number}%20${letter}`,
    `https://innherredrenovasjon.no/wp-json/ir/v1/addresses/${encodeURIComponent(address)}`,
      //`https://www.oslo.kommune.no/xmlhttprequest.php?service=ren.search&street=${encodeURIComponent(address.split(" ").slice(0, -1).join(" "))}&number=${address.split(" ").slice(-1)[0]}`
    //`https://www.oslo.kommune.no/xmlhttprequest.php?service=ren.search&street=${streetName}&number=${number}&letter=${letter}&street_id=${this.addressData.addressCode}`,
    `https://trv.no/wp-json/wasteplan/v2/adress/?s=${streetName}%20${number}%20${letter}`,
    ];

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
          console.log(`Sjekker ${address} hos ReMidt...`);
          if (response.data.searchResults && response.data.searchResults.length > 0) {
            id = response.data.searchResults[0]?.id;
            provider = "ReMidt";
            apiFound = true;
          }
        } else if (api.url.includes('proaktiv.glor.offcenit.no')) {
          console.log(`Sjekker ${address} hos Glør...`);
          if (response.data.length > 0) {
            id = response.data[0]?.id;
            provider = "Glør";
            apiFound = true;
          }
        } else if (api.url.includes('stavanger.kommune.no')) {
          console.log(`Sjekker ${address} hos Stavanger kommune...`);
          if (response.data.Result && response.data.Result.length > 0) {
            id = response.data.Result[0]?.id;
            provider = "Stavanger kommune";
            apiFound = true;
          }
        } else if (api.url.includes('bir.no')) {
          console.log(`Sjekker ${address} hos BIR...`);
          const responseData = response.data;
          if (responseData && responseData.length > 0) {
            id = responseData[0].Id;
            provider = "BIR";
            apiFound = true;
            searchAddressForWasteInfo(id, address);
          }
        } else if (api.url.includes('innherredrenovasjon.no')) {
          console.log(`Sjekker ${address} hos Innherred Renovasjon...`);
          if (response.data.data.results.length > 0) {
            id = response.data.data.results[0]?.id;
            provider = "Innherred Renovasjon";
            apiFound = true;
          }
        } else if (api.url.includes('oslo.kommune.no')) {
          console.log(`Sjekker ${address} hos Oslo kommune...`);
            //console.log(response.data.data.result);
          this.log(api.url);
          if (response.data.data.result && response.data.data.result.length > 0) {
            provider = "Oslo kommune";
            apiFound = true;
            id = address;
          }
        } else if (api.url.includes('komteksky.norkart.no')) {
          console.log(`Sjekker ${address} hos Min renovasjon...`);
            //this.log(response);
          if (response.data && response.data.length > 0) {
            provider = "Min renovasjon";
            apiFound = true;
            id = address;
          }
        } else if (api.url.includes('trv.no')) {
          console.log(`Sjekker ${address} hos Trondheim Renholdsverk (TRV)...`);
          if (response.data && response.data.length > 0) {
            provider = "TRV";
            apiFound = true;
            id = response.data[0].id;
            searchAddressForWasteInfo(id, address);
          }
        }
        if (id) {
          console.log(`Adresse ${address} funnet hos ${provider}`);
          return { id, provider };
        }
      }
    } catch (error) {
      console.error(`Feil ved henting av data fra ${provider}:`, error);
    }
  }

  if (id) {
    return id;
  } else {
    console.log(`Ingen adresse-ID funnet for ${address}.`);
    return null;
  }
}

async function searchAddressForWasteInfo(id, address) {
  const urlList = [
    `https://kalender.renovasjonsportal.no/api/address/${id}/details`,
    `https://proaktiv.glor.offcenit.no/details?id=${id}`,
    `https://bir.no/adressesoek/?rId=${id}&name=${encodeURIComponent(address)}`,
    `https://innherredrenovasjon.no/tommeplan/${id}/`,
    `https://www.stavanger.kommune.no/renovasjon-og-miljo/tommekalender/finn-kalender/show?id=${id}`,
    //`https://www.oslo.kommune.no/xmlhttprequest.php?service=ren.search&street=${encodeURIComponent(address.split(" ").slice(0, -1).join(" "))}&number=${address.split(" ").slice(-1)[0]}`
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
          console.log(`Sjekker ${id} mot ReMidt...`);
          provider = "ReMidt";
          wasteData = processRenovasjonsportalResponse(response.data);
        } else if (url.includes('proaktiv.glor.offcenit.no')) {
          console.log(`Sjekker ${id} mot Glør...`);
          provider = "Glør";
          wasteData = processProaktivResponse(response.data);
        } else if (url.includes('bir.no')) {
          console.log(`Sjekker ${id} mot BIR...`, );
          provider = "BIR";
          wasteData = processBirResponse(response.data);
        } else if (url.includes('innherredrenovasjon.no')) {
          console.log(`Sjekker ${id} mot Innherred Renovasjon...`);
          provider = "Innherred Renovasjon";
          wasteData = processInnherredRenovasjonResponse(response.data);
          if (!wasteData) {
            continue;
          }
        } else if (url.includes('stavanger.kommune.no')) {
          console.log(`Sjekker ${id} mot Stavanger kommune...`);
          provider = "Stavanger kommune";
          wasteData = processStavangerKommuneResponse(response.data);
        } else if (url.includes('oslo.kommune.no')) {
          console.log(`Sjekker ${address} mot Oslo kommune...`);
          provider = "Oslo kommune";
          wasteData = processOsloKommuneResponse(response.data);
        }

        if (wasteData) {
          console.log(`Avfallsinformasjon funnet for ${address}.`);
          wasteInfo = wasteData;
          wasteInfoFound = true;
        }
      } else {
        console.error('Feil ved henting av data fra API.');
      }
    } catch (error) {
      console.error(`Feil ved henting av data fra ${url}`);
    }
  }

  if (wasteInfo) {
    const groupedWasteInfo = groupSimilarWasteTypes(wasteInfo);
    for (const [wasteType, date] of Object.entries(groupedWasteInfo)) {
      const formatter = new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
      const formattedDate = formatter.format(date);
      groupedWasteInfo[wasteType] = formattedDate;
    }
    console.log(`Fant tømmekalender for ${address} hos ${provider}!`);
    console.log(wasteInfo);
    return groupedWasteInfo;
  } else {
    console.log(`Ingen avfallsinformasjon funnet for ${address}.`);
  }

  return wasteInfo;
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
    const wasteTypeRaw = $(listItem).find('.text-content__inner').contents().filter(function() {
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
  console.log(html.loadedCheerio.length);
  if (html.loadedCheerio.length < 0) {
    console.log('Ingen resultater funnet hos Stavanger kommune');
    return false;
  }
  const wasteTable = $('.waste-calendar.js-waste-calendar tbody');
  console.log(wasteTable);
  if (wasteTable.length > 0) {
    wasteTable.find('.waste-calendar__item').each((i, row) => {
      const dateStr = $(row).find('td:first-child').text().trim();
      const wasteTypes = $(row).find('img').map((i, el) => $(el).attr('title').trim().replace('/papir', '')).get();

      const currentYear = new Date().getFullYear(); // Hent årstallet fra dagens dato
      const dateMatch = dateStr.match(/^(\d{1,2})\.(\d{2})/);
      if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]) - 1;
        const year = currentYear;
        const date = new Date(year, month, day);

        //console.log(`Funnet ${wasteTypes.join(' og ')} avfall hentes på ${date}`);

        // Loop over alle avfallstypene og legg til datoene
        wasteTypes.forEach(wasteType => {
          // Sjekk om det allerede er lagret datoer for denne avfallstypen
          if (!wasteData[wasteType]) {
            wasteData[wasteType] = [date];
          } else {
            const existingDates = wasteData[wasteType];
            const earliestDate = new Date(Math.min(...existingDates));
            if (date < earliestDate) {
              existingDates.push(earliestDate);
              wasteData[wasteType] = existingDates.filter(d => d !== earliestDate);
              wasteData[wasteType].push(date);
            } else {
              existingDates.push(date);
            }
          }
        });
      }
    });

    // Finn den tidligste datoen for hver avfallstype
    for (const [wasteType, dates] of Object.entries(wasteData)) {
      const earliestDate = new Date(Math.min(...dates));
      wasteData[wasteType] = earliestDate;
      console.log(`Tidligste hentedato for ${wasteType}: ${earliestDate}`);
    }
  } else {
    console.log('Data hentet er tomt.');
  }

  //console.log(`Ugruppert avfallsdata: ${JSON.stringify(wasteData)}`);
  return wasteData;
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

  console.log(collectionDates);
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

async function setDeviceStore(nextDateByWasteType) {
  const currentDay = new Date();
  const closestDiffDays = Math.min(...Object.values(nextDateByWasteType).map(({date}) => Math.round((date - currentDay) / (1000 * 60 * 60 * 24))));
  const closestWasteTypes = Object.values(nextDateByWasteType).filter(({date}) => Math.round((date - currentDay) / (1000 * 60 * 60 * 24)) === closestDiffDays);
  const wasteTypeShorts = closestWasteTypes.map(({shortWasteType}) => shortWasteType);

  if (closestWasteTypes.length === 1) {
    const { longWasteType } = closestWasteTypes[0];
    await this.nextWasteTypes.setValue(longWasteType);
    this.log(longWasteType);
  } else if (closestWasteTypes.length === 2) {
    const [firstShort, secondShort] = wasteTypeShorts;
    const longWasteType = `${this._capitalize(firstShort)} og ${this._capitalize(secondShort)}`;
    //await this.nextWasteTypes.setValue(longWasteType);
    this.log(longWasteType);
  } else {
    const [firstShort, ...remainingShorts] = wasteTypeShorts;
    const remainingString = remainingShorts.length > 1 ? remainingShorts.slice(0, -1).map(short => `${this._capitalize(short)}`).join(', ') : `${this._capitalize(remainingShorts[0])}`;
    const lastShort = remainingShorts.slice(-1)[0];
    const lastString = `${this._capitalize(lastShort)}`;
    const longWasteType = `${this._capitalize(firstShort)}, ${remainingString} og ${lastString}`;
    //await this.nextWasteTypes.setValue(longWasteType);
    this.log(longWasteType);
  }
}

function _capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

//searchAddressForAddressId('Bjørnavegen 71');
//searchAddressForAddressId('Bjørnavegen 72B');
//searchAddressForAddressId('Aasmund Vinjes vei 39');
searchAddressForAddressId('Smørblomstvegen 40B');

module.exports = { searchAddressForAddressId, searchAddressForWasteInfo };