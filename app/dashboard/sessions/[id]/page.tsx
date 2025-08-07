'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, User, Bot, Clock, MessageSquare, CheckCircle, XCircle, Activity } from 'lucide-react'

interface ChatLog {
  id: string
  user_id: string
  prompt: string
  response: string
  timestamp: string
  status: string
  created_at: string
  turn_index: number
  processing_time?: number
  session_name: string
}

interface SessionInfo {
  session_id: string
  user_id: string
  session_name: string
  started_at: string
  last_activity: string
  total_messages: number
  status: string
  source: string
  duration_minutes: number
  successful_messages: number
  error_messages: number
}

export default function SessionDetailPage() {
  const params = useParams()
  const sessionId = params.id as string
  const [logs, setLogs] = useState<ChatLog[]>([])
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSessionDetails()
  }, [sessionId])

  const fetchSessionDetails = async () => {
    try {
      // Fetch session info
      const { data: session, error: sessionError } = await supabase
        .from('session_summaries')
        .select('*')
        .eq('session_id', sessionId)
        .single()

      if (sessionError) throw sessionError
      setSessionInfo(session)

      // Fetch chat logs for this session
      const { data: chatLogs, error: logsError } = await supabase
        .from('chat_logs')
        .select('*')
        .eq('session_id', sessionId)
        .order('turn_index', { ascending: true })

      if (logsError) throw logsError
      setLogs(chatLogs || [])

    } catch (error) {
      console.error('Error fetching session details:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-100 text-green-800">Success</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatDuration = (minutes: number) => {
    if (minutes < 1) return '< 1 minute'
    if (minutes < 60) return `${Math.round(minutes)} minutes`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = Math.round(minutes % 60)
    return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-8 bg-gray-200 rounded animate-pulse mb-2"></div>
                <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!sessionInfo) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/sessions">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sessions
            </Button>
          </Link>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold">Session Not Found</h3>
              <p className="text-muted-foreground">The requested session could not be found.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/sessions">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Sessions
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{sessionInfo.session_name}</h1>
          <p className="text-muted-foreground">
            Session ID: <code className="text-xs bg-gray-100 px-2 py-1 rounded">{sessionId}</code>
          </p>
        </div>
      </div>

      {/* Session Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-4 w-4 text-blue-600" />
              <div className="text-2xl font-bold">{sessionInfo.total_messages}</div>
            </div>
            <p className="text-xs text-muted-foreground">Total Messages</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <div className="text-2xl font-bold">{sessionInfo.successful_messages}</div>
            </div>
            <p className="text-xs text-muted-foreground">Successful</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <div className="text-2xl font-bold">{sessionInfo.error_messages}</div>
            </div>
            <p className="text-xs text-muted-foreground">Errors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-orange-600" />
              <div className="text-2xl font-bold">
                {formatDuration(sessionInfo.duration_minutes)}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Duration</p>
          </CardContent>
        </Card>
      </div>

      {/* Session Info */}
      <Card>
        <CardHeader>
          <CardTitle>Session Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">User ID</label>
              <div className="mt-1">
                <code className="text-sm bg-gray-100 px-2 py-1 rounded">{sessionInfo.user_id}</code>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Status</label>
              <div className="mt-1">
                <Badge variant={sessionInfo.status === 'active' ? 'default' : 'secondary'}>
                  {sessionInfo.status}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Source</label>
              <div className="mt-1">
                <Badge variant="outline">{sessionInfo.source}</Badge>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Started</label>
              <div className="mt-1 text-sm">{formatDate(sessionInfo.started_at)}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Last Activity</label>
              <div className="mt-1 text-sm">{formatDate(sessionInfo.last_activity)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chat Messages */}
      <Card>
        <CardHeader>
          <CardTitle>Conversation History</CardTitle>
          <CardDescription>
            {logs.length} messages in this session
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {logs.map((log, index) => (
              <div key={log.id} className="space-y-4">
                {/* User Message */}
                <div className="flex justify-end">
                  <div className="flex items-start space-x-2 max-w-[70%]">
                    <div className="flex-1">
                      <div className="bg-blue-600 text-white rounded-lg px-4 py-2">
                        <p className="text-sm">{log.prompt}</p>
                      </div>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          Turn {log.turn_index} • {formatDate(log.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>

                {/* Bot Response */}
                <div className="flex justify-start">
                  <div className="flex items-start space-x-2 max-w-[70%]">
                    <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="bg-gray-100 rounded-lg px-4 py-2">
                        <p className="text-sm">{log.response}</p>
                      </div>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(log.created_at)}
                        </span>
                        {getStatusBadge(log.status)}
                        {log.processing_time && (
                          <span className="text-xs text-muted-foreground">
                            {log.processing_time}ms
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Divider between conversations */}
                {index < logs.length - 1 && (
                  <div className="border-b border-gray-100"></div>
                )}
              </div>
            ))}

            {logs.length === 0 && (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold">No messages found</h3>
                <p className="text-muted-foreground">This session doesn't have any messages yet.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
