'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { 
  BarChart3, 
  MessageSquare, 
  Settings, 
  User, 
  LogOut,
  Menu,
  Brain,
  ShoppingCart,
  FileText,
  Mail,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { NotificationCenter } from '@/components/notification-center'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3, category: 'main' },
  { name: 'Chat Logs', href: '/dashboard/logs', icon: MessageSquare, category: 'main' },
  { name: 'Form Submissions', href: '/dashboard/submissions', icon: FileText, category: 'main' },
  { name: 'Email Extraction', href: '/dashboard/emails', icon: Mail, category: 'analysis' },
  { name: 'AI Insights', href: '/dashboard/insights', icon: Brain, category: 'analysis' },
  { name: 'AI Analytics', href: '/dashboard/analytics', icon: Brain, category: 'analysis' },
  { name: 'WooCommerce', href: '/dashboard/woocommerce', icon: ShoppingCart, category: 'integrations' },
  { name: 'Google Analytics', href: '/dashboard/google-analytics', icon: BarChart3, category: 'integrations' },
]

const categories = {
  main: { label: 'Main', items: navigation.filter(n => n.category === 'main') },
  analysis: { label: 'Analysis', items: navigation.filter(n => n.category === 'analysis') },
  integrations: { label: 'Integrations', items: navigation.filter(n => n.category === 'integrations') }
}

interface SidebarNavProps {
  collapsed?: boolean
}

export function SidebarNav({ collapsed: controlledCollapsed }: SidebarNavProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const { user, signOut } = useAuth()

  const collapsed = controlledCollapsed ?? internalCollapsed

  const handleSignOut = async () => {
    await signOut()
  }

  const NavContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className={cn('flex flex-col h-full', isMobile && 'p-4')}>
      {/* Header */}
      <div className={cn(
        'flex items-center px-4 py-6 border-b border-border',
        collapsed && !isMobile && 'px-2 justify-center',
        isMobile && 'px-0'
      )}>
        <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center mr-3 flex-shrink-0">
          <span className="text-sm font-bold text-primary-foreground">T</span>
        </div>
        {(!collapsed || isMobile) && (
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
            Tradezone
          </h1>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-6 overflow-y-auto">
        {Object.entries(categories).map(([key, category]) => (
          <div key={key}>
            {(!collapsed || isMobile) && (
              <h3 className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {category.label}
              </h3>
            )}
            <div className="space-y-1">
              {category.items.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => isMobile && setMobileOpen(false)}
                    className={cn(
                      'flex items-center px-2 py-2.5 text-sm font-medium rounded-md transition-colors group',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                      collapsed && !isMobile && 'justify-center px-3'
                    )}
                  >
                    <Icon className={cn(
                      'h-5 w-5 flex-shrink-0',
                      !collapsed || isMobile ? 'mr-3' : 'mr-0'
                    )} />
                    {(!collapsed || isMobile) && (
                      <span className="truncate">{item.name}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn(
        'px-4 py-4 border-t border-border',
        collapsed && !isMobile && 'px-2'
      )}>
        <div className="flex items-center space-x-4">
          {(!collapsed || isMobile) && <NotificationCenter />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  'flex items-center justify-start w-full',
                  collapsed && !isMobile && 'w-10 h-10 p-0 justify-center'
                )}
              >
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground flex-shrink-0">
                  <span className="text-sm font-medium">
                    {user?.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                {(!collapsed || isMobile) && (
                  <div className="ml-3 text-left">
                    <p className="text-sm font-medium truncate max-w-32">{user?.email}</p>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="flex items-center justify-start gap-2 p-2">
                <div className="flex flex-col space-y-1 leading-none">
                  <p className="font-medium">{user?.email}</p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={cn(
        'hidden md:flex md:flex-shrink-0 transition-all duration-300',
        collapsed ? 'md:w-16' : 'md:w-64'
      )}>
        <div className="flex flex-col">
          <div className="flex flex-col flex-grow bg-card border-r border-border shadow-sm relative">
            <NavContent />
            
            {/* Collapse Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setInternalCollapsed(!collapsed)}
              className="absolute -right-3 top-20 h-6 w-6 rounded-full border border-border bg-background shadow-md hover:shadow-lg"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="md:hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border shadow-sm">
          <div className="flex items-center">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="mr-2">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <NavContent isMobile />
              </SheetContent>
            </Sheet>
            
            <div className="flex items-center">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center mr-3">
                <span className="text-sm font-bold text-primary-foreground">T</span>
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                Tradezone
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <NotificationCenter />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full">
                  <span className="text-sm font-medium">
                    {user?.email?.charAt(0).toUpperCase()}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    <p className="font-medium">{user?.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </>
  )
}