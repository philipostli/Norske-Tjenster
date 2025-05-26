const ical = require('node-ical');
const axios = require('axios');
const url = 'https://www.gjesdal.kommune.no/_f/p21/ifd304fb1-d833-4dee-9934-797b06e0ce55/rute-2-2023-gjesdal-kommune-kalender.ics';

const getNextGarbageCollectionDates = async () => {
  try {
    const data = await ical.async.fromURL(url);
    const garbageTypes = new Map([
      ['Restavfall', { interval: 14, start: null }],
      ['Matavfall', { interval: 28, start: null }],
      ['Plastemballasje', { interval: 28, start: null }],
      ['Papir', { interval: 28, start: null }],
      ['Glass', { interval: 84, start: null }],
      ['Metall', { interval: 84, start: null }],
      ['Henting av juletrær', { interval: 0, start: null }]
      ]);

    for (const event of Object.values(data)) {
      if (event.type === 'VEVENT') {
        const { summary, start } = event;
        if (summary && summary.val && start) {
          const summaryVal = summary.val.trim().toLowerCase();
          if (garbageTypes.has('Restavfall') && summaryVal.includes('restavfall')) {
            const date = new Date(start);
            const garbageData = garbageTypes.get('Restavfall');
            if (garbageData.start === null || date < garbageData.start) {
              garbageData.start = date;
            }
          } else if (garbageTypes.has('Matavfall') && summaryVal.includes('matavfall')) {
            const date = new Date(start);
            const garbageData = garbageTypes.get('Matavfall');
            if (garbageData.start === null || date < garbageData.start) {
              garbageData.start = date;
            }
          } else if (garbageTypes.has('Plastemballasje') && summaryVal.includes('plastemballasje')) {
            const date = new Date(start);
            const garbageData = garbageTypes.get('Plastemballasje');
            if (garbageData.start === null || date < garbageData.start) {
              garbageData.start = date;
            }
          } else if (garbageTypes.has('Papir') && summaryVal.includes('papir')) {
            const date = new Date(start);
            const garbageData = garbageTypes.get('Papir');
            if (garbageData.start === null || date < garbageData.start) {
              garbageData.start = date;
            }
          } else if (garbageTypes.has('Glass') && summaryVal.includes('glass')) {
            const date = new Date(start);
            const garbageData = garbageTypes.get('Glass');
            if (garbageData.start === null || date < garbageData.start) {
              garbageData.start = date;
            }
          } else if (garbageTypes.has('Metall') && summaryVal.includes('metall')) {
            const date = new Date(start);
            const garbageData = garbageTypes.get('Metall');
            if (garbageData.start === null || date < garbageData.start) {
              garbageData.start = date;
            }
          } else if (garbageTypes.has('Henting av juletrær') && summaryVal.includes('juletrær')) {
            const date = new Date(start);
            const garbageData = garbageTypes.get('Henting av juletrær');
            if (garbageData.start === null) {
              garbageData.start = date;
            } else if (date.getFullYear() > garbageData.start.getFullYear()) {
              garbageData.start = date;
            }
          }
        }
      }
    }

    const formattedDates = [];
    for (const [garbageType, garbageData] of garbageTypes) {
      if (garbageData.start !== null && garbageType !== 'Henting av juletrær') {
        const today = new Date();
        const daysDiff = Math.ceil((garbageData.start - today) / (1000 * 60 * 60 * 24));
        const daysUntilNextCollection = garbageData.interval - (daysDiff % garbageData.interval);
        const date = new Date(today.getTime() + daysUntilNextCollection * 24 * 60 * 60 * 1000);
        formattedDates.push(`${garbageType}: ${date.toLocaleDateString()}`);
      } else if (garbageData.start !== null && garbageType === 'Henting av juletrær') {
        const today = new Date();
        const date = new Date(garbageData.start.getFullYear(), 11, 10);
        if (today < date) {
          formattedDates.push(`${garbageType}: ${date.toLocaleDateString()}`);
        } else {
          const nextYear = new Date(today.getFullYear() + 1, 11, 10);
          formattedDates.push(`${garbageType}: ${nextYear.toLocaleDateString()}`);
        }
      }
    }

    return formattedDates;

  } catch (err) {
    console.error(err);
    return null;
  }
};

