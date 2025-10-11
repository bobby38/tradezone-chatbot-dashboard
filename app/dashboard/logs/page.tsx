'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatDate, exportToCSV } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu'
import { 
  Search, 
  Download, 
  Trash2, 
  MoreHorizontal, 
  ChevronLeft, 
  ChevronRight,
  RefreshCw
} from 'lucide-react'

interface ChatLog {
  id: string
  user_id: string
  prompt: string
  response: string
  timestamp: string
  status: string
  created_at: string
}

const DEFAULT_PAGE_SIZE = 25

export default function ChatLogsPage() {
  const [logs, setLogs] = useState<ChatLog[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedLogs, setSelectedLogs] = useState<string[]>([])
  const [showResponse, setShowResponse] = useState(false)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('chat_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((currentPage - 1) * pageSize, currentPage * pageSize - 1)

      if (searchTerm) {
        query = query.or(`prompt.ilike.%${searchTerm}%,response.ilike.%${searchTerm}%`)
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error, count } = await query

      if (error) throw error

      setLogs(data || [])
      setTotalCount(count || 0)
    } catch (error) {
      console.error('Error fetching logs:', error)
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, searchTerm, statusFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleDelete = async (logIds: string[]) => {
    if (!confirm(`Are you sure you want to delete ${logIds.length} log(s)?`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('chat_logs')
        .delete()
        .in('id', logIds)

      if (error) throw error

      setSelectedLogs([])
      fetchLogs()
    } catch (error) {
      console.error('Error deleting logs:', error)
      alert('Error deleting logs. Please try again.')
    }
  }

  const handleExport = () => {
    if (logs.length === 0) {
      alert('No data to export')
      return
    }

    const exportData = logs.map(log => ({
      id: log.id,
      prompt: log.prompt,
      response: log.response,
      status: log.status,
      timestamp: log.timestamp,
      created_at: log.created_at
    }))

    exportToCSV(exportData, `chat-logs-${new Date().toISOString().split('T')[0]}.csv`)
  }

  const handleSelectLog = (logId: string) => {
    setSelectedLogs(prev => 
      prev.includes(logId) 
        ? prev.filter(id => id !== logId)
        : [...prev, logId]
    )
  }

  const handleSelectAll = () => {
    if (selectedLogs.length === logs.length) {
      setSelectedLogs([])
    } else {
      setSelectedLogs(logs.map(log => log.id))
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Chat Logs</h1>
        <p className="text-gray-600">View and manage all chatbot conversations</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Conversation History</CardTitle>
              <CardDescription>
                {totalCount} total conversations
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Status filter */}
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as 'all'|'success'|'error'); setCurrentPage(1) }}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              {/* Page size */}
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1) }}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Page size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search conversations..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-10 w-64"
                />
              </div>
              <Button onClick={fetchLogs} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button onClick={handleExport} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button 
                onClick={() => setShowResponse(v => !v)} 
                variant="outline" 
                size="sm"
                className="text-xs"
              >
                ↔︎ Swap
              </Button>
              {selectedLogs.length > 0 && (
                <Button 
                  onClick={() => handleDelete(selectedLogs)} 
                  variant="destructive" 
                  size="sm"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedLogs.length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={selectedLogs.length === logs.length && logs.length > 0}
                        onChange={handleSelectAll}
                        className="rounded"
                      />
                    </TableHead>
                    <TableHead>Session ID</TableHead>
                    <TableHead>{showResponse ? 'Response' : 'Prompt'}</TableHead>
                    <TableHead>Turns</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedLogs.includes(log.id)}
                          onChange={() => handleSelectLog(log.id)}
                          className="rounded"
                        />
                      </TableCell>
                      <TableCell className="font-mono">
                        <Link 
                          href={`/dashboard/logs/${log.user_id || 'session'}`}
                          className="text-primary hover:text-primary/80 underline"
                        >
                          {(log.user_id || 'unknown').slice(0, 8)}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={showResponse ? log.response : log.prompt}>
                          {showResponse ? log.response : log.prompt}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          1
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          log.status === 'success' 
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {log.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => handleDelete([log.id])}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {logs.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No chat logs found</p>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-gray-700">
                    Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} results
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    {/* Quick page size control */}
                    <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1) }}>
                      <SelectTrigger className="w-24">
                        <SelectValue placeholder="Rows" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
          </>
        )}
      </CardContent>
    </Card>
  </div>
)
}
