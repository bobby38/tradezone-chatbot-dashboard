'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, MessageSquare, Users, TrendingUp } from 'lucide-react'

interface DashboardStats {
  totalChats: number
  todayChats: number
  avgResponseTime: number
  successRate: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalChats: 0,
    todayChats: 0,
    avgResponseTime: 0,
    successRate: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardStats()
  }, [])

  const fetchDashboardStats = async () => {
    try {
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

      // Get success rate (assuming 'success' status means successful)
      const { data: successfulChats } = await supabase
        .from('chat_logs')
        .select('status')
        .eq('status', 'success')

      const successRate = totalChats ? (successfulChats?.length || 0) / totalChats * 100 : 0

      setStats({
        totalChats: totalChats || 0,
        todayChats: todayChats || 0,
        avgResponseTime: 1.2, // Mock data - you can calculate this from your logs
        successRate: Math.round(successRate)
      })
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      title: 'Total Conversations',
      value: stats.totalChats.toLocaleString(),
      description: 'All time conversations',
      icon: MessageSquare,
      color: 'text-primary'
    },
    {
      title: 'Today\'s Chats',
      value: stats.todayChats.toLocaleString(),
      description: 'Conversations today',
      icon: TrendingUp,
      color: 'text-emerald-400'
    },
    {
      title: 'Avg Response Time',
      value: `${stats.avgResponseTime}s`,
      description: 'Average response time',
      icon: BarChart3,
      color: 'text-amber-400'
    },
    {
      title: 'Success Rate',
      value: `${stats.successRate}%`,
      description: 'Successful interactions',
      icon: Users,
      color: 'text-primary'
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
          {[1, 2, 3, 4].map((i) => (
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-muted-foreground">Welcome to your chatbot analytics dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest chatbot interactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">New conversation started</p>
                  <p className="text-xs text-gray-500">2 minutes ago</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">User query processed</p>
                  <p className="text-xs text-gray-500">5 minutes ago</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Response generated</p>
                  <p className="text-xs text-gray-500">8 minutes ago</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common dashboard actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <button className="w-full text-left p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                <div className="font-medium">View Chat Logs</div>
                <div className="text-sm text-gray-500">Browse all conversations</div>
              </button>
              <button className="w-full text-left p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                <div className="font-medium">Export Data</div>
                <div className="text-sm text-gray-500">Download chat history</div>
              </button>
              <button className="w-full text-left p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                <div className="font-medium">Settings</div>
                <div className="text-sm text-gray-500">Configure parameters</div>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
