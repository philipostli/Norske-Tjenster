'use strict';

const { Driver } = require('homey');

class PollenForecast extends Driver {
    async onInit() {
        this.homey.app.dDebug('PollenForecast has been initialized', 'PollenForecast');
    }

    async onPairListDevices() {
        let coords = {};
        coords.lat = this.homey.geolocation.getLatitude();
        coords.lng = this.homey.geolocation.getLongitude();
        return [
            {
                name: 'Pollenvarsel',
                data: {
                    id: 'pollenforecast',
                    lat: coords.lat,
                    lng: coords.lng,
                },
            },
        ];
    }

}

module.exports = PollenForecast;
