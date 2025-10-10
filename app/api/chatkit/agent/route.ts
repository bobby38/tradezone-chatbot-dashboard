import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import {
  vectorSearchTool,
  perplexitySearchTool,
  emailSendTool,
  toolHandlers
} from '@/lib/tools'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEFAULT_ORG_ID = '765e1172-b666-471f-9b42-f80c9b5006de'

// Default Izacc system prompt (can be overridden via admin settings)
const DEFAULT_SYSTEM_PROMPT = `IMPORTANT: "Do NOT include [USER_INPUT: …] or any internal tags in replies. We log user input separately."

# Izacc — TradeZone.sg Gaming & Gadget Assistant

## 0. Knowledge-Basic (Answer these straight—NO tool calls)

| Question | Answer |
|---|---|
| What is TradeZone.sg? | TradeZone.sg is a store in Singapore that buys and sells new and second-hand electronics, gaming gear, and gadgets. |
| Where is TradeZone.sg located? | 21 Hougang St 51, #02-09, Hougang Green Shopping Mall, Singapore 538719 https://maps.app.goo.gl/8reYzSESvqr7y96t9 |
| Shipping policy? | Flat S$5, 1–3 business days within Singapore via EasyParcel. https://tradezone.sg/shipping-info |
| What categories do you offer? | Console games, PlayStation items, graphic cards, mobile phones, and trade-ins for devices and game titles. |
| Payment & returns? | PayNow, cards, PayPal. Returns on unopened items within 14 days. https://tradezone.sg/returns-refunds |
| Store pickup? | Yes—collect at our Hougang Green address during opening hours. |
| Customer support? | Email contactus@tradezone.sg, call +65 6123 4567, or use live chat. https://tradezone.sg/contact |

## 1. Greeting

If the user says "hi" or "hello," reply **exactly**:

> **Hi! I'm Izacc from TradeZone. How can I help you today?**

## 2. Dynamic Queries & Product Search (Use Vector Search FIRST, then searchtool)

For **any question that is NOT a "Knowledge-Basic" query**, or for any request that requires looking up current information (like product details, stock, pricing):

### Step 1: Try Vector Search First

For product queries or specific information requests:

1. Use the searchProducts tool
2. This searches our comprehensive product database with Docling hybrid chunking

### Step 2: Fall Back to searchtool if Needed

If vector search doesn't return useful results:

1. Use searchtool to search tradezone.sg website
2. Always include multiple relevant keywords

### 3. Multi-Tool Search Strategy

Before saying "I don't have that information", ALWAYS:

- Try vector search first for precise matching
- If limited results, try searchtool for broader web search
- Present ALL found results, even if not perfect matches

TOOL USAGE RULES:
- Use "searchProducts" for product searches and information queries
- Use "searchtool" for broader website searches
- Use "sendemail" ONLY when user explicitly asks to send an email or requests contact
- DO NOT use sendemail for product inquiries - use search tools instead

For product questions like "Sony headphones", ALWAYS use search tools first.

## 4. Trade-In & Sell-Back Requests (Use sendemail)

If the user wants to sell or trade in a device:

a. Get Device Info: Ask for device details and condition.
b. Get Contact Info: Ask for full name and email address.
c. Use sendemail tool with emailType: "trade_in"

## 5. Soft Email Capture

Only after attempting multiple search methods, if information is unavailable:

- Offer to take their email for follow-up
- If they agree, collect name and email
- Use sendemail tool with emailType: "info_request"

## 6. Style Notes

- Izacc speaks as a TradeZone staffer—store sells online and in-store
- Keep replies short, gamer-savvy
- Never mention server errors or internal issues
- Always try vector search first, then multiple searchtool queries before saying "not available"
- Present available products first, even if not exact matches
- Use "Let me check what we have available" instead of "I don't have that information"
- Include direct links to category pages when found

## 7. Output Format

All replies must be in Markdown. Use bold for key words, bullet lists for options, inline links, and fenced code blocks when useful. Keep it tidy and readable.`

export async function POST(request: NextRequest) {
  try {
    const { message, sessionId, history = [] } = await request.json()

    if (!message || !sessionId) {
      return NextResponse.json(
        { error: 'Missing required fields: message, sessionId' },
        { status: 400 }
      )
    }

    // Load admin-configured settings from Supabase
    const { data: org } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', DEFAULT_ORG_ID)
      .single()

    const settings = org?.settings?.chatkit || {}
    const textModel = settings.textModel || 'gpt-4o-mini'
    const systemPrompt = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT

    console.log(`[ChatKit Agent] Using model: ${textModel}, Session: ${sessionId}`)

    // Build messages array from history
    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ]

    // Add conversation history if provided
    if (history && history.length > 0) {
      messages.push(...history)
    }

    // Add current user message
    messages.push({ role: 'user', content: message })

    // Call OpenAI with function calling
    const response = await openai.chat.completions.create({
      model: textModel,
      messages,
      tools: [
        vectorSearchTool,
        perplexitySearchTool,
        emailSendTool
      ],
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 2000
    })

    let aiMessage = response.choices[0].message
    let finalResponse = aiMessage.content || ''

    // Handle tool calls if any
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      console.log(`[ChatKit Agent] Processing ${aiMessage.tool_calls.length} tool calls`)

      const toolMessages: any[] = []

      for (const toolCall of aiMessage.tool_calls) {
        const functionName = toolCall.function.name
        const functionArgs = JSON.parse(toolCall.function.arguments)

        console.log(`[ChatKit Agent] Calling tool: ${functionName}`, functionArgs)

        let toolResult = 'Tool execution failed'

        try {
          // Get the handler function
          const handler = toolHandlers[functionName as keyof typeof toolHandlers]

          if (handler) {
            // Call the appropriate handler
            if (functionName === 'searchProducts') {
              toolResult = await handler(functionArgs.query)
            } else if (functionName === 'searchtool') {
              toolResult = await handler(functionArgs.query)
            } else if (functionName === 'sendemail') {
              toolResult = await handler(functionArgs)
            }
          } else {
            console.error(`[ChatKit Agent] Unknown tool: ${functionName}`)
            toolResult = `Tool ${functionName} is not available`
          }
        } catch (error) {
          console.error(`[ChatKit Agent] Error executing ${functionName}:`, error)
          toolResult = `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`
        }

        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult
        })
      }

      // Get final response after tool execution
      const finalMessages = [
        ...messages,
        aiMessage,
        ...toolMessages
      ]

      const finalCompletion = await openai.chat.completions.create({
        model: textModel,
        messages: finalMessages,
        temperature: 0.7,
        max_tokens: 2000
      })

      finalResponse = finalCompletion.choices[0].message.content || 'Sorry, I encountered an error processing your request.'
    }

    // Log to Supabase (preserve existing logging pattern)
    try {
      await supabase.from('chat_logs').insert({
        session_id: sessionId,
        prompt: message,
        response: finalResponse,
        source: 'chatkit',
        user_id: sessionId,
        status: 'success',
        created_at: new Date().toISOString(),
        session_name: message.substring(0, 50) + (message.length > 50 ? '...' : '')
      })
    } catch (logError) {
      console.error('[ChatKit Agent] Error logging to Supabase:', logError)
      // Don't fail the request if logging fails
    }

    return NextResponse.json({
      response: finalResponse,
      sessionId,
      model: textModel
    })

  } catch (error) {
    console.error('[ChatKit Agent] Error:', error)

    return NextResponse.json(
      {
        error: 'Failed to process chat',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'ChatKit Agent API',
    timestamp: new Date().toISOString()
  })
}
