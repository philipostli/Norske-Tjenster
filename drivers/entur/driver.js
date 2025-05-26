'use strict';

const { Driver } = require('homey');
const axios = require('axios');

class Entur extends Driver {
  async onInit() {
    await this.initFlows();

    this.homey.app.dDebug('Entur has been initialized', 'Entur');
  }

  async initFlows() {
    this.homey.app.dDebug('Initializing flow cards for Entur driver', 'Entur');

    this._depTrigger = this.homey.flow.getDeviceTriggerCard('depTrigger');
    this.triggeredDepartures = new Set();
    this.lineDepartures = {};

    this._depTrigger.registerRunListener(async (args, state) => {
      if (args.lineName.publicCode === state.lineName && args.depTime <= state.depTime) return true;
    });

    this._depTrigger.registerArgumentAutocompleteListener('lineName', async (query, args) => {
      const lines = await this.getLinesFromStopPlace(args.device.settings.station);
      const results = [];
      for (const line of lines) {
        switch (line.operator.id.split(':')[0]) {
          case 'RUT':
            line.image = 'https://resources.mynewsdesk.com/image/upload/iihukz02bjuymd2dpdyp.png';
            break;
          case 'KOL':
            line.image = 'https://play-lh.googleusercontent.com/fdzTaI41BtFgvUiTMpQ9w9pJBdGL-jJhwibEAWI2Kl6Dw3K0J4PdUrmMB2Q802sflg';
            break;
          case 'NSB':
            line.image = 'https://i.imgur.com/TeALJ6U.png';
            break;
          case 'GOA':
            line.image = 'https://play-lh.googleusercontent.com/1DtmLmZwyZvJSGNLTF6Zq3UeHtladkeb4S6r_wtWHa3V8PlKSGszctNKXfzs5usINTc';
            break;
          case 'AKT':
            line.image = 'https://is1-ssl.mzstatic.com/image/thumb/Purple126/v4/90/da/18/90da183d-b45c-753d-7457-653f680e8195/AppIcon-AKT-PROD-0-0-1x_U007emarketing-0-0-0-10-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/1024x1024.jpg';
            break;
          case 'SKY':
            line.image = 'https://visitvestlandet.no/media/com_jbusinessdirectory/pictures/companies/37/Skyss_-_Bus_1642333061.jpeg';
            break;
          case 'VYB':
          case 'VYX':
            line.image = 'https://pbs.twimg.com/profile_images/1120986220379680770/jQSFSWW1_400x400.png';
            break;
          case 'INN':
            line.image = 'https://play-lh.googleusercontent.com/mrK5wJw4fWuhVtzRbqEyCxvP1keDUTBnQuCHrhcAd6CaLPn4mebtIfU1t5bvT8o3zS8E';
            break;
          case 'SJN':
            line.image = 'https://play-lh.googleusercontent.com/ehYRwErAYkWtNj3xfvwRF0ZjAR9HQRJiLW0gBXm_V3OCf41hLftxSkpjNtIbb6IgYwU=w240-h480-rw';
            break;
          case 'TEL':
            line.image = 'https://play-lh.googleusercontent.com/M6U3XsN3Z7S3F1X8w5fmLcQwXY4XFs0RvZRUQqSQxmwo85UnylseLBIZab-sOAK07Vc=w240-h480-rw';
            break;
          case 'FLT':
            line.image = 'https://play-lh.googleusercontent.com/2kbGGPdsrvr97yY77BKiyq02t_osmQjmhdZPDQdlRaOXqM7WQPqlDYgOE97fEu5e9x-C';
            break;
          default:
            line.image = 'https://avatars.githubusercontent.com/u/23213604?s=280&v=4';
        }

        results.push({
          name: line.text,
          description: line.operator.name,
          image: line.image,
          publicCode: line.publicCode,
          lineId: line.id,
          id: args.device.id,
          operator: {
            id: line.operator.id,
            name: line.operator.name,
          }
        });
      }

      return results.filter((result) => {
        return result.name.toLowerCase().includes(query.toLowerCase());
      });
    });

    this._depTrigger.on('update', async () => {
      this.homey.app.dDebug('Triggered flow card updated', 'Entur');
    });

    this.homey.app.dDebug('Flow cards initialized', 'Entur');
  }

