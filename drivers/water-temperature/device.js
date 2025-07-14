"use strict"

const { Device } = require("homey")
const Homey = require("homey")
const axios = require("axios")
const moment = require("moment")
moment.locale("nb")

class Badetemperatur extends Device {
  async onInit() {
    this.homey.app.dDebug("Badetemperatur has been initialized", "Badetemperatur")

    this.spotId = await this.getSetting("spotId")

    await this.getTemps()
    this.interval = this.homey.setInterval(async () => {
      await this.getTemps()
    }, 60 * 60 * 1000)

    this.updatedInterval = this.homey.setInterval(async () => {
      await this.updateTimeAgo()
    }, 30 * 1000)
  }

  async getTemps() {
    const settings = await this.getSettings()
    console.log(settings)
    this.homey.app.dDebug(`Getting temperatures for ${this.getName()} (${this.spotId})`, "Badetemperatur")
    try {
      // Get the water temperatures for the bathing spot
      const response = await axios.get(`https://badetemperaturer.yr.no/api/locations/${this.spotId}/watertemperatures`, {
        headers: {
          "User-Agent": "Homey-Norske-tjenester/1.0",
          apikey: Homey.env.YR_KEY,
          Accept: "application/json",
        },
      })

      const bathingSpot = response.data[0]
      if (!bathingSpot) {
        this.homey.app.dError(`Could not find bathing spot ${this.spotId}`, "Badetemperatur")
        return
      }

      this.homey.app.dDebug(`Found bathing spot ${this.getName()} (${this.spotId})`, "Badetemperatur")

      this.latestTemps = {
        ...settings,
        temperature: bathingSpot.temperature,
        time: bathingSpot.time,
      }

      await this.setCapabilityValue("sensor_watertemp_location", settings.spotName)
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
