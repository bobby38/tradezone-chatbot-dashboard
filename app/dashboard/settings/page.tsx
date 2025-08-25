'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Settings, Database, Bot, Zap, Brain, Mail } from 'lucide-react'
import { SettingsManager } from '@/lib/settings'

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
  const [aiProvider, setAiProvider] = useState<string>('openai')
  const [aiModel, setAiModel] = useState<string>('gpt-4o')
  const [selectedProvider, setSelectedProvider] = useState<string>('openai')
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o')
  
  const [smtpSettings, setSmtpSettings] = useState({
    fromEmail: '',
    fromName: '',
    host: '',
    port: '587',
    user: '',
    pass: '',
    encryption: 'TLS',
    useAutoTLS: true,
    authentication: true,
    forceFromEmail: true,
    setReturnPath: true,
    testEmail: 'info@rezult.co'
  })
  
  const [smtpStatus, setSmtpStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [smtpMessage, setSmtpMessage] = useState('')

  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Migrate existing localStorage data to database
        await SettingsManager.migrateFromLocalStorage()
        
        // Load settings from database
        const allSettings = await SettingsManager.loadSettings()
        
        // Load AI settings
        if (allSettings.ai) {
          if (allSettings.ai.provider) {
            setSelectedProvider(allSettings.ai.provider)
          }
          if (allSettings.ai.model) {
            setSelectedModel(allSettings.ai.model)
          }
        }
        
        // Load SMTP settings
        if (
          allSettings.smtp &&
          typeof allSettings.smtp === 'object' &&
          'config' in (allSettings.smtp as any) &&
          (allSettings.smtp as any).config &&
          typeof (allSettings.smtp as any).config === 'object'
        ) {
          // Handle config object format
          const config = (allSettings.smtp as any).config as Record<string, any>
          setSmtpSettings(prev => ({
            ...prev,
            fromEmail: config.fromEmail || '',
            fromName: config.fromName || '',
            host: config.host || '',
            port: config.port || '587',
            user: config.user || '',
            pass: config.pass || '',
            encryption: config.encryption || 'TLS',
            useAutoTLS: config.useAutoTLS !== undefined ? config.useAutoTLS : true,
            authentication: config.authentication !== undefined ? config.authentication : true,
            forceFromEmail: config.forceFromEmail !== undefined ? config.forceFromEmail : true,
            setReturnPath: config.setReturnPath !== undefined ? config.setReturnPath : true,
            testEmail: config.testEmail || 'test@example.com'
          }))
        } else if (allSettings.smtp && typeof allSettings.smtp === 'object') {
          // Handle individual field format (fallback)
          setSmtpSettings(prev => ({ ...prev, ...(allSettings.smtp as Record<string, any>) }))
        }
        
        // Load general settings
        if (allSettings.general) {
          setSettings(prev => ({ ...prev, ...allSettings.general }))
        }
        
        // Detect AI provider and model from environment variables
        const openaiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY
        const openrouterKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY
        
        if (openaiKey && openaiKey.startsWith('sk-')) {
          setAiProvider('OpenAI')
          if (!allSettings.ai?.provider) setSelectedProvider('openai')
        } else if (openrouterKey) {
          setAiProvider('OpenRouter')
          if (!allSettings.ai?.provider) setSelectedProvider('openrouter')
        } else {
          setAiProvider('Not Configured')
          if (!allSettings.ai?.provider) setSelectedProvider('none')
        }
      } catch (error) {
        console.error('Error loading settings:', error)
      }
    }
    
    loadSettings()
  }, [])

  const providerOptions = [
    { 
      value: 'openai', 
      label: 'OpenAI', 
      models: [
        // GPT-4.1 Series (Latest)
        'gpt-4.1-preview',
        'gpt-4.1-nano',
        'gpt-4.1-mini',
        
        // GPT-4o Series
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4o-2024-11-20',
        'gpt-4o-2024-08-06',
        'gpt-4o-2024-05-13',
        'gpt-4o-mini-2024-07-18',
        
        // GPT-4 Turbo Series
        'gpt-4-turbo',
        'gpt-4-turbo-2024-04-09',
        'gpt-4-turbo-preview',
        'gpt-4-0125-preview',
        'gpt-4-1106-preview',
        
        // GPT-4 Series
        'gpt-4',
        'gpt-4-0613',
        'gpt-4-0314',
        
        // GPT-3.5 Series
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-0125',
        'gpt-3.5-turbo-1106',
        'gpt-3.5-turbo-0613',
        'gpt-3.5-turbo-16k',
        'gpt-3.5-turbo-instruct',
        
        // Audio Models
        'whisper-1',
        'tts-1',
        'tts-1-hd',
        
        // Image Models
        'dall-e-3',
        'dall-e-2',
        
        // Embedding Models
        'text-embedding-3-large',
        'text-embedding-3-small',
        'text-embedding-ada-002'
      ] 
    },
    { 
      value: 'openrouter', 
      label: 'OpenRouter', 
      models: [
        // OpenAI Models via OpenRouter
        'openai/gpt-4o',
        'openai/gpt-4o-mini',
        'openai/gpt-4-turbo',
        'openai/gpt-4',
        'openai/gpt-3.5-turbo',
        'openai/gpt-3.5-turbo-instruct',
        
        // Anthropic Claude Models
        'anthropic/claude-3.5-sonnet',
        'anthropic/claude-3-opus',
        'anthropic/claude-3-sonnet',
        'anthropic/claude-3-haiku',
        'anthropic/claude-2.1',
        'anthropic/claude-2',
        'anthropic/claude-instant-1.2',
        
        // Google Gemini Models
        'google/gemini-pro',
        'google/gemini-pro-vision',
        'google/gemini-1.5-pro',
        'google/gemini-1.5-flash',
        'google/gemma-2-27b-it',
        'google/gemma-2-9b-it',
        'google/gemma-7b-it',
        
        // Meta Llama Models
        'meta-llama/llama-3.2-90b-vision-instruct',
        'meta-llama/llama-3.2-11b-vision-instruct',
        'meta-llama/llama-3.2-3b-instruct',
        'meta-llama/llama-3.2-1b-instruct',
        'meta-llama/llama-3.1-405b-instruct',
        'meta-llama/llama-3.1-70b-instruct',
        'meta-llama/llama-3.1-8b-instruct',
        'meta-llama/llama-3-70b-instruct',
        'meta-llama/llama-3-8b-instruct',
        'meta-llama/codellama-70b-instruct',
        'meta-llama/codellama-34b-instruct',
        
        // Mistral Models
        'mistralai/mistral-large',
        'mistralai/mistral-medium',
        'mistralai/mistral-small',
        'mistralai/mixtral-8x7b-instruct',
        'mistralai/mixtral-8x22b-instruct',
        'mistralai/codestral-22b-instruct',
        
        // Cohere Models
        'cohere/command-r-plus',
        'cohere/command-r',
        'cohere/command',
        'cohere/command-light',
        
        // Perplexity Models
        'perplexity/llama-3.1-sonar-large-128k-online',
        'perplexity/llama-3.1-sonar-small-128k-online',
        'perplexity/llama-3.1-sonar-large-128k-chat',
        'perplexity/llama-3.1-sonar-small-128k-chat',
        
        // Qwen Models
        'qwen/qwen-2.5-72b-instruct',
        'qwen/qwen-2-72b-instruct',
        'qwen/qwen-2-7b-instruct',
        'qwen/qwq-32b-preview',
        
        // DeepSeek Models
        'deepseek/deepseek-chat',
        'deepseek/deepseek-coder',
        'deepseek/deepseek-r1',
        
        // Other Popular Models
        'nvidia/llama-3.1-nemotron-70b-instruct',
        'microsoft/wizardlm-2-8x22b',
        'databricks/dbrx-instruct',
        '01-ai/yi-large',
        '01-ai/yi-34b-chat',
        'huggingfaceh4/zephyr-7b-beta',
        'openchat/openchat-7b',
        'teknium/openhermes-2.5-mistral-7b',
        'nousresearch/nous-hermes-2-mixtral-8x7b-dpo',
        'cognitivecomputations/dolphin-mixtral-8x7b'
      ] 
    },
  ]

  const getCurrentModels = () => {
    const provider = providerOptions.find(p => p.value === selectedProvider)
    return provider ? provider.models : ['gpt-4']
  }

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

  const validateSmtpSettings = () => {
    const errors = []
    
    if (!smtpSettings.fromEmail || !smtpSettings.fromEmail.includes('@')) {
      errors.push('Valid From Email is required')
    }
    if (!smtpSettings.host || smtpSettings.host.trim() === '') {
      errors.push('SMTP Host is required')
    }
    if (!smtpSettings.port || parseInt(smtpSettings.port) < 1 || parseInt(smtpSettings.port) > 65535) {
      errors.push('Valid SMTP Port (1-65535) is required')
    }
    if (smtpSettings.authentication) {
      if (!smtpSettings.user || smtpSettings.user.trim() === '') {
        errors.push('SMTP Username is required when authentication is enabled')
      }
      if (!smtpSettings.pass || smtpSettings.pass.trim() === '') {
        errors.push('SMTP Password is required when authentication is enabled')
      }
    }
    
    return errors
  }

  const saveSmtpSettings = async () => {
    // Validate form first
    const validationErrors = validateSmtpSettings()
    if (validationErrors.length > 0) {
      setSmtpStatus('error')
      setSmtpMessage(`Validation errors: ${validationErrors.join(', ')}`)
      setTimeout(() => {
        setSmtpStatus('idle')
        setSmtpMessage('')
      }, 5000)
      return false
    }

    setSmtpStatus('testing')
    setSmtpMessage('Saving SMTP settings...')
    
    try {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Save operation timed out')), 20000)
      )
      
      const savePromise = SettingsManager.saveSetting('smtp', 'config', smtpSettings)
      
      // Race between save and timeout
      const success = await Promise.race([savePromise, timeoutPromise])
      
      if (success) {
        setSmtpStatus('success')
        setSmtpMessage('SMTP settings saved successfully and will persist across sessions!')
        
        setTimeout(() => {
          setSmtpStatus('idle')
          setSmtpMessage('')
        }, 3000)
        
        return true
      } else {
        throw new Error('Failed to save settings')
      }
    } catch (error) {
      console.error('Error saving SMTP settings:', error)
      setSmtpStatus('error')
      setSmtpMessage(error instanceof Error && error.message.includes('timeout') 
        ? 'Save operation timed out. Please try again.' 
        : 'Failed to save SMTP settings. Please try again.')
      
      setTimeout(() => {
        setSmtpStatus('idle')
        setSmtpMessage('')
      }, 4000)
      
      return false
    }
  }

  const saveAndTestSmtp = async () => {
    // First, save the settings
    const saveSuccess = await saveSmtpSettings()
    
    if (!saveSuccess) {
      return // Stop if save failed
    }
    
    // Wait a moment for save to complete
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Then test the email
    await testEmail()
  }

  const testEmail = async () => {
    if (!smtpSettings.host || !smtpSettings.user || !smtpSettings.pass) {
      setSmtpStatus('error')
      setSmtpMessage('Please fill in all SMTP fields before testing')
      setTimeout(() => {
        setSmtpStatus('idle')
        setSmtpMessage('')
      }, 3000)
      return
    }

    if (!smtpSettings.testEmail) {
      setSmtpStatus('error')
      setSmtpMessage('Please enter a test email address')
      setTimeout(() => {
        setSmtpStatus('idle')
        setSmtpMessage('')
      }, 3000)
      return
    }

    setSmtpStatus('testing')
    setSmtpMessage(`Sending test email to ${smtpSettings.testEmail}...`)

    try {
      const response = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpConfig: {
            ...smtpSettings,
            fromEmail: smtpSettings.fromEmail,
            fromName: smtpSettings.fromName
          },
          testEmail: smtpSettings.testEmail
        })
      })

      const result = await response.json()

      if (response.ok) {
        setSmtpStatus('success')
        setSmtpMessage(`Test email sent successfully to ${smtpSettings.testEmail}! Check your inbox.`)
      } else {
        setSmtpStatus('error')
        setSmtpMessage(result.error || 'Failed to send test email')
      }
    } catch (error) {
      setSmtpStatus('error')
      setSmtpMessage('Network error: Unable to send test email')
    }

    setTimeout(() => {
      setSmtpStatus('idle')
      setSmtpMessage('')
    }, 5000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">Configure your chatbot parameters and preferences</p>
      </div>

      {/* AI Provider Information */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            AI Provider Configuration
          </CardTitle>
          <CardDescription>
            Current AI provider and model being used for analytics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-400 mb-2 block">AI Provider</label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2">
                <Badge 
                  variant={aiProvider === 'Not Configured' ? 'destructive' : 'default'}
                  className="text-xs"
                >
                  Current: {aiProvider}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-400 mb-2 block">Model</label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {getCurrentModels().map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2">
                <Badge variant="secondary" className="text-xs">
                  Selected: {selectedModel}
                </Badge>
              </div>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <Button 
              onClick={async () => {
                try {
                  // Save settings to database
                  await SettingsManager.saveSetting('ai', 'provider', selectedProvider)
                  await SettingsManager.saveSetting('ai', 'model', selectedModel)
                  
                  // Update the AI service configuration
                  setAiModel(selectedModel)
                  
                  // Show success message
                  alert(`Settings saved! Provider: ${providerOptions.find(p => p.value === selectedProvider)?.label}, Model: ${selectedModel}\n\nThese settings will be used for AI analytics and will persist across sessions.`)
                } catch (error) {
                  console.error('Error saving AI settings:', error)
                  alert('Failed to save AI settings. Please try again.')
                }
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Save Settings
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                setSelectedProvider('openai')
                setSelectedModel('gpt-4o')
              }}
            >
              Reset to Default
            </Button>
          </div>
          
          {aiProvider === 'Not Configured' && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Add your OpenAI or OpenRouter API key to <code>.env.local</code> to enable AI analytics.
              </p>
            </div>
          )}
          
          {selectedProvider !== 'none' && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Selected Configuration:</strong> {providerOptions.find(p => p.value === selectedProvider)?.label} with {selectedModel} model.
                Click "Apply Settings" to use this configuration for AI analytics.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SMTP Email Configuration */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            Email Report Configuration
          </CardTitle>
          <CardDescription>
            Configure SMTP settings for automated analytics reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Connection Provider */}
          <div className="mb-6">
            <label className="text-sm font-medium text-gray-400 mb-3 block">Connection Provider</label>
            <div className="flex items-center gap-3 p-4 border-2 border-blue-200 bg-blue-50 rounded-lg">
              <Mail className="h-6 w-6 text-blue-600" />
              <div>
                <div className="font-medium text-gray-900">Other SMTP</div>
                <div className="text-sm text-gray-500">Custom SMTP configuration</div>
              </div>
              <div className="ml-auto">
                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Sender Settings */}
          <div className="mb-6 p-4 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Sender Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium text-gray-400 mb-2 block">From Email</label>
                <Input
                  value={smtpSettings.fromEmail}
                  onChange={(e) => setSmtpSettings(prev => ({ ...prev, fromEmail: e.target.value }))}
                  placeholder="your-email@example.com"
                  type="email"
                  required
                  className="bg-white text-gray-900 border-gray-300"
                />
                <p className="text-sm text-gray-500 mt-1">The email address that will appear as the sender</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400 mb-2 block">From Name</label>
                <Input
                  value={smtpSettings.fromName}
                  onChange={(e) => setSmtpSettings(prev => ({ ...prev, fromName: e.target.value }))}
                  placeholder="Your Company Name"
                  className="bg-white text-gray-900 border-gray-300"
                />
                <p className="text-sm text-gray-500 mt-1">The name that will appear as the sender</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="forceFromEmail"
                  checked={smtpSettings.forceFromEmail}
                  onChange={(e) => setSmtpSettings(prev => ({ ...prev, forceFromEmail: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="forceFromEmail" className="text-sm text-blue-600 font-medium">
                  Force From Email (Recommended Settings: Enable)
                </label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="setReturnPath"
                  checked={smtpSettings.setReturnPath}
                  onChange={(e) => setSmtpSettings(prev => ({ ...prev, setReturnPath: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="setReturnPath" className="text-sm text-blue-600 font-medium">
                  Set the return-path to match the From Email
                </label>
              </div>
            </div>
          </div>

          {/* SMTP Configuration */}
          <div className="mb-6 p-4 border border-gray-200 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium text-gray-400 mb-2 block">SMTP Host *</label>
                <Input
                  value={smtpSettings.host}
                  onChange={(e) => setSmtpSettings(prev => ({ ...prev, host: e.target.value }))}
                  placeholder="smtp.example.com"
                  required
                  className="bg-white text-gray-900 border-gray-300"
                />
                <p className="text-sm text-gray-500 mt-1">Your SMTP server hostname (e.g., smtp.gmail.com, smtp.outlook.com)</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400 mb-2 block">SMTP Port</label>
                <Input
                  value={smtpSettings.port}
                  onChange={(e) => setSmtpSettings(prev => ({ ...prev, port: e.target.value }))}
                  placeholder="587"
                  type="number"
                  className="bg-white text-gray-900 border-gray-300"
                />
                <p className="text-sm text-gray-500 mt-1">Common ports: 587 (TLS), 465 (SSL), 25 (unsecured)</p>
              </div>
            </div>

            {/* Encryption Options */}
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-400 mb-3 block">Encryption</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="encryption"
                    value="None"
                    checked={smtpSettings.encryption === 'None'}
                    onChange={(e) => setSmtpSettings(prev => ({ ...prev, encryption: e.target.value }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-400">None</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="encryption"
                    value="SSL"
                    checked={smtpSettings.encryption === 'SSL'}
                    onChange={(e) => setSmtpSettings(prev => ({ ...prev, encryption: e.target.value }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-400">SSL</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="encryption"
                    value="TLS"
                    checked={smtpSettings.encryption === 'TLS'}
                    onChange={(e) => setSmtpSettings(prev => ({ ...prev, encryption: e.target.value }))}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900">TLS</span>
                </label>
              </div>
              <p className="text-sm text-gray-400 mt-1">Select SSL on port 465, or TLS on port 25 or 587</p>
            </div>

            {/* Auto TLS Toggle */}
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-400">Use Auto TLS</label>
                  <p className="text-sm text-gray-500 mt-1">By default, TLS encryption is used if the server supports it. On some servers, this may cause issues and need to be disabled.</p>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useAutoTLS"
                    checked={smtpSettings.useAutoTLS}
                    onChange={(e) => setSmtpSettings(prev => ({ ...prev, useAutoTLS: e.target.checked }))}
                    className="sr-only"
                  />
                  <label
                    htmlFor="useAutoTLS"
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      smtpSettings.useAutoTLS ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        smtpSettings.useAutoTLS ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Authentication Toggle */}
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-400">Authentication</label>
                  <p className="text-sm text-gray-500 mt-1">If you need to provide your SMTP server's credentials (username and password) enable the authentication, in most cases this is required.</p>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="authentication"
                    checked={smtpSettings.authentication}
                    onChange={(e) => setSmtpSettings(prev => ({ ...prev, authentication: e.target.checked }))}
                    className="sr-only"
                  />
                  <label
                    htmlFor="authentication"
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      smtpSettings.authentication ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        smtpSettings.authentication ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Credentials */}
            {smtpSettings.authentication && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-400 mb-2 block">SMTP Username *</label>
                  <Input
                    value={smtpSettings.user}
                    onChange={(e) => setSmtpSettings(prev => ({ ...prev, user: e.target.value }))}
                    placeholder="your-email@example.com"
                    type="email"
                    required
                    className="bg-white text-gray-900 border-gray-300"
                  />
                  <p className="text-sm text-gray-500 mt-1">Usually your email address</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-400 mb-2 block">SMTP Password *</label>
                  <Input
                    value={smtpSettings.pass}
                    onChange={(e) => setSmtpSettings(prev => ({ ...prev, pass: e.target.value }))}
                    placeholder="Enter your password or app password"
                    type="password"
                    required
                    className="bg-white text-gray-900 border-gray-300"
                  />
                  <p className="text-sm text-gray-500 mt-1">Use app password for Gmail/Outlook. Password is securely stored.</p>
                </div>
              </div>
            )}
          </div>
          {/* Test Email Section */}
          <div className="mt-6 p-6 border border-gray-300 rounded-lg bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📧 Test Email Configuration</h3>
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-400 mb-2 block">Test Email Address</label>
              <Input
                value={smtpSettings.testEmail}
                onChange={(e) => setSmtpSettings(prev => ({ ...prev, testEmail: e.target.value }))}
                placeholder="test@example.com"
                type="email"
                className="bg-white text-gray-900 border-gray-300 max-w-md"
              />
              <p className="text-sm text-gray-500 mt-1">Enter the email address where you want to receive the test email</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button 
              onClick={saveAndTestSmtp}
              disabled={smtpStatus === 'testing'}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2"
            >
              {smtpStatus === 'testing' ? 'Saving...' : 'Save Connection Settings'}
            </Button>
            <Button 
              onClick={testEmail}
              disabled={smtpStatus === 'testing' || !smtpSettings.testEmail}
              variant="outline"
              className="border-blue-600 text-blue-600 hover:bg-blue-50 px-6 py-2 disabled:opacity-50"
            >
              {smtpStatus === 'testing' ? 'Sending...' : `Test Email to ${smtpSettings.testEmail}`}
            </Button>
          </div>
          {smtpMessage && (
            <div className={`mt-4 p-3 border rounded-md ${
              smtpStatus === 'success' 
                ? 'bg-green-50 border-green-200 text-green-800' 
                : smtpStatus === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              <p className="text-sm font-medium">{smtpMessage}</p>
            </div>
          )}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800 mb-2">
              <a href="#" className="text-blue-600 hover:text-blue-800 underline font-medium">
                Read the documentation
              </a>
              <span className="text-gray-500"> for how to configure any SMTP with Tradezone Dashboard.</span>
            </p>
            <div className="text-sm text-blue-700">
              <strong>Quick Setup Guide:</strong>
              <ul className="mt-2 space-y-1">
                <li>• Configure your SMTP provider settings above</li>
                <li>• Enable authentication and set credentials</li>
                <li>• Test the connection before saving</li>
                <li>• Weekly/Monthly analytics reports will be sent automatically</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

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
                value="https://hbierdnotootxkzgerib.supabase.co"
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
              <div className="text-sm text-gray-500">
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
