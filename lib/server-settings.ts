// Server-side settings with file persistence
// This works around the localStorage limitation on the server side

import fs from 'fs'
import path from 'path'

interface ServerSettings {
  smtp?: {
    config?: {
      host?: string
      port?: string
      user?: string
      pass?: string
      fromEmail?: string
      fromName?: string
      [key: string]: any
    }
    [key: string]: any
  }
  [key: string]: any
}

const SETTINGS_FILE = path.join(process.cwd(), '.server-settings.json')

export class ServerSettingsManager {
  private static loadFromFile(): ServerSettings {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const data = fs.readFileSync(SETTINGS_FILE, 'utf8')
        return JSON.parse(data)
      }
    } catch (error) {
      console.error('Error loading server settings file:', error)
    }
    return {}
  }

  private static saveToFile(settings: ServerSettings) {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
    } catch (error) {
      console.error('Error saving server settings file:', error)
    }
  }

  static setSettings(settingType: string, settingKey: string, settingValue: any) {
    const settings = this.loadFromFile()
    if (!settings[settingType]) {
      settings[settingType] = {}
    }
    settings[settingType][settingKey] = settingValue
    this.saveToFile(settings)
    console.log(`Server settings updated: ${settingType}.${settingKey}`)
  }

  static getSettings(settingType?: string): any {
    const settings = this.loadFromFile()
    if (settingType) {
      return settings[settingType] || {}
    }
    return settings
  }

  static getAllSettings(): ServerSettings {
    return this.loadFromFile()
  }

  static clearSettings() {
    this.saveToFile({})
  }
}