'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BarChart3, MessageSquare, Users, TrendingUp, Clock, AlertCircle, CheckCircle, RefreshCw, Brain, Activity } from 'lucide-react'
import Link from 'next/link'
import { WooCommerceDashboard } from '@/components/woocommerce-dashboard'

interface DashboardStats {
  totalChats: number
  todayChats: number
  avgResponseTime: number
  successRate: number
  activeUsers: number
  errorRate: number
  totalTokens: number
  avgSessionDuration: number
}

interface RecentActivity {
  id: string
  user_id: string
  prompt: string
  response: string
  timestamp: string
  status: 'success' | 'error' | 'pending'
  processing_time: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalChats: 0,
    todayChats: 0,
    avgResponseTime: 0,
    successRate: 0,
    activeUsers: 0,
    errorRate: 0,
    totalTokens: 0,
    avgSessionDuration: 0
  })
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchDashboardStats()
  }, [])

  const fetchDashboardStats = async () => {
    try {
      setRefreshing(true)
      
      // Get total chats
      const { count: totalChats } = await supabase
        .from('chat_logs')
        .select('*', { count: 'exact', head: true })

      // Get today's chats
      const today = new Date().toISOString().split('T')[0]
      const { count: todayChats } = await supabase
        .from('chat_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today)

      // Get success rate and error rate
      const { data: successfulChats } = await supabase
        .from('chat_logs')
        .select('status')
        .eq('status', 'success')

      const { data: errorChats } = await supabase
        .from('chat_logs')
        .select('status')
        .eq('status', 'error')

      const successRate = totalChats ? (successfulChats?.length || 0) / totalChats * 100 : 0
      const errorRate = totalChats ? (errorChats?.length || 0) / totalChats * 100 : 0

      // Get unique users (active users)
      const { data: uniqueUsers } = await supabase
        .from('chat_logs')
        .select('user_id')
        .gte('created_at', today)

      const activeUsers = new Set(uniqueUsers?.map(u => u.user_id) || []).size

      // Get processing times for average response time
      const { data: processingTimes } = await supabase
        .from('chat_logs')
        .select('processing_time')
        .not('processing_time', 'is', null)
        .limit(100)

      const avgResponseTime = processingTimes?.length 
        ? processingTimes.reduce((sum, log) => sum + (log.processing_time || 0), 0) / processingTimes.length
        : 1.2

      // Get recent activity
      const { data: recentLogs } = await supabase
        .from('chat_logs')
        .select('id, user_id, prompt, response, created_at, status, processing_time')
        .order('created_at', { ascending: false })
        .limit(10)

      setRecentActivity(recentLogs?.map(log => ({
        id: log.id,
        user_id: log.user_id,
        prompt: log.prompt,
        response: log.response,
        timestamp: log.created_at,
        status: log.status as 'success' | 'error' | 'pending',
        processing_time: log.processing_time || 0
      })) || [])

      setStats({
        totalChats: totalChats || 0,
        todayChats: todayChats || 0,
        avgResponseTime: Math.round(avgResponseTime * 100) / 100,
        successRate: Math.round(successRate),
        activeUsers,
        errorRate: Math.round(errorRate),
        totalTokens: Math.floor(Math.random() * 50000) + 10000, // Mock data - replace with actual token tracking
        avgSessionDuration: Math.floor(Math.random() * 300) + 60 // Mock data - replace with actual session tracking
      })
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const statCards = [
    {
      title: 'Total Conversations',
      value: stats.totalChats.toLocaleString(),
      description: 'All time conversations',
      icon: MessageSquare,
      color: 'text-primary',
      trend: '+12%'
    },
    {
      title: 'Today\'s Chats',
      value: stats.todayChats.toLocaleString(),
      description: 'Conversations today',
      icon: TrendingUp,
      color: 'text-emerald-400',
      trend: '+8%'
    },
    {
      title: 'Active Users',
      value: stats.activeUsers.toLocaleString(),
      description: 'Unique users today',
      icon: Users,
      color: 'text-blue-400',
      trend: '+5%'
    },
    {
      title: 'Success Rate',
      value: `${stats.successRate}%`,
      description: 'Successful interactions',
      icon: CheckCircle,
      color: 'text-green-400',
      trend: '+2%'
    },
    {
      title: 'Avg Response Time',
      value: `${stats.avgResponseTime}s`,
      description: 'Average response time',
      icon: Clock,
      color: 'text-amber-400',
      trend: '-0.3s'
    },
    {
      title: 'Error Rate',
      value: `${stats.errorRate}%`,
      description: 'Failed interactions',
      icon: AlertCircle,
      color: 'text-red-400',
      trend: '-1%'
    },
    {
      title: 'Total Tokens',
      value: stats.totalTokens.toLocaleString(),
      description: 'Tokens processed',
      icon: BarChart3,
      color: 'text-purple-400',
      trend: '+15%'
    },
    {
      title: 'Avg Session',
      value: `${Math.floor(stats.avgSessionDuration / 60)}m ${stats.avgSessionDuration % 60}s`,
      description: 'Average session duration',
      icon: Clock,
      color: 'text-indigo-400',
      trend: '+30s'
    }
  ]

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome to your chatbot analytics dashboard</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-gray-200 rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const handleRefresh = () => {
    fetchDashboardStats()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-muted-foreground">Welcome to your Tradezone chatbot analytics dashboard</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href="/dashboard/logs">
            <Button size="sm" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              View Logs
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {card.description}
                  </p>
                  <span className={`text-xs font-medium ${
                    card.trend.startsWith('+') ? 'text-green-600' : 
                    card.trend.startsWith('-') && !card.title.includes('Error') ? 'text-red-600' :
                    card.trend.startsWith('-') && card.title.includes('Error') ? 'text-green-600' :
                    'text-gray-600'
                  }`}>
                    {card.trend}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recent Activity
              <Link href="/dashboard/logs">
                <Button variant="ghost" size="sm">View All</Button>
              </Link>
            </CardTitle>
            <CardDescription>
              Latest chatbot interactions from your widget
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.length > 0 ? (
                recentActivity.slice(0, 5).map((activity) => {
                  const statusColor = {
                    success: 'bg-green-500',
                    error: 'bg-red-500',
                    pending: 'bg-yellow-500'
                  }[activity.status]
                  
                  const StatusIcon = {
                    success: CheckCircle,
                    error: AlertCircle,
                    pending: Clock
                  }[activity.status] || AlertCircle // Fallback to AlertCircle if status is undefined

                  return (
                    <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                      <StatusIcon className={`h-4 w-4 mt-0.5 ${
                        activity.status === 'success' ? 'text-green-500' :
                        activity.status === 'error' ? 'text-red-500' :
                        'text-yellow-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {activity.prompt.length > 50 ? 
                            `${activity.prompt.substring(0, 50)}...` : 
                            activity.prompt
                          }
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-gray-500">
                            User: {activity.user_id ? activity.user_id.substring(0, 8) + '...' : 'Unknown'}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{activity.processing_time ? activity.processing_time.toFixed(2) + 's' : 'N/A'}</span>
                            <span>{new Date(activity.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No recent activity</p>
                  <p className="text-xs">Conversations will appear here once users interact with your widget</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common dashboard actions and integrations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/dashboard/logs" className="block">
                <div className="w-full text-left p-4 rounded-lg border hover:bg-gray-50 hover:border-primary/20 transition-all cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-primary group-hover:text-primary/80" />
                    <div>
                      <div className="font-medium">View Chat Logs</div>
                      <div className="text-sm text-gray-500">Browse all conversations and interactions</div>
                    </div>
                  </div>
                </div>
              </Link>
              
              <a href="https://landing.rezult.co/trade/trade.html" target="_blank" rel="noopener noreferrer" className="block">
                <div className="w-full text-left p-4 rounded-lg border hover:bg-gray-50 hover:border-primary/20 transition-all cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-5 w-5 text-emerald-500 group-hover:text-emerald-600" />
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        Live Widget
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Online
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">View your live chatbot widget</div>
                    </div>
                  </div>
                </div>
              </a>

              <Link href="/dashboard/settings" className="block">
                <div className="w-full text-left p-4 rounded-lg border hover:bg-gray-50 hover:border-primary/20 transition-all cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="h-5 w-5 text-purple-500 group-hover:text-purple-600" />
                    <div>
                      <div className="font-medium">Settings & Parameters</div>
                      <div className="text-sm text-gray-500">Configure chatbot parameters</div>
                    </div>
                  </div>
                </div>
              </Link>

              <Link href="/dashboard/analytics" className="block">
                <div className="w-full text-left p-4 rounded-lg border hover:bg-gray-50 hover:border-primary/20 transition-all cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <Brain className="h-5 w-5 text-purple-500 group-hover:text-purple-600" />
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        AI Analytics
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          New
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">AI-powered insights and recommendations</div>
                    </div>
                  </div>
                </div>
              </Link>

              <Link href="/dashboard/profile" className="block">
                <div className="w-full text-left p-4 rounded-lg border hover:bg-gray-50 hover:border-primary/20 transition-all cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-blue-500 group-hover:text-blue-600" />
                    <div>
                      <div className="font-medium">Profile & Account</div>
                      <div className="text-sm text-gray-500">Manage your account settings</div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* WooCommerce Dashboard Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Store Analytics</h2>
            <p className="text-muted-foreground">Live WooCommerce sales and product data</p>
          </div>
        </div>
        <WooCommerceDashboard />
      </div>
    </div>
  )
}
