'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate } from '@/lib/utils'
import { 
  Mail, 
  MessageSquare, 
  FileText, 
  TrendingUp, 
  Users, 
  Globe,
  Search,
  Download,
  RefreshCw,
  Sparkles,
  BarChart3
} from 'lucide-react'

interface ExtractedEmail {
  id: string
  email: string
  source_type: 'chat_log' | 'form_submission'
  source_id: string
  context: string
  classification: string
  confidence: number
  extracted_at: string
}

interface EmailStats {
  total: number
  bySource: Record<string, number>
  byClassification: Record<string, number>
  topDomains: Array<{ domain: string; count: number }>
}

export default function EmailsPage() {
  const [emails, setEmails] = useState<ExtractedEmail[]>([])
  const [stats, setStats] = useState<EmailStats>({
    total: 0,
    bySource: {},
    byClassification: {},
    topDomains: []
  })
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    fetchEmails()
  }, [])

  const fetchEmails = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/extract-emails')
      if (response.ok) {
        const data = await response.json()
        setEmails(data.emails || [])
        setStats(data.stats || { total: 0, bySource: {}, byClassification: {}, topDomains: [] })
      } else {
        console.error('Failed to fetch emails')
      }
    } catch (error) {
      console.error('Error fetching emails:', error)
    } finally {
      setLoading(false)
    }
  }

  const extractNewEmails = async () => {
    try {
      setExtracting(true)
      const response = await fetch('/api/extract-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ extractNew: true, limit: 200 })
      })
      
      if (response.ok) {
        const data = await response.json()
        setEmails(data.allEmails || [])
        setStats(data.stats || { total: 0, bySource: {}, byClassification: {}, topDomains: [] })
        
        // Show success message
        alert(`Successfully extracted ${data.newEmails} new emails!`)
      } else {
        console.error('Failed to extract emails')
        alert('Failed to extract emails')
      }
    } catch (error) {
      console.error('Error extracting emails:', error)
      alert('Error extracting emails')
    } finally {
      setExtracting(false)
    }
  }

  const exportEmails = () => {
    const csvData = emails.map(email => ({
      email: email.email,
      source_type: email.source_type,
      classification: email.classification,
      confidence: email.confidence,
      context: email.context,
      extracted_at: email.extracted_at
    }))

    const headers = Object.keys(csvData[0] || {}).join(',')
    const rows = csvData.map(row => 
      Object.values(row).map(val => 
        typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      ).join(',')
    )
    
    const csv = [headers, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `extracted-emails-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const getClassificationColor = (classification: string) => {
    const colors = {
      'trade_inquiry': 'bg-blue-100 text-blue-800',
      'trade_in_form': 'bg-green-100 text-green-800',
      'support_request': 'bg-red-100 text-red-800',
      'contact_inquiry': 'bg-purple-100 text-purple-800',
      'pricing_inquiry': 'bg-yellow-100 text-yellow-800',
      'product_inquiry': 'bg-indigo-100 text-indigo-800',
      'contact_form': 'bg-gray-100 text-gray-800',
      'general_inquiry': 'bg-gray-100 text-gray-800'
    }
    return colors[classification as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Extraction</h1>
          <p className="text-muted-foreground">Loading extracted emails...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Extraction</h1>
          <p className="text-muted-foreground">
            AI-powered email extraction from chat logs and form submissions
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={exportEmails}
            disabled={emails.length === 0}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchEmails}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button 
            onClick={extractNewEmails}
            disabled={extracting}
            className="flex items-center gap-2"
          >
            {extracting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {extracting ? 'Extracting...' : 'Extract New'}
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Emails</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Unique email addresses found</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">From Chat Logs</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.bySource.chat_log || 0}</div>
            <p className="text-xs text-muted-foreground">Extracted from conversations</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">From Forms</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.bySource.form_submission || 0}</div>
            <p className="text-xs text-muted-foreground">Extracted from form submissions</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Domain</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.topDomains[0]?.count || 0}</div>
            <p className="text-xs text-muted-foreground">{stats.topDomains[0]?.domain || 'No data'}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="emails">All Emails</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4">
            {emails.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center">
                  <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-2">No emails extracted yet</p>
                  <p className="text-muted-foreground mb-4">
                    Click “Extract New” to start finding email addresses from your chat logs and form submissions.
                  </p>
                  <Button onClick={extractNewEmails} disabled={extracting}>
                    {extracting ? 'Extracting...' : 'Start Extraction'}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              emails.slice(0, 10).map((email) => (
                <Card key={email.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {email.source_type === 'chat_log' ? (
                          <MessageSquare className="h-5 w-5 text-blue-500" />
                        ) : (
                          <FileText className="h-5 w-5 text-green-500" />
                        )}
                        <div>
                          <CardTitle className="text-lg">{email.email}</CardTitle>
                          <CardDescription className="flex items-center gap-2">
                            <span className="capitalize">{email.source_type.replace('_', ' ')}</span>
                            <span>•</span>
                            <span>{formatDate(email.extracted_at)}</span>
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Badge className={getClassificationColor(email.classification)}>
                          {email.classification.replace('_', ' ')}
                        </Badge>
                        <Badge variant="outline">
                          {Math.round(email.confidence * 100)}% confidence
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      <strong>Context:</strong> {email.context}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
            
            {emails.length > 10 && (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground mb-4">
                    Showing 10 of {emails.length} emails
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={() => setActiveTab('emails')}
                  >
                    View All Emails
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="emails" className="space-y-4">
          <div className="grid gap-4">
            {emails.map((email) => (
              <Card key={email.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {email.source_type === 'chat_log' ? (
                        <MessageSquare className="h-5 w-5 text-blue-500" />
                      ) : (
                        <FileText className="h-5 w-5 text-green-500" />
                      )}
                      <div>
                        <CardTitle className="text-lg">{email.email}</CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <span className="capitalize">{email.source_type.replace('_', ' ')}</span>
                          <span>•</span>
                          <span>{formatDate(email.extracted_at)}</span>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Badge className={getClassificationColor(email.classification)}>
                        {email.classification.replace('_', ' ')}
                      </Badge>
                      <Badge variant="outline">
                        {Math.round(email.confidence * 100)}%
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    <strong>Context:</strong> {email.context}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Classification Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Email Classifications</CardTitle>
                <CardDescription>Distribution by inquiry type</CardDescription>
              </CardHeader>
              <CardContent>
                {Object.entries(stats.byClassification).length > 0 ? (
                  Object.entries(stats.byClassification).map(([classification, count]) => (
                    <div key={classification} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${getClassificationColor(classification).split(' ')[0]}`}></div>
                        <span className="capitalize">{classification.replace('_', ' ')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{count}</Badge>
                        <span className="text-sm text-muted-foreground">
                          ({Math.round((count / stats.total) * 100)}%)
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-4">No classification data</p>
                )}
              </CardContent>
            </Card>

            {/* Top Domains */}
            <Card>
              <CardHeader>
                <CardTitle>Top Email Domains</CardTitle>
                <CardDescription>Most common email providers</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.topDomains.length > 0 ? (
                  stats.topDomains.slice(0, 10).map((domain, index) => (
                    <div key={domain.domain} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 text-xs rounded-full bg-secondary flex items-center justify-center">
                          {index + 1}
                        </div>
                        <span>{domain.domain}</span>
                      </div>
                      <Badge variant="outline">{domain.count}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-4">No domain data</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
