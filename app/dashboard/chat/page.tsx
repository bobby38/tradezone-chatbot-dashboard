'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageSquare, Phone, Upload, Mic, MicOff, Send, Loader2 } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function ChatPage() {
  const [mode, setMode] = useState<'text' | 'voice'>('text')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Generate session ID on mount (Guest-XX pattern)
  useEffect(() => {
    const hash = Math.floor(Math.random() * 9999) + 1
    const sid = `Guest-${hash.toString().padStart(4, '0')}`
    setSessionId(sid)
    console.log('[Chat] Session initialized:', sid)
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send text message to ChatKit agent
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    // Add user message to UI
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chatkit/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId,
          history: messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)
      }

      const data = await response.json()

      // Add assistant response to UI
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])

    } catch (error) {
      console.error('[Chat] Error sending message:', error)

      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again or contact support at contactus@tradezone.sg',
        timestamp: new Date()
      }

      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  // Handle voice call (placeholder - full implementation requires WebRTC/WebSocket)
  const startVoiceCall = async () => {
    setMode('voice')
    setIsRecording(true)

    try {
      // Get realtime configuration
      const response = await fetch('/api/chatkit/realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      })

      const config = await response.json()
      console.log('[Voice] Realtime config:', config)

      // TODO: Implement WebSocket connection to OpenAI Realtime API
      // This would require additional WebRTC/WebSocket setup
      alert('Voice calling is configured! Full WebSocket implementation coming soon.\\n\\nConfig: ' + config.config.model + ' with ' + config.config.voice + ' voice')

    } catch (error) {
      console.error('[Voice] Error starting call:', error)
      alert('Failed to start voice call. Please try text chat.')
      setMode('text')
      setIsRecording(false)
    }
  }

  const endVoiceCall = () => {
    setIsRecording(false)
    setMode('text')
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-4 md:px-0">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
          Chat with Izacc
        </h1>
        <p className="text-muted-foreground">
          Your TradeZone AI Assistant • Session: {sessionId}
        </p>
      </div>

      {/* Welcome Card */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle>Welcome to TradeZone!</CardTitle>
          <CardDescription>
            Ask me about products, prices, trade-ins, or store information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Welcome Avatar Placeholder */}
          <div className="aspect-video bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-black/20"></div>
            <MessageSquare className="h-24 w-24 text-white opacity-80 relative z-10" />
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <p className="text-white text-sm font-medium">Hi! I'm Izacc from TradeZone</p>
            </div>
          </div>

          {/* Mode Toggle Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <Button
              size="lg"
              variant={mode === 'text' ? 'default' : 'outline'}
              onClick={() => setMode('text')}
              className="w-full h-14"
              disabled={isRecording}
            >
              <MessageSquare className="mr-2 h-5 w-5" />
              CHAT NOW
            </Button>
            <Button
              size="lg"
              variant={mode === 'voice' ? 'default' : 'outline'}
              onClick={startVoiceCall}
              className="w-full h-14"
              disabled={isRecording}
            >
              <Phone className="mr-2 h-5 w-5" />
              START A CALL
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Text Chat Interface */}
      {mode === 'text' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Text Chat
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Messages Container */}
            <div className="space-y-4 mb-4 max-h-[500px] overflow-y-auto rounded-lg border p-4 bg-muted/20">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  <p>Start a conversation! Ask me anything about TradeZone.</p>
                  <p className="text-sm mt-2">Try: "What gaming headphones do you have?" or "I want to trade in my PS5"</p>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      {msg.content.split('\n').map((line, i) => (
                        <p key={i} className="mb-1 last:mb-0">{line}</p>
                      ))}
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      {msg.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Izacc is typing...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex gap-2">
              <Input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder="Ask about products, prices, trade-ins..."
                className="flex-1"
                disabled={isLoading}
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                size="icon"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
              <Button variant="outline" size="icon" disabled>
                <Upload className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-xs text-muted-foreground mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </CardContent>
        </Card>
      )}

      {/* Voice Call Interface */}
      {mode === 'voice' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Voice Call
            </CardTitle>
            <CardDescription>
              Using gpt-realtime-mini for cost-effective voice conversations
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className={`h-32 w-32 rounded-full flex items-center justify-center mb-6 transition-all ${
              isRecording
                ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/50'
                : 'bg-primary'
            }`}>
              <Mic className="h-16 w-16 text-white" />
            </div>

            <p className="text-lg font-medium mb-2">
              {isRecording ? 'Listening...' : 'Voice call ready'}
            </p>

            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              {isRecording
                ? 'Speak naturally. I can help you find products, answer questions, or process trade-ins.'
                : 'Click the button below to start your voice conversation with Izacc'
              }
            </p>

            <Button
              size="lg"
              variant={isRecording ? 'destructive' : 'default'}
              onClick={isRecording ? endVoiceCall : startVoiceCall}
              className="px-8"
            >
              {isRecording ? (
                <>
                  <MicOff className="mr-2 h-5 w-5" />
                  End Call
                </>
              ) : (
                <>
                  <Mic className="mr-2 h-5 w-5" />
                  Start Call
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Beta Notice */}
      <p className="text-xs text-center text-muted-foreground">
        Beta version: This chatbot can make mistakes. Session: {sessionId}
      </p>
    </div>
  )
}