  async triggerFlowCard(device, tokens, state = {}) {
    await this._depTrigger.trigger(device, tokens, tokens);
    return true;
  }

  async onPair(session) {
    session.setHandler("saveStation", async (data) => {
      this.homey.app.dDebug(`Station selected: ${data.name} (${data.id})`, 'Entur');
      session.entur = {
        id: data.id,
        country_a: data.country_a,
        county: data.county,
        label: data.label,
        locality: data.locality,
        name: data.name,
        source_id: data.source_id,
      };
      return true;
    });

    session.setHandler("list_devices", async () => {
      return await this.onPairListDevices(session);
    });
  }

  async onRepair(session, device) {
    this.homey.app.dDebug('Started repair for device:', device.getName(), 'Entur');
    session.setHandler('station', async () => {
      return await device.getSetting('station');
    });

    session.setHandler('routeFilter', async () => {
      let routeFilter = await device.getSetting('routeFilter');
      routeFilter = routeFilter.replace(/'/g, ''); // Fjern alle enkeltfnutter
      routeFilter = JSON.parse(routeFilter);
      routeFilter.sort();

      return routeFilter;
    });

    session.setHandler('dirFilter', async () => {
      let dirFilter = await device.getSetting('dirFilter');
      dirFilter = dirFilter.replace(/'/g, ''); // Fjern alle enkeltfnutter
      dirFilter = JSON.parse(dirFilter);
      dirFilter.sort();

      return dirFilter;
    });

    session.setHandler('changeSettings', async (settings) => {
      this.homey.app.dDebug('changeSettings', 'Entur', settings);
      settings.routeFilter = `'${JSON.stringify(settings.routeFilter)}'`;
      settings.dirFilter = `'${JSON.stringify(settings.dirFilter)}'`;
      await device.setSettings({ routeFilter: settings.routeFilter, dirFilter: settings.dirFilter });
      return await device.onInit();
    });
  }

  async onPairListDevices(session) {
    let devices = [];

    if (session.entur.name.toLowerCase().includes("stasjon")) {
      session.entur.name = session.entur.name.replace(" stasjon", "");
    }

    let deviceName = `${session.entur.name} stasjon`;
    let deviceId = session.entur.id;
    let device = {
      name: deviceName,
      data: {
        id: deviceId
      },
      settings: {
        station: session.entur.id,
        departureText: 'departureTextStatic',
        routeFilter: `'${await this.getStopPlaceLines(session)}'`,
      }
    };
    devices.push(device);
    console.log(device);
    return devices;
  }

  async getStopPlaceLines(session) {
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
              }
            }
            estimatedCalls(arrivalDeparture: both) {
              quay {
                lines {
                name
                id
                publicCode
                transportMode
                transportSubmode
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
        variables: { id: session.entur.id },
      }, {
        headers: {
          'Content-Type': 'application/json',
          'ET-Client-Name': 'Coderax-NorskeTjenesterHomey',
        }
      });

      let lines = [];
      for (const quays of response.data.data.stopPlace.quays) {
        for (const line of quays.lines) {
          if (!lines.find(existingLine => existingLine.id === line.id)) {
            if (line.publicCode !== line.name) {
              line.name = `[${line.publicCode}] ${line.name}`;
            }
            lines.push({
              id: line.id,
              text: line.name,
            });
          }
        }
      }

      this.homey.app.dDebug(`Lines for stopPlace ${this.stopId}: ${JSON.stringify(lines)}`, 'Entur');
      return JSON.stringify(lines);
    } catch (error) {
      // Håndter feil
      this.homey.app.dError('Feil ved henting av stopPlace data: ' + error, 'Entur');
    } finally {
      // Utføres alltid
    }
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
                publicCode: line.publicCode,
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
      this.homey.app.dError('Feil ved henting av Quay data: ' + error, 'Entur');
    } finally {
      // Utføres alltid
    }
  }
}

module.exports = Entur;
