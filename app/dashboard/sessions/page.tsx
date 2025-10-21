'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { 
  Search, 
  MessageSquare, 
  Clock, 
  User, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  ArrowRight
} from 'lucide-react'

interface ChatSession {
  session_id: string
  user_id: string
  session_name: string
  started_at: string
  last_activity: string
  total_messages: number
  status: 'active' | 'ended' | 'timeout'
  source: string
  duration_minutes: number
  first_prompt: string
  successful_messages: number
  error_messages: number
}

const ITEMS_PER_PAGE = 20

export default function SessionsPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('session_summaries')
        .select('*', { count: 'exact' })
        .order('last_activity', { ascending: false })
        .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1)

      if (searchTerm) {
        query = query.or(`session_name.ilike.%${searchTerm}%,user_id.ilike.%${searchTerm}%,first_prompt.ilike.%${searchTerm}%`)
      }

      const { data, error, count } = await query

      if (error) throw error

      setSessions(data || [])
      setTotalCount(count || 0)
    } catch (error) {
      console.error('Error fetching sessions:', error)
    } finally {
      setLoading(false)
    }
  }, [currentPage, searchTerm])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>
      case 'ended':
        return <Badge variant="secondary">Ended</Badge>
      case 'timeout':
        return <Badge variant="destructive">Timeout</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'n8n':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700">n8n</Badge>
      case 'web':
        return <Badge variant="outline" className="bg-purple-50 text-purple-700">Web</Badge>
      case 'api':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700">API</Badge>
      default:
        return <Badge variant="outline">{source}</Badge>
    }
  }

  const formatDuration = (minutes: number) => {
    if (minutes < 1) return '< 1m'
    if (minutes < 60) return `${Math.round(minutes)}m`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = Math.round(minutes % 60)
    return `${hours}h ${remainingMinutes}m`
  }

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-8 bg-gray-200 rounded w-32 animate-pulse"></div>
          <div className="h-8 bg-gray-200 rounded w-48 animate-pulse"></div>
        </div>
        <Card>
          <CardHeader>
            <div className="h-6 bg-gray-200 rounded w-40 animate-pulse"></div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Chat Sessions
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and view chat sessions grouped by user conversations
          </p>
        </div>
        <Button onClick={fetchSessions} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-4 w-4 text-blue-600" />
              <div className="text-2xl font-bold">{totalCount}</div>
            </div>
            <p className="text-xs text-muted-foreground">Total Sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <div className="text-2xl font-bold">
                {sessions.filter(s => s.status === 'active').length}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Active Sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <User className="h-4 w-4 text-purple-600" />
              <div className="text-2xl font-bold">
                {new Set(sessions.map(s => s.user_id)).size}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Unique Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-orange-600" />
              <div className="text-2xl font-bold">
                {sessions.length > 0 
                  ? formatDuration(sessions.reduce((acc, s) => acc + s.duration_minutes, 0) / sessions.length)
                  : '0m'
                }
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Avg Duration</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sessions</CardTitle>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sessions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.session_id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-sm">
                          {session.session_name}
                        </div>
                        {session.first_prompt && (
                          <div className="text-xs text-muted-foreground truncate max-w-xs">
                            {session.first_prompt}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {session.user_id}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{session.total_messages}</span>
                        <div className="flex space-x-1">
                          {session.successful_messages > 0 && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                              ✓ {session.successful_messages}
                            </Badge>
                          )}
                          {session.error_messages > 0 && (
                            <Badge variant="outline" className="text-xs bg-red-50 text-red-700">
                              ✗ {session.error_messages}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">
                          {formatDuration(session.duration_minutes)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(session.status)}
                    </TableCell>
                    <TableCell>
                      {getSourceBadge(session.source)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(session.last_activity)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/dashboard/sessions/${session.session_id}`}>
                        <Button variant="ghost" size="sm">
                          View <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
                {Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} of {totalCount} sessions
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <div className="text-sm">
                  Page {currentPage} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
