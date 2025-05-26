'use strict';

const { Driver } = require('homey');

class LightningDriver extends Driver {
    async onInit() {
        this.homey.app.dDebug('LightningDriver has been initialized', 'LightningDriver');
    }

    async onPairListDevices() {
        return [
            {
                name: this.homey.__({ en: 'Lightning Alert', no: 'Lynvarsel' }),
                data: {
                    id: 'lightning-alert',
                },
                settings: {
                    dangerRadius: 10,
                },
            },
        ]
    }

}

module.exports = LightningDriver;
