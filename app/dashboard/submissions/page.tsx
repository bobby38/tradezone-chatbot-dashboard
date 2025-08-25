'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate } from '@/lib/utils'
import { Calendar, Mail, Phone, User, MessageSquare, Globe, Monitor, Clock, TrendingUp, Users, Eye, CheckCircle, Download, FileText, FileSpreadsheet, Trash2, MoreHorizontal, Reply } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ReplyDialog } from '@/components/reply-dialog'

interface Submission {
  id: string
  title: string
  content_input: string
  content_type: string
  ai_metadata: any
  status: string
  created_at: string
}

interface SubmissionStats {
  total: number
  today: number
  thisWeek: number
  thisMonth: number
  byStatus: Record<string, number>
  byType: Record<string, number>
}

interface FormData {
  name?: string
  email?: string
  phone?: string
  subject?: string
  message?: string
  company?: string
  [key: string]: any
}

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [stats, setStats] = useState<SubmissionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [expandedSubmissions, setExpandedSubmissions] = useState<Set<string>>(new Set())
  const [selectedSubmissions, setSelectedSubmissions] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchSubmissions()
    calculateStats()
  }, [])

  useEffect(() => {
    if (submissions.length > 0) {
      calculateStats()
    }
  }, [submissions])

  const fetchSubmissions = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/submissions')
      
      if (!response.ok) {
        throw new Error('Failed to fetch submissions')
      }
      
      const data = await response.json()
      setSubmissions(data.submissions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch submissions')
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = () => {
    if (submissions.length === 0) return

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

    const stats: SubmissionStats = {
      total: submissions.length,
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      byStatus: {},
      byType: {}
    }

    submissions.forEach(submission => {
      const submissionDate = new Date(submission.created_at)
      
      // Date-based stats
      if (submissionDate >= today) stats.today++
      if (submissionDate >= weekAgo) stats.thisWeek++
      if (submissionDate >= monthAgo) stats.thisMonth++
      
      // Status stats
      stats.byStatus[submission.status] = (stats.byStatus[submission.status] || 0) + 1
      
      // Type stats
      const formType = getFormType(submission)
      stats.byType[formType] = (stats.byType[formType] || 0) + 1
    })

    setStats(stats)
  }

  const getFormType = (submission: Submission): string => {
    if (submission.ai_metadata?.device_type || submission.ai_metadata?.console_type) {
      return 'Trade-in Form'
    }
    return 'Contact Form'
  }

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedSubmissions)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedSubmissions(newExpanded)
  }

  const toggleSelected = (id: string) => {
    const newSelected = new Set(selectedSubmissions)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedSubmissions(newSelected)
  }

  const selectAll = () => {
    if (selectedSubmissions.size === submissions.length) {
      setSelectedSubmissions(new Set())
    } else {
      setSelectedSubmissions(new Set(submissions.map(s => s.id)))
    }
  }

  const exportToCSV = () => {
    setExporting(true)
    try {
      const csvData = submissions.map(submission => ({
        id: submission.id,
        type: getFormType(submission),
        name: submission.ai_metadata?.name || '',
        email: submission.ai_metadata?.email || '',
        phone: submission.ai_metadata?.phone || '',
        subject: submission.ai_metadata?.subject || '',
        message: submission.ai_metadata?.message || '',
        company: submission.ai_metadata?.company || '',
        device_type: submission.ai_metadata?.device_type || '',
        brand: submission.ai_metadata?.brand || '',
        model: submission.ai_metadata?.model || '',
        body_condition: submission.ai_metadata?.body_condition || '',
        status: submission.status,
        created_at: submission.created_at
      }))

      const headers = Object.keys(csvData[0]).join(',')
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
      link.download = `form-submissions-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const exportToExcel = () => {
    setExporting(true)
    try {
      const data = submissions.map(submission => ({
        'ID': submission.id,
        'Type': getFormType(submission),
        'Name': submission.ai_metadata?.name || '',
        'Email': submission.ai_metadata?.email || '',
        'Phone': submission.ai_metadata?.phone || '',
        'Subject': submission.ai_metadata?.subject || '',
        'Message': submission.ai_metadata?.message || '',
        'Company': submission.ai_metadata?.company || '',
        'Device Type': submission.ai_metadata?.device_type || '',
        'Brand': submission.ai_metadata?.brand || '',
        'Model': submission.ai_metadata?.model || '',
        'Condition': submission.ai_metadata?.body_condition || '',
        'Status': submission.status,
        'Created At': new Date(submission.created_at).toLocaleString()
      }))

      // Create a simple tab-delimited format that Excel can open
      const headers = Object.keys(data[0]).join('\t')
      const rows = data.map(row => Object.values(row).join('\t'))
      const tsv = [headers, ...rows].join('\n')
      
      const blob = new Blob([tsv], { type: 'text/tab-separated-values' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `form-submissions-${new Date().toISOString().split('T')[0]}.xls`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const deleteSelected = async () => {
    if (selectedSubmissions.size === 0) return
    
    if (!confirm(`Are you sure you want to delete ${selectedSubmissions.size} submission(s)? This action cannot be undone.`)) {
      return
    }

    setDeleting(true)
    try {
      const deletePromises = Array.from(selectedSubmissions).map(async (id) => {
        const response = await fetch(`/api/submissions/${id}`, {
          method: 'DELETE'
        })
        if (!response.ok) {
          throw new Error(`Failed to delete submission ${id}`)
        }
        return id
      })

      await Promise.all(deletePromises)
      
      // Remove deleted submissions from state
      setSubmissions(prev => prev.filter(s => !selectedSubmissions.has(s.id)))
      setSelectedSubmissions(new Set())
      
      // Recalculate stats
      calculateStats()
    } catch (error) {
      console.error('Delete error:', error)
      setError(error instanceof Error ? error.message : 'Failed to delete submissions')
    } finally {
      setDeleting(false)
    }
  }

  const renderFormData = (submission: Submission) => {
    const formData = submission.ai_metadata as FormData
    const isTradeIn = getFormType(submission) === 'Trade-in Form'
    
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {/* Contact Information */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Contact Information</h4>
          <div className="space-y-2">
            {formData.name && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{formData.name}</span>
              </div>
            )}
            {formData.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{formData.email}</span>
              </div>
            )}
            {formData.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{formData.phone}</span>
              </div>
            )}
            {formData.company && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span>{formData.company}</span>
              </div>
            )}
          </div>
        </div>

        {/* Message/Subject */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            {isTradeIn ? 'Device Information' : 'Message Details'}
          </h4>
          <div className="space-y-2">
            {formData.subject && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Subject:</span>
                </div>
                <p className="text-sm pl-6">{formData.subject}</p>
              </div>
            )}
            {formData.message && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">Message:</span>
                </div>
                <p className="text-sm pl-6 whitespace-pre-wrap">{formData.message}</p>
              </div>
            )}
            {isTradeIn && (
              <div className="space-y-1">
                {formData.device_type && <p className="text-sm"><span className="font-medium">Device:</span> {formData.device_type}</p>}
                {formData.brand && <p className="text-sm"><span className="font-medium">Brand:</span> {formData.brand}</p>}
                {formData.model && <p className="text-sm"><span className="font-medium">Model:</span> {formData.model}</p>}
                {formData.body_condition && <p className="text-sm"><span className="font-medium">Condition:</span> {formData.body_condition}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Form Submissions</h1>
          <p className="text-muted-foreground">Loading submissions...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Form Submissions</h1>
          <p className="text-red-500">Error: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Form Submissions</h1>
          <p className="text-muted-foreground">
            View and manage form submissions from your website
          </p>
        </div>
        
        <div className="flex gap-2">
          {selectedSubmissions.size > 0 && (
            <>
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={deleteSelected}
                disabled={deleting}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? 'Deleting...' : `Delete ${selectedSubmissions.size}`}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setSelectedSubmissions(new Set())}
              >
                Clear Selection
              </Button>
            </>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={exporting}>
                <Download className="h-4 w-4 mr-2" />
                {exporting ? 'Exporting...' : 'Export'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportToCSV}>
                <FileText className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export as Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">All time submissions</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.today}</div>
              <p className="text-xs text-muted-foreground">Submissions today</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Week</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.thisWeek}</div>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.thisMonth}</div>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="contact">Contact Forms</TabsTrigger>
            <TabsTrigger value="tradein">Trade-in Forms</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>
          
          {activeTab === 'overview' && submissions.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedSubmissions.size === submissions.length}
                onCheckedChange={selectAll}
              />
              <span className="text-sm text-muted-foreground">
                Select All ({submissions.length})
              </span>
            </div>
          )}
        </div>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4">
            {submissions.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">No submissions found</p>
                </CardContent>
              </Card>
            ) : (
              submissions.map((submission) => (
                <Card key={submission.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedSubmissions.has(submission.id)}
                          onCheckedChange={() => toggleSelected(submission.id)}
                        />
                        <div className="flex items-center gap-2">
                          {getFormType(submission) === 'Trade-in Form' ? (
                            <Monitor className="h-5 w-5 text-blue-500" />
                          ) : (
                            <Mail className="h-5 w-5 text-green-500" />
                          )}
                          <CardTitle className="text-lg">
                            {submission.ai_metadata?.name || submission.ai_metadata?.email || 'Anonymous'}
                          </CardTitle>
                        </div>
                        <Badge variant="outline">
                          {getFormType(submission)}
                        </Badge>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Badge 
                          variant={submission.status === 'ready' ? 'secondary' : 'default'}
                          className="flex items-center gap-1"
                        >
                          {submission.status === 'ready' && <CheckCircle className="h-3 w-3" />}
                          {submission.status}
                        </Badge>
                        {submission.ai_metadata?.email && (
                          <ReplyDialog 
                            submission={submission}
                            onReplySent={() => {
                              // Refresh submissions or update status
                              fetchSubmissions()
                            }}
                          />
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => toggleExpanded(submission.id)}
                        >
                          <Eye className="h-4 w-4" />
                          {expandedSubmissions.has(submission.id) ? 'Hide' : 'View'}
                        </Button>
                      </div>
                    </div>
                    <CardDescription className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {formatDate(submission.created_at)}
                      {submission.ai_metadata?.subject && (
                        <>
                          <span>•</span>
                          <span className="font-medium">{submission.ai_metadata.subject}</span>
                        </>
                      )}
                    </CardDescription>
                  </CardHeader>
                  
                  {expandedSubmissions.has(submission.id) && (
                    <CardContent>
                      <div className="space-y-6">
                        {renderFormData(submission)}
                        
                        {/* Technical Details - Collapsed by default */}
                        <details className="space-y-2">
                          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                            Technical Details
                          </summary>
                          <div className="space-y-3 pl-4 border-l-2 border-muted">
                            <div>
                              <h5 className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-2">Structured Data:</h5>
                              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-32">
                                {JSON.stringify(submission.ai_metadata, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <h5 className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-2">Raw Webhook:</h5>
                              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-32">
                                {submission.content_input}
                              </pre>
                            </div>
                          </div>
                        </details>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="contact">
          <div className="grid gap-4">
            {submissions
              .filter(s => getFormType(s) === 'Contact Form')
              .map(submission => (
                <Card key={submission.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-green-500" />
                        <CardTitle>{submission.ai_metadata?.name || 'Anonymous'}</CardTitle>
                      </div>
                      <Badge variant="secondary">{submission.status}</Badge>
                    </div>
                    <CardDescription>{formatDate(submission.created_at)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {renderFormData(submission)}
                  </CardContent>
                </Card>
              ))
            }
            {submissions.filter(s => getFormType(s) === 'Contact Form').length === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">No contact form submissions found</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="tradein">
          <div className="grid gap-4">
            {submissions
              .filter(s => getFormType(s) === 'Trade-in Form')
              .map(submission => (
                <Card key={submission.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-5 w-5 text-blue-500" />
                        <CardTitle>{submission.ai_metadata?.name || 'Anonymous'}</CardTitle>
                      </div>
                      <Badge variant="secondary">{submission.status}</Badge>
                    </div>
                    <CardDescription>{formatDate(submission.created_at)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {renderFormData(submission)}
                  </CardContent>
                </Card>
              ))
            }
            {submissions.filter(s => getFormType(s) === 'Trade-in Form').length === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">No trade-in form submissions found</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="analytics">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Form Type Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Form Types</CardTitle>
                <CardDescription>Distribution of form submissions by type</CardDescription>
              </CardHeader>
              <CardContent>
                {stats && Object.entries(stats.byType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      {type === 'Trade-in Form' ? (
                        <Monitor className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Mail className="h-4 w-4 text-green-500" />
                      )}
                      <span>{type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{count}</Badge>
                      <span className="text-sm text-muted-foreground">
                        ({Math.round((count / stats.total) * 100)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            
            {/* Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Submission Status</CardTitle>
                <CardDescription>Current status of all submissions</CardDescription>
              </CardHeader>
              <CardContent>
                {stats && Object.entries(stats.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      {status === 'ready' && <CheckCircle className="h-4 w-4 text-green-500" />}
                      <span className="capitalize">{status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{count}</Badge>
                      <span className="text-sm text-muted-foreground">
                        ({Math.round((count / stats.total) * 100)}%)
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}