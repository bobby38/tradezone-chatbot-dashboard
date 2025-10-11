'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Eye, Save, RotateCcw } from 'lucide-react';

const DEFAULT_ORG_ID = '765e1172-b666-471f-9b42-f80c9b5006de';

export default function WidgetConfigPage() {
  const [config, setConfig] = useState({
    enabled: true,
    autoOpen: true,
    position: 'bottom-right',
    primaryColor: '#8b5cf6',
    secondaryColor: '#6d28d9',
    greeting: 'Welcome to TradeZone!',
    subGreeting: 'Ask me about products, prices, trade-ins, or store information',
    botName: 'Izacc',
    placeholder: 'Ask about products, prices, trade-ins...',
    videoUrl: 'https://videostream44.b-cdn.net/tradezone-welcome-avatar-2.mp4',
    enableVoice: true,
    enableVideo: true,
    customCSS: ''
  });

  const [embedCode, setEmbedCode] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const supabase = createClient();

  const loadConfig = useCallback(async () => {
    const { data } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', DEFAULT_ORG_ID)
      .single();

    if (data?.settings?.widget) {
      setConfig(prev => ({ ...prev, ...data.settings.widget }));
    }
  }, [supabase]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const generateEmbedCode = useCallback(() => {
    if (typeof window === 'undefined') return;

    const code = `<!-- TradeZone Chat Widget -->
<script src="${window.location.origin}/widget/tradezone-persistent.js"></script>
<script>
  TradeZonePersistent.init({
    apiUrl: '${window.location.origin}',
    videoUrl: '${config.videoUrl}',
    greeting: '${config.greeting}',
    subGreeting: '${config.subGreeting}',
    botName: '${config.botName}',
    placeholder: '${config.placeholder}',
    primaryColor: '${config.primaryColor}',
    secondaryColor: '${config.secondaryColor}',
    autoOpen: ${config.autoOpen},
    enableVoice: ${config.enableVoice},
    enableVideo: ${config.enableVideo},
    position: '${config.position}'${config.customCSS ? `,
    customCSS: \`${config.customCSS}\`` : ''}
  });
</script>`;
    setEmbedCode(code);
  }, [config]);

  useEffect(() => {
    generateEmbedCode();
  }, [generateEmbedCode]);

  const saveConfig = async () => {
    setSaving(true);
    
    const { data: org } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', DEFAULT_ORG_ID)
      .single();

    const updatedSettings = {
      ...org?.settings,
      widget: config
    };

    await supabase
      .from('organizations')
      .update({ settings: updatedSettings })
      .eq('id', DEFAULT_ORG_ID);

    setSaving(false);
    alert('Widget configuration saved!');
  };

  const resetToDefaults = () => {
    if (confirm('Reset to default settings?')) {
      setConfig({
        enabled: true,
        autoOpen: true,
        position: 'bottom-right',
        primaryColor: '#8b5cf6',
        secondaryColor: '#6d28d9',
        greeting: 'Welcome to TradeZone!',
        subGreeting: 'Ask me about products, prices, trade-ins, or store information',
        botName: 'Izacc',
        placeholder: 'Ask about products, prices, trade-ins...',
        videoUrl: 'https://videostream44.b-cdn.net/tradezone-welcome-avatar-2.mp4',
        enableVoice: true,
        enableVideo: true,
        customCSS: ''
      });
    }
  };

  const copyEmbedCode = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const refreshPreview = () => {
    setPreviewKey(prev => prev + 1);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Widget Configuration</h1>
        <p className="text-muted-foreground">
          Customize your chat widget appearance and behavior
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <div className="space-y-6">
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            {/* General Settings */}
            <TabsContent value="general" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>General Settings</CardTitle>
                  <CardDescription>Basic widget configuration</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="enabled">Enable Widget</Label>
                    <Switch
                      id="enabled"
                      checked={config.enabled}
                      onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="autoOpen">Auto Open on Load</Label>
                    <Switch
                      id="autoOpen"
                      checked={config.autoOpen}
                      onCheckedChange={(checked) => setConfig({ ...config, autoOpen: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="enableVoice">Enable Voice Chat</Label>
                    <Switch
                      id="enableVoice"
                      checked={config.enableVoice}
                      onCheckedChange={(checked) => setConfig({ ...config, enableVoice: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="enableVideo">Enable Video Avatar</Label>
                    <Switch
                      id="enableVideo"
                      checked={config.enableVideo}
                      onCheckedChange={(checked) => setConfig({ ...config, enableVideo: checked })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="position">Position</Label>
                    <select
                      id="position"
                      className="w-full p-2 border rounded-md"
                      value={config.position}
                      onChange={(e) => setConfig({ ...config, position: e.target.value })}
                    >
                      <option value="bottom-right">Bottom Right</option>
                      <option value="bottom-left">Bottom Left</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="botName">Bot Name</Label>
                    <Input
                      id="botName"
                      value={config.botName}
                      onChange={(e) => setConfig({ ...config, botName: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="greeting">Greeting Message</Label>
                    <Input
                      id="greeting"
                      value={config.greeting}
                      onChange={(e) => setConfig({ ...config, greeting: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subGreeting">Sub Greeting</Label>
                    <Input
                      id="subGreeting"
                      value={config.subGreeting}
                      onChange={(e) => setConfig({ ...config, subGreeting: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="placeholder">Input Placeholder</Label>
                    <Input
                      id="placeholder"
                      value={config.placeholder}
                      onChange={(e) => setConfig({ ...config, placeholder: e.target.value })}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Appearance Settings */}
            <TabsContent value="appearance" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Appearance</CardTitle>
                  <CardDescription>Customize colors and styling</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="primaryColor">Primary Color</Label>
                    <div className="flex gap-2">
                      <Input
                        id="primaryColor"
                        type="color"
                        value={config.primaryColor}
                        onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
                        className="w-20 h-10"
                      />
                      <Input
                        value={config.primaryColor}
                        onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="secondaryColor">Secondary Color</Label>
                    <div className="flex gap-2">
                      <Input
                        id="secondaryColor"
                        type="color"
                        value={config.secondaryColor}
                        onChange={(e) => setConfig({ ...config, secondaryColor: e.target.value })}
                        className="w-20 h-10"
                      />
                      <Input
                        value={config.secondaryColor}
                        onChange={(e) => setConfig({ ...config, secondaryColor: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="videoUrl">Video Avatar URL</Label>
                    <Input
                      id="videoUrl"
                      value={config.videoUrl}
                      onChange={(e) => setConfig({ ...config, videoUrl: e.target.value })}
                      placeholder="https://..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty to disable video
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Advanced Settings */}
            <TabsContent value="advanced" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Custom CSS</CardTitle>
                  <CardDescription>
                    Add custom CSS to override widget styles
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={config.customCSS}
                    onChange={(e) => setConfig({ ...config, customCSS: e.target.value })}
                    placeholder={`/* Example: */
#tz-persistent {
  border-radius: 16px;
}

