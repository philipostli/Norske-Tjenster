'use strict';

const { Driver } = require('homey');

class AirQualityIndex extends Driver {
    async onInit() {
        this.homey.app.dDebug('Air Quality Index has been initialized', 'Air Quality Index');
    }

    async onPair(session) {
        session.setHandler("saveStation", async (data) => {
            this.homey.app.dDebug(`Station selected: ${data.station.name} (${data.id})`, 'Air Quality Index');
            session.aqi = {
                id: data.id,
                name: data.station.name,
                latitude: data.station.latitude,
                longitude: data.station.longitude,
                elevation: data.station.height,
                area: data.station.delomrade.name,
                county: data.station.kommune.name,
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

}

module.exports = AirQualityIndex;
