"use strict"

const { Driver } = require("homey")
const Homey = require("homey")
const axios = require("axios")

class Badetemperatur extends Driver {
  async onInit() {
    this.homey.app.dDebug("Badetemperatur has been initialized", "Badetemperatur")
  }

  async onPair(session) {
    session.setHandler("saveBathingSpot", async (data) => {
      this.homey.app.dDebug(`Bathing spot selected: ${data.name} (${data.id})`, "Badetemperatur")
      session.bathingSpot = {
        id: data.id,
        name: data.name,
        county: data.county,
        municipality: data.municipality,
        position: data.position,
        temperature: data.temperature,
        time: data.time,
        sourceDisplayName: data.sourceDisplayName,
      }
      return true
    })

    session.setHandler("list_devices", async () => {
      return await this.onPairListDevices(session)
    })

    session.setHandler("getRegions", async () => {
      return await this.getRegions()
    })

    session.setHandler("getTemperatures", async (region) => {
      return await this.getTemperatures(region)
    })
  }

  async onPairListDevices(session) {
    let devices = []
    if (session.bathingSpot) {
      let deviceName = `${session.bathingSpot.name} badeplass`
      let device = {
        name: deviceName,
        data: {
          id: session.bathingSpot.id,
        },
        settings: {
          spotId: session.bathingSpot.id,
          spotName: session.bathingSpot.name,
          county: session.bathingSpot.county,
          municipality: session.bathingSpot.municipality,
          coordinates: `${session.bathingSpot.position.lat}, ${session.bathingSpot.position.lon}`,
          sourceDisplayName: session.bathingSpot.sourceDisplayName,
        },
      }
      devices.push(device)
      this.homey.app.dDebug(`Devices ready to be added:`, "Badetemperatur", devices)
      return devices
    }
  }

  async getRegions() {
    try {
      const response = await axios.get("https://www.yr.no/api/v0/regions/NO", {
        headers: {
          "User-Agent": "Homey-Norske-tjenester/1.0",
          Accept: "application/json",
        },
      })
      console.log(response.data.regions)
      return response.data.regions
    } catch (error) {
      this.homey.app.dError("Error fetching regions:", error)
      throw error
    }
  }

  async getTemperatures(region) {
    try {
      console.log(`Fetching temperatures for region: ${region}`)
      const response = await axios.get(`https://badetemperaturer.yr.no/api/regions/${region}/watertemperatures`, {
        headers: {
          "User-Agent": "Homey-Norske-tjenester/1.0",
          Accept: "application/json",
          apikey: Homey.env.YR_KEY,
        },
      })
      console.log(response.data)
      return response.data
    } catch (error) {
      this.homey.app.dError("Error fetching temperatures:", error)
      throw error
    }
  }
}

module.exports = Badetemperatur