.tz-header {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
}

.tz-bubble {
  border-radius: 8px;
}`}
                    className="font-mono text-sm min-h-[300px]"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Use CSS selectors to customize widget appearance
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button onClick={saveConfig} disabled={saving} className="flex-1">
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
            <Button onClick={resetToDefaults} variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          </div>
        </div>

        {/* Preview & Embed Code */}
        <div className="space-y-6">
          {/* Live Preview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Live Preview</CardTitle>
                  <CardDescription>See your changes in real-time</CardDescription>
                </div>
                <Button onClick={refreshPreview} variant="outline" size="sm">
                  <Eye className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-gradient-to-br from-purple-100 to-blue-100 dark:from-gray-900 dark:to-gray-800 rounded-lg p-4 h-[500px] relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p className="text-sm mb-2">Preview will appear here</p>
                    <p className="text-xs">
                      Widget opens in center with your custom settings
                    </p>
                  </div>
                </div>
                {/* Preview iframe or component would go here */}
              </div>
            </CardContent>
          </Card>

          {/* Embed Code */}
          <Card>
            <CardHeader>
              <CardTitle>Embed Code</CardTitle>
              <CardDescription>
                Copy this code to your website
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs">
                  <code>{embedCode}</code>
                </pre>
                <Button
                  onClick={copyEmbedCode}
                  size="sm"
                  variant="secondary"
                  className="absolute top-2 right-2"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Installation Instructions:</h4>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Copy the embed code above</li>
                  <li>Paste it before the closing <code>&lt;/body&gt;</code> tag</li>
                  <li>The widget will appear on your website</li>
                  <li>Position and chat history persist across pages</li>
                </ol>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-semibold text-sm mb-2">For WooCommerce:</h4>
                <p className="text-xs text-muted-foreground">
                  Add to <code>functions.php</code> or use the “Insert Headers and Footers” plugin
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Widget Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Widget Stats</CardTitle>
              <CardDescription>Usage statistics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    1,234
                  </div>
                  <div className="text-xs text-muted-foreground">Total Sessions</div>
                </div>
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    5,678
                  </div>
                  <div className="text-xs text-muted-foreground">Messages Sent</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