const getPackageTrackingInfo = async (trackingNumber) => {
  try {
    const response = await axios.get(`https://sporing.posten.no/tracking/api/fetch?query=${trackingNumber}&lang=no`);
    const consignmentSet = response?.data?.consignmentSet;
    if (!consignmentSet || !consignmentSet.length) {
      console.error("Invalid response from tracking API");
      return null;
    }
    const events = consignmentSet[0].packageSet[0].eventSet;
    const formattedEvents = events.map(event => {
      const date = new Date(event.dateIso);
      const weekday = date.toLocaleString('no', { weekday: 'long' });
      const day = date.getDate();
      const month = date.toLocaleString('no', { month: 'long' });
      const year = date.toLocaleString('no', { year: 'numeric' });
      const time = date.toLocaleString('no', { timeStyle: 'short' });
      return `${weekday} ${day}. ${month} ${year} - ${time}: ${event.description}`;
    });
    return formattedEvents;
  } catch (error) {
    console.error(error);
    return null;
  }
};

async function fetchVehicleData(registrationNumber) {
  try {
    const url = `https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata?kjennemerke=${registrationNumber}`;
    const headers = {
      'SVV-Authorization': 'f388f18c-414e-4ace-9d20-dbb4dd010997'
    };
    const response = await axios.get(url, { headers });
    const data = response.data.kjoretoydataListe[0];

    const nextInspectionDate = new Date(data.periodiskKjoretoyKontroll.kontrollfrist);
    const today = new Date();
    const timeDiff = nextInspectionDate.getTime() - today.getTime(); // endret denne linjen

    let timeDiffText;

    if (timeDiff < 0) { // inspeksjonen er allerede passert
      if (timeDiff > -365 * 24 * 60 * 60 * 1000) { // mindre enn 1 år siden
        const months = Math.floor(-timeDiff / (30 * 24 * 60 * 60 * 1000));
        timeDiffText = `for ${months} måneder siden`;
      } else if (timeDiff > -30 * 24 * 60 * 60 * 1000) { // mindre enn 1 måned siden
        const days = Math.floor(-timeDiff / (24 * 60 * 60 * 1000));
        timeDiffText = `for ${days} dager siden`;
      } else { // mer enn 1 måned siden
        const years = Math.floor(-timeDiff / (365 * 24 * 60 * 60 * 1000));
        timeDiffText = `for ${years} år siden`;
      }
    } else { // inspeksjonen er i fremtiden
      if (timeDiff < 365 * 24 * 60 * 60 * 1000) { // mindre enn 1 år igjen
        const months = Math.floor(timeDiff / (30 * 24 * 60 * 60 * 1000));
        timeDiffText = `${months} måneder`;
      } else if (timeDiff < 30 * 24 * 60 * 60 * 1000) { // mindre enn 1 måned igjen
        const days = Math.floor(timeDiff / (24 * 60 * 60 * 1000));
        timeDiffText = `${days} dager`;
      } else { // mer enn 1 måned igjen
        const years = Math.floor(timeDiff / (365 * 24 * 60 * 60 * 1000));
        timeDiffText = `${years} år`;
      }
    }

    return timeDiffText;

  } catch (error) {
    console.error(error);
  }
}

const getFlagDays = async () => {
  try {
    const response = await axios.get(`http://flaggdager.no/ical/kalender/flaggdager.ics`);
    const data = response?.data;

    // Check if data is valid
    if (!data || !data.includes("DTSTART;VALUE=DATE:2023")) {
      console.error("Invalid response from flaggdager API or no flag days in 2023");
      return null;
    }

    // Extract flag days from data
    const flagDays = data
      .split("BEGIN:VEVENT")
      .filter((event) => event.includes("DTSTART;VALUE=DATE:2023"))
      .map((event) => {
        const date = event.match(/DTSTART;VALUE=DATE:(\d{8})/)[1];
        const summary = event.match(/SUMMARY:(.*)/)[1];
        const day = date.slice(6, 8);
        const month = date.slice(4, 6);
        const year = date.slice(0, 4);
        const formattedDate = `[${day}.${month}.${year}]`;
        return { Dato: formattedDate, Flaggdag: summary };
      });

    // Print and return flag days
    flagDays.forEach((flagDay) => {
      console.log(`${flagDay.Dato} ${flagDay.Flaggdag}`);
    });

    return flagDays;
  } catch (error) {
    console.error(error);
    return null;
  }
};

getFlagDays().then(console.log);

fetchVehicleData('RJ88279').then(console.log);

getPackageTrackingInfo('LB931724627NO').then(console.log);

getNextGarbageCollectionDates().then(console.log);