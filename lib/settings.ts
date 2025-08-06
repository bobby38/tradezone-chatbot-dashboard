// Settings utility functions for persistent storage

export interface SettingsData {
  ai?: {
    provider?: string
    model?: string
  }
  smtp?: {
    fromEmail?: string
    fromName?: string
    host?: string
    port?: string
    user?: string
    pass?: string
    encryption?: string
    useAutoTLS?: boolean
    authentication?: boolean
    forceFromEmail?: boolean
    setReturnPath?: boolean
    testEmail?: string
  }
  general?: {
    apiTimeout?: string
    maxTokens?: string
    temperature?: string
    retryAttempts?: string
    logLevel?: string
    enableAnalytics?: boolean
    enableNotifications?: boolean
  }
}

export class SettingsManager {
  private static userId = 'default' // Can be extended for multi-user support

  static async loadSettings(settingType?: string): Promise<SettingsData> {
    try {
      const params = new URLSearchParams()
      if (settingType) params.append('type', settingType)
      params.append('userId', this.userId)

      const response = await fetch(`/api/settings?${params}`)
      if (!response.ok) {
        throw new Error('Failed to load settings')
      }

      const { settings } = await response.json()
      return settings || {}
    } catch (error) {
      console.error('Error loading settings:', error)
      // Fallback to localStorage if database fails
      return this.loadFromLocalStorage()
    }
  }

  static async saveSetting(settingType: string, settingKey: string, settingValue: any): Promise<boolean> {
    try {
      // Add timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout
      
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settingType,
          settingKey,
          settingValue,
          userId: this.userId
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error('Failed to save setting')
      }

      // Also save to localStorage as backup
      this.saveToLocalStorage(settingType, settingKey, settingValue)
      return true
    } catch (error) {
      console.error('Error saving setting:', error)
      
      // Check if it's an abort error (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Save operation timed out, falling back to localStorage')
      }
      
      // Fallback to localStorage
      this.saveToLocalStorage(settingType, settingKey, settingValue)
      return false
    }
  }

  static async saveAllSettings(settings: SettingsData): Promise<boolean> {
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings,
          userId: this.userId
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save settings')
      }

      // Also save to localStorage as backup
      Object.entries(settings).forEach(([settingType, typeSettings]) => {
        Object.entries(typeSettings).forEach(([key, value]) => {
          this.saveToLocalStorage(settingType, key, value)
        })
      })

      return true
    } catch (error) {
      console.error('Error saving all settings:', error)
      return false
    }
  }

  // Fallback methods for localStorage
  private static loadFromLocalStorage(): SettingsData {
    const settings: SettingsData = {}

    try {
      // Load AI settings
      const aiProvider = localStorage.getItem('ai-provider')
      const aiModel = localStorage.getItem('ai-model')
      if (aiProvider || aiModel) {
        settings.ai = {
          provider: aiProvider || undefined,
          model: aiModel || undefined
        }
      }

      // Load SMTP settings
      const smtpSettings = localStorage.getItem('smtp-settings')
      if (smtpSettings) {
        const parsed = JSON.parse(smtpSettings)
        // Ensure we don't have nested config objects
        settings.smtp = { config: parsed }
      }

      // Load general settings
      const generalSettings = localStorage.getItem('general-settings')
      if (generalSettings) {
        settings.general = JSON.parse(generalSettings)
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error)
    }

    return settings
  }

  private static saveToLocalStorage(settingType: string, settingKey: string, settingValue: any): void {
    try {
      if (settingType === 'ai') {
        localStorage.setItem(`ai-${settingKey}`, settingValue)
      } else {
        const existing = localStorage.getItem(`${settingType}-settings`)
        const settings = existing ? JSON.parse(existing) : {}
        settings[settingKey] = settingValue
        localStorage.setItem(`${settingType}-settings`, JSON.stringify(settings))
      }
    } catch (error) {
      console.error('Error saving to localStorage:', error)
    }
  }

  // Migration helper to move existing localStorage data to database
  static async migrateFromLocalStorage(): Promise<void> {
    // Temporarily disable migration to prevent recursive config issues
    console.log('Migration temporarily disabled to prevent recursive config nesting')
    localStorage.setItem('settings-migrated', 'true')
    return
    
    // Check if migration has already been done
    const migrationFlag = localStorage.getItem('settings-migrated')
    if (migrationFlag === 'true') {
      return // Already migrated, skip
    }
    
    const localSettings = this.loadFromLocalStorage()
    if (Object.keys(localSettings).length > 0) {
      console.log('Migrating settings from localStorage to database...')
      await this.saveAllSettings(localSettings)
      
      // Mark migration as completed
      localStorage.setItem('settings-migrated', 'true')
      console.log('Migration completed')
    }
  }
}
