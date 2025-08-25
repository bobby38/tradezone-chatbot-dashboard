'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { SidebarNav } from '@/components/sidebar-nav'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Allow bypassing auth locally when NEXT_PUBLIC_BYPASS_AUTH === 'true'
    const bypass = process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true'
    if (bypass) return

    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  const bypass = process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true'

  if (!bypass && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!bypass && !user) {
    return null
  }

  return (
    <div className="min-h-screen bg-background flex">
      <SidebarNav />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 py-6 px-4 sm:px-6 lg:px-8 overflow-auto">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
