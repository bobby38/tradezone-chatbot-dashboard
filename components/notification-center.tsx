'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { 
  Bell, 
  BellRing, 
  Check, 
  CheckCheck, 
  Clock,
  AlertTriangle,
  Info,
  MessageSquare,
  FileText,
  Mail,
  Trash2
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Notification {
  id: string
  type: 'form_submission' | 'chat_alert' | 'system_alert' | 'email_extracted'
  title: string
  message: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  read: boolean
  created_at: string
  data?: any
  action_url?: string
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const unreadCount = notifications.filter(n => !n.read).length

  useEffect(() => {
    fetchNotifications()
    // Set up polling for new notifications
    const interval = setInterval(fetchNotifications, 30000) // Every 30 seconds
    return () => clearInterval(interval)
  }, [])

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications')
      if (response.ok) {
        const data = await response.json()
        setNotifications(data.notifications || [])
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ read: true })
      })

      if (response.ok) {
        setNotifications(prev => 
          prev.map(n => n.id === id ? { ...n, read: true } : n)
        )
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST'
      })

      if (response.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const deleteNotification = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setNotifications(prev => prev.filter(n => n.id !== id))
      }
    } catch (error) {
      console.error('Failed to delete notification:', error)
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id)
    }
    
    if (notification.action_url) {
      window.open(notification.action_url, '_blank')
    }
    
    setOpen(false)
  }

  const getNotificationIcon = (type: string, priority: string) => {
    const iconClass = priority === 'urgent' ? 'text-red-500' : 
                     priority === 'high' ? 'text-orange-500' :
                     priority === 'medium' ? 'text-blue-500' : 'text-gray-500'

    switch (type) {
      case 'form_submission':
        return <FileText className={`h-4 w-4 ${iconClass}`} />
      case 'chat_alert':
        return <MessageSquare className={`h-4 w-4 ${iconClass}`} />
      case 'email_extracted':
        return <Mail className={`h-4 w-4 ${iconClass}`} />
      case 'system_alert':
        return <AlertTriangle className={`h-4 w-4 ${iconClass}`} />
      default:
        return <Info className={`h-4 w-4 ${iconClass}`} />
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge variant="destructive" className="text-xs">Urgent</Badge>
      case 'high':
        return <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">High</Badge>
      case 'medium':
        return <Badge variant="outline" className="text-xs">Medium</Badge>
      default:
        return null
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          {unreadCount > 0 ? (
            <BellRing className="h-5 w-5" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs p-0"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent className="w-80 max-h-96 overflow-y-auto" align="end">
        <div className="flex items-center justify-between p-2">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={markAllAsRead}
              className="text-xs h-6 px-2"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        
        <DropdownMenuSeparator />
        
        {loading ? (
          <div className="p-4 text-center text-muted-foreground">
            <Clock className="h-4 w-4 animate-spin mx-auto mb-2" />
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No notifications</p>
            <p className="text-xs">You're all caught up!</p>
          </div>
        ) : (
          notifications.slice(0, 10).map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className={`p-3 cursor-pointer hover:bg-muted/50 ${
                !notification.read ? 'bg-blue-50 dark:bg-blue-950/30' : ''
              }`}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="flex items-start gap-3 w-full">
                <div className="flex-shrink-0 mt-0.5">
                  {getNotificationIcon(notification.type, notification.priority)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className={`text-sm font-medium truncate ${
                      !notification.read ? 'text-primary' : 'text-foreground'
                    }`}>
                      {notification.title}
                    </p>
                    {getPriorityBadge(notification.priority)}
                  </div>
                  
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                    {notification.message}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </span>
                    
                    <div className="flex items-center gap-1">
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            markAsRead(notification.id)
                          }}
                          className="h-6 w-6 p-0"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteNotification(notification.id)
                        }}
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
                
                {!notification.read && (
                  <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                )}
              </div>
            </DropdownMenuItem>
          ))
        )}
        
        {notifications.length > 10 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="justify-center text-center">
              <Button variant="ghost" size="sm" className="text-xs">
                View all notifications
              </Button>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}