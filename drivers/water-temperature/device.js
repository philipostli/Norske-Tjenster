"use strict"

const { Device } = require("homey")
const axios = require("axios")
const moment = require("moment")
moment.locale("nb")

class Badetemperatur extends Device {
  async onInit() {
    this.homey.app.dDebug("Badetemperatur has been initialized", "Badetemperatur")

    this.spotId = await this.getSetting("bathingspot")

    await this.getTemps()
    this.interval = this.homey.setInterval(async () => {
      await this.getTemps()
    }, 60 * 60 * 1000)

    this.updatedInterval = this.homey.setInterval(async () => {
      await this.updateTimeAgo()
    }, 30 * 1000)
  }

  async getTemps() {
    this.homey.app.dDebug(`Getting temperatures for ${this.getName()}`, "Badetemperatur")
    try {
      // Get the water temperatures for the region
      const regionId = await this.getSetting("region")
      console.log(`Fetching water temperatures for region ID: ${regionId}`)
      const response = await axios.get(`https://www.yr.no/api/v0/regions/${regionId}/watertemperatures?language=nb`, {
        headers: {
          "User-Agent": "Homey-Norske-tjenester/1.0",
          Accept: "application/json",
        },
      })

      const bathingSpot = response.data.find((spot) => spot.id === parseInt(this.spotId))
      if (!bathingSpot) {
        this.homey.app.dError(`Could not find bathing spot ${this.spotId}`, "Badetemperatur")
        return
      }

      this.homey.app.dDebug(`Found bathing spot ${bathingSpot.location.name} (${bathingSpot.id})`, "Badetemperatur")

      this.latestTemps = {
        id: bathingSpot.id,
        name: bathingSpot.location.name,
        region: bathingSpot.location.region.name,
        subregion: bathingSpot.location.subregion.name,
        temperature: bathingSpot.temperature,
        time: bathingSpot.time,
        sourceDisplayName: bathingSpot.sourceDisplayName || "yr.no",
      }

      await this.setCapabilityValue("sensor_watertemp_location", this.latestTemps.name)
      await this.setCapabilityValue("measure_temperature", this.latestTemps.temperature)
      await this.setCapabilityValue("sensor_watertemp_lastUpdate", moment(this.latestTemps.time).fromNow())

      this.homey.app.dDebug(`Temperatures updated for ${this.getName()}`, "Badetemperatur")
      return this.latestTemps
    } catch (error) {
      this.homey.app.dError(`Error getting temperatures: ${error.message}`, "Badetemperatur")
      // Set error states for capabilities
      await this.setCapabilityValue("sensor_watertemp_location", "Kunne ikke hente data")
      await this.setCapabilityValue("measure_temperature", 0)
      await this.setCapabilityValue("sensor_watertemp_lastUpdate", "Ukjent")
    }
  }

  async updateTimeAgo() {
    if (!this.latestTemps) {
      return
    }

    const lastUpdate = this.latestTemps.time
    await this.setCapabilityValue("sensor_watertemp_lastUpdate", moment(lastUpdate).fromNow())

    return
  }

  async onAdded() {
    this.homey.app.dDebug(`${this.getName()} has been added`, "Badetemperatur")
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.homey.app.dDebug(`${this.getName()} settings where changed`, "Badetemperatur")
  }

  async onRenamed(name) {
    this.homey.app.dDebug(`${this.getName()} was renamed`, "Badetemperatur")
  }

  async onDeleted() {
    clearInterval(this.interval)
    clearInterval(this.updatedInterval)

    this.homey.app.dDebug(`${this.getName()} has been deleted`, "Badetemperatur")
  }
}

module.exports = Badetemperatur
