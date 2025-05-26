'use strict';

const { Driver } = require('homey');
const axios = require('axios');

class Badetemperatur extends Driver {

  async onInit() {
    this.homey.app.dDebug('Badetemperatur has been initialized', 'Badetemperatur');
  }

  async onPair(session) {
    session.setHandler("saveStation", async (data) => {
        this.homey.app.dDebug(`Station selected: ${data.station.name} (${data.id})`, 'Air Quality Index');
        session.aqi = {
            id: data.id,
            name: data.name,
            region: data.region,
            subregion: data.subregion,
            temperature: data.temperature,
            time: data.time,
            position: data.location.position,
            sourceDisplayName: data.sourceDisplayName || 'yr.no'
        };
        return true;
    });

    session.setHandler("list_devices", async () => {
        return await this.onPairListDevices(session);
    });
}

async onPairListDevices(session) {
    let devices = [];

    let deviceName = `${session.aqi.name} målestasjon`;
    let device = {
        name: deviceName,
        data: {
            ...session.aqi,
        },
        settings: {
            stationId: session.aqi.id,
            stationName: session.aqi.name,
            stationCoords: `${session.aqi.latitude}, ${session.aqi.longitude}`,
            stationElevation: `${session.aqi.elevation}m`,
            stationArea: session.aqi.area,
            stationCounty: session.aqi.county,
        }
    };
    devices.push(device);
    this.homey.app.dDebug(`Devices ready to be added:`, 'Air Quality Index', devices);
    return devices;
}

//   async onPair(session) {
//     // Handler for getting regions
//     session.setHandler('getRegions', async () => {
//       try {
//         const response = await axios.get('https://www.yr.no/api/v0/regions/NO', {
//           headers: {
//             'User-Agent': 'Homey-Norske-tjenester/1.0',
//             'Accept': 'application/json'
//           }
//         });
//         return response.data.regions;
//       } catch (error) {
//         this.homey.app.dError('Error fetching regions:', error);
//         throw error;
//       }
//     });

//     // Handler for getting water temperatures for a region
//     session.setHandler('getWaterTemperatures', async (regionId) => {
//       try {
//         const response = await axios.get(`https://www.yr.no/api/v0/regions/${regionId}/watertemperatures?language=nb`, {
//           headers: {
//             'User-Agent': 'Homey-Norske-tjenester/1.0',
//             'Accept': 'application/json'
//           }
//         });
//         return response.data;
//       } catch (error) {
//         this.homey.app.dError('Error fetching water temperatures:', error);
//         throw error;
//       }
//     });

//     // Handler for saving selected bathing spot
//     session.setHandler("saveBathingSpot", async (data) => {
//       this.homey.app.dDebug(`Bathing spot selected: ${data.name} (${data.id})`, 'Badetemperatur');
//       session.bathingSpot = {
//         id: data.id,
//         name: data.name,
//         region: data.region,
//         subregion: data.subregion,
//         temperature: data.temperature,
//         time: data.time,
//         position: data.location.position,
//         sourceDisplayName: data.sourceDisplayName || 'yr.no'
//       };
//       return true;
//     });

//     // Handler for listing devices
//     session.setHandler("list_devices", async () => {
//       return await this.onPairListDevices(session);
//     });
//   }

//   async onPairListDevices(session) {
//     let devices = [];

//     if (session.bathingSpot) {
//       let deviceName = `${session.bathingSpot.name} badeplass`;
//       let device = {
//         name: deviceName,
//         data: {
//           id: session.bathingSpot.id
//         },
//         settings: {
//           spotId: session.bathingSpot.id,
//           spotName: session.bathingSpot.name,
//           region: session.bathingSpot.region,
//           subregion: session.bathingSpot.subregion,
//           coordinates: `${session.bathingSpot.position.lat}, ${session.bathingSpot.position.lon}`,
//           sourceDisplayName: session.bathingSpot.sourceDisplayName
//         }
//       };
//       devices.push(device);
//       this.homey.app.dDebug(`Device ready to be added:`, 'Badetemperatur', device);
//     }

//     return devices;
//   }
}

module.exports = Badetemperatur;
