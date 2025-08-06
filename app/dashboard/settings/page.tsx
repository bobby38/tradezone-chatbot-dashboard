'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Settings, Database, Bot, Zap } from 'lucide-react'

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    apiTimeout: '30',
    maxTokens: '2000',
    temperature: '0.7',
    retryAttempts: '3',
    logLevel: 'info',
    enableAnalytics: true,
    enableNotifications: true
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    setSaving(false)
    alert('Settings saved successfully!')
  }

  const handleInputChange = (key: string, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Configure your chatbot parameters and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Chatbot Parameters
            </CardTitle>
            <CardDescription>
              Configure AI model behavior and response settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="temperature" className="text-sm font-medium">
                Temperature (0.0 - 1.0)
              </label>
              <Input
                id="temperature"
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={settings.temperature}
                onChange={(e) => handleInputChange('temperature', e.target.value)}
                placeholder="0.7"
              />
              <p className="text-xs text-gray-500">
                Controls randomness in responses. Lower values = more focused, higher values = more creative.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="maxTokens" className="text-sm font-medium">
                Max Tokens
              </label>
              <Input
                id="maxTokens"
                type="number"
                value={settings.maxTokens}
                onChange={(e) => handleInputChange('maxTokens', e.target.value)}
                placeholder="2000"
              />
              <p className="text-xs text-gray-500">
                Maximum length of generated responses.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="apiTimeout" className="text-sm font-medium">
                API Timeout (seconds)
              </label>
              <Input
                id="apiTimeout"
                type="number"
                value={settings.apiTimeout}
                onChange={(e) => handleInputChange('apiTimeout', e.target.value)}
                placeholder="30"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="retryAttempts" className="text-sm font-medium">
                Retry Attempts
              </label>
              <Input
                id="retryAttempts"
                type="number"
                min="1"
                max="5"
                value={settings.retryAttempts}
                onChange={(e) => handleInputChange('retryAttempts', e.target.value)}
                placeholder="3"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              System Configuration
            </CardTitle>
            <CardDescription>
              Database and logging configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="logLevel" className="text-sm font-medium">
                Log Level
              </label>
              <select
                id="logLevel"
                value={settings.logLevel}
                onChange={(e) => handleInputChange('logLevel', e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="error">Error</option>
                <option value="warn">Warning</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="enableAnalytics" className="text-sm font-medium">
                    Enable Analytics
                  </label>
                  <p className="text-xs text-gray-500">
                    Collect usage statistics and performance metrics
                  </p>
                </div>
                <input
                  id="enableAnalytics"
                  type="checkbox"
                  checked={settings.enableAnalytics}
                  onChange={(e) => handleInputChange('enableAnalytics', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="enableNotifications" className="text-sm font-medium">
                    Enable Notifications
                  </label>
                  <p className="text-xs text-gray-500">
                    Receive alerts for system events and errors
                  </p>
                </div>
                <input
                  id="enableNotifications"
                  type="checkbox"
                  checked={settings.enableNotifications}
                  onChange={(e) => handleInputChange('enableNotifications', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              n8n Integration
            </CardTitle>
            <CardDescription>
              Configure n8n workflow integration settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="n8nWebhook" className="text-sm font-medium">
                Webhook URL
              </label>
              <Input
                id="n8nWebhook"
                type="url"
                placeholder="https://your-n8n-instance.com/webhook/..."
                disabled
                className="bg-gray-50"
              />
              <p className="text-xs text-gray-500">
                Webhook URL is configured in your n8n workflow
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="workflowStatus" className="text-sm font-medium">
                Workflow Status
              </label>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-green-600">Connected</span>
              </div>
            </div>

            <div className="pt-2">
              <Button variant="outline" className="w-full" disabled>
                Test Connection
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supabase Configuration</CardTitle>
            <CardDescription>
              Database connection and table settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Database URL
              </label>
              <Input
                value="https://jvkmxtbckpfwypnbubdy.supabase.co"
                disabled
                className="bg-gray-50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Connection Status
              </label>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-green-600">Connected</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Tables
              </label>
              <div className="text-sm text-gray-600">
                <div>• chat_logs</div>
                <div>• users</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="px-8">
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
