'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Brain, 
  TrendingUp, 
  MessageSquare, 
  Users, 
  AlertTriangle,
  RefreshCw,
  BarChart3,
  Search,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'

interface InsightData {
  commonQuestions: Array<{ question: string; count: number; category: string }>
  enquiryTrends: Array<{ date: string; count: number; category: string }>
  responseEffectiveness: Array<{ category: string; avgResponseTime: number; successRate: number }>
  userBehavior: Array<{ pattern: string; count: number; description: string }>
  keywordAnalysis: Array<{ keyword: string; frequency: number; context: string }>
  topIssues: Array<{ issue: string; frequency: number; severity: string }>
}

export default function InsightsPage() {
  const [insights, setInsights] = useState<InsightData>({
    commonQuestions: [],
    enquiryTrends: [],
    responseEffectiveness: [],
    userBehavior: [],
    keywordAnalysis: [],
    topIssues: []
  })
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<7 | 30 | 90>(30)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    fetchInsights()
  }, [period])

  const fetchInsights = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/insights?days=${period}`)
      if (response.ok) {
        const data = await response.json()
        setInsights(data.insights || {
          commonQuestions: [],
          enquiryTrends: [],
          responseEffectiveness: [],
          userBehavior: [],
          keywordAnalysis: [],
          topIssues: []
        })
      } else {
        console.error('Failed to fetch insights')
      }
    } catch (error) {
      console.error('Error fetching insights:', error)
    } finally {
      setLoading(false)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'destructive'
      case 'medium': return 'secondary' 
      case 'low': return 'outline'
      default: return 'outline'
    }
  }

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1', '#d084d0']

  // Transform trend data for chart
  const trendChartData = insights.enquiryTrends.reduce((acc: any[], item) => {
    const existing = acc.find(d => d.date === item.date)
    if (existing) {
      existing[item.category] = item.count
    } else {
      acc.push({ date: item.date, [item.category]: item.count })
    }
    return acc
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Insights</h1>
          <p className="text-muted-foreground">Loading insights...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Insights</h1>
          <p className="text-muted-foreground">
            Intelligent analysis of customer interactions and common enquiries
          </p>
        </div>
        
        <div className="flex gap-2 items-center">
          <div className="rounded-md border p-0.5">
            {[7, 30, 90].map((days) => (
              <Button
                key={days}
                variant={period === days ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriod(days as 7 | 30 | 90)}
              >
                {days === 7 ? '7 days' : days === 30 ? '30 days' : '3 months'}
              </Button>
            ))}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchInsights}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Common Questions</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{insights.commonQuestions.length}</div>
            <p className="text-xs text-muted-foreground">Question categories identified</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">User Patterns</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{insights.userBehavior.length}</div>
            <p className="text-xs text-muted-foreground">Behavior patterns detected</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{insights.topIssues.length}</div>
            <p className="text-xs text-muted-foreground">Issues requiring attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Key Keywords</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{insights.keywordAnalysis.length}</div>
            <p className="text-xs text-muted-foreground">Frequently mentioned terms</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="questions">Common Questions</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="behavior">User Behavior</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Enquiry Trends Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Enquiry Trends</CardTitle>
              <CardDescription>Daily interaction volume over the last {period} days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendChartData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="Chat Enquiries" 
                      stroke="#8884d8" 
                      strokeWidth={2} 
                      dot={false} 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="Form Submissions" 
                      stroke="#82ca9d" 
                      strokeWidth={2} 
                      dot={false} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Top Questions */}
            <Card>
              <CardHeader>
                <CardTitle>Most Common Questions</CardTitle>
                <CardDescription>Top question categories</CardDescription>
              </CardHeader>
              <CardContent>
                {insights.commonQuestions.slice(0, 5).map((q, index) => (
                  <div key={q.category} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 text-xs rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        {index + 1}
                      </div>
                      <span className="text-sm">{q.question}</span>
                    </div>
                    <Badge variant="outline">{q.count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Response Effectiveness */}
            <Card>
              <CardHeader>
                <CardTitle>Response Effectiveness</CardTitle>
                <CardDescription>Success rate by question type</CardDescription>
              </CardHeader>
              <CardContent>
                {insights.responseEffectiveness.map((r) => (
                  <div key={r.category} className="space-y-2 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{r.category}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {r.avgResponseTime}s
                        </Badge>
                        <Badge variant={r.successRate > 95 ? 'default' : r.successRate > 85 ? 'secondary' : 'destructive'}>
                          {r.successRate > 95 ? (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          ) : r.successRate < 85 ? (
                            <XCircle className="h-3 w-3 mr-1" />
                          ) : null}
                          {r.successRate}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="questions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Common Question Analysis</CardTitle>
              <CardDescription>Detailed breakdown of customer inquiries</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {insights.commonQuestions.map((question, index) => (
                  <div key={question.category} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{question.question}</h4>
                      <Badge variant="outline">{question.count} occurrences</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <BarChart3 className="h-4 w-4" />
                      Represents {Math.round((question.count / insights.commonQuestions.reduce((sum, q) => sum + q.count, 0)) * 100)}% of all questions
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Detailed Trend Analysis</CardTitle>
              <CardDescription>Interaction patterns over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendChartData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Chat Enquiries" fill="#8884d8" />
                    <Bar dataKey="Form Submissions" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="behavior" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Behavior Patterns</CardTitle>
              <CardDescription>How customers interact with your services</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {insights.userBehavior.map((behavior, index) => (
                  <div key={behavior.pattern} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{behavior.pattern}</h4>
                      <Badge variant="secondary">{behavior.count}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{behavior.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Keyword Analysis</CardTitle>
              <CardDescription>Most frequently mentioned terms</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {insights.keywordAnalysis.map((keyword) => (
                  <div key={keyword.keyword} className="flex items-center justify-between py-2 px-3 border rounded">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{keyword.keyword}</Badge>
                      <span className="text-sm text-muted-foreground">{keyword.context}</span>
                    </div>
                    <span className="text-sm font-medium">{keyword.frequency}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="issues" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Issue Analysis</CardTitle>
              <CardDescription>Common problems and their frequency</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {insights.topIssues.map((issue, index) => (
                  <div key={issue.issue} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium flex items-center gap-2">
                        {issue.severity === 'high' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                        {issue.issue}
                      </h4>
                      <div className="flex items-center gap-2">
                        <Badge variant={getSeverityColor(issue.severity)} className="capitalize">
                          {issue.severity} priority
                        </Badge>
                        <Badge variant="outline">{issue.frequency} reports</Badge>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Reported {issue.frequency} times - {issue.severity} priority issue
                    </div>
                  </div>
                ))}
                
                {insights.topIssues.length === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h3 className="font-medium mb-2">No Major Issues Detected</h3>
                    <p className="text-muted-foreground">
                      Your customer interactions appear to be running smoothly with no significant issues identified.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}