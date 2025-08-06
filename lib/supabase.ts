import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      chat_logs: {
        Row: {
          id: string
          user_id: string
          prompt: string
          response: string
          timestamp: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          prompt: string
          response: string
          timestamp?: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          prompt?: string
          response?: string
          timestamp?: string
          status?: string
          created_at?: string
        }
      }
      users: {
        Row: {
          id: string
          email: string
          name: string
          role: string
          created_at: string
        }
        Insert: {
          id: string
          email: string
          name: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string
          role?: string
          created_at?: string
        }
      }
    }
  }
}
