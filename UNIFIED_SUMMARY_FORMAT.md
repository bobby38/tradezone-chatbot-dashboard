# Unified Trade-In Summary Format
## Used in: Chat Confirmation + Email Notification

This document defines the **single source of truth** format for trade-in summaries that will be used in:
1. Chat bot recap (before submission)
2. Chat bot confirmation (after submission)
3. Email notification to staff
4. Dashboard display

---

## Core Summary Function

```typescript
interface TradeInSummaryData {
  // Lead identification
  leadId: string;
  shortId: string; // First 8 chars for display
  
  // Trade type detection
  tradeType: 'cash_only' | 'trade_up' | 'trade_down' | 'even_swap';
  
  // Source device (what customer is trading in)
  sourceDevice: {
    brand: string;
    model: string;
    storage?: string;
    condition: string;
    accessories: string[];
    defects: string[];
    estimatedValue: number; // range_max
    photos: number; // count
  };
  
  // Target device (what customer wants) - null for cash_only
  targetDevice?: {
    name: string;
    price: number;
    availability: string;
  };
  
  // Financial calculation
  financial: {
    sourceValue: number; // Trade-in value
    targetPrice: number; // Retail price (0 for cash_only)
    netAmount: number;  // targetPrice - sourceValue
    direction: 'customer_pays' | 'tradezone_pays' | 'even'; // Based on netAmount
    paymentMethod: string; // top_up_payment_method or preferred_payout
  };
  
  // Contact information
  contact: {
    name: string;
    phone: string;
    email: string;
    telegram?: string;
  };
  
  // Additional info
  purchaseYear?: string;
  notes?: string;
  sessionId?: string;
  channel: 'text_chat' | 'voice_chat' | 'web_form';
  submittedAt: string;
}

// ============================================
// GENERATE UNIFIED SUMMARY
// ============================================
function generateUnifiedSummary(data: TradeInSummaryData, format: 'markdown' | 'html'): string {
  const { tradeType, sourceDevice, targetDevice, financial, contact } = data;
  
  // Determine transaction type label
  let transactionTitle = '';
  let transactionEmoji = '';
  
  if (tradeType === 'cash_only') {
    transactionTitle = 'Cash Trade-In';
    transactionEmoji = '💵';
  } else if (tradeType === 'trade_up') {
    transactionTitle = 'Trade-Up (Customer Pays Top-Up)';
    transactionEmoji = '⬆️';
  } else if (tradeType === 'trade_down') {
    transactionTitle = 'Trade-Down (Customer Receives Refund)';
    transactionEmoji = '⬇️';
  } else {
    transactionTitle = 'Even Swap';
    transactionEmoji = '↔️';
  }
  
  // Build device name
  const sourceDeviceName = [
    sourceDevice.brand,
    sourceDevice.model,
    sourceDevice.storage
  ].filter(Boolean).join(' ');
  
  // Accessories list
  const accessoriesList = sourceDevice.accessories.length > 0
    ? sourceDevice.accessories.join(', ')
    : 'None specified';
  
  // Defects list
  const defectsList = sourceDevice.defects.length > 0
    ? sourceDevice.defects.join(', ')
    : 'None';
  
  // Photos status
  const photosStatus = sourceDevice.photos > 0
    ? `${sourceDevice.photos} photo(s) uploaded ✅`
    : 'Not provided (Final quote upon inspection)';
  
  // Payment details based on direction
  let paymentSection = '';
  if (financial.direction === 'customer_pays') {
    paymentSection = `**💰 Payment Summary**
Top-Up Required: S$${Math.abs(financial.netAmount)}
Payment Method: ${financial.paymentMethod}`;
  } else if (financial.direction === 'tradezone_pays') {
    paymentSection = `**💰 Payout Summary**
Refund/Payout Amount: S$${Math.abs(financial.netAmount)}
Payout Method: ${financial.paymentMethod}`;
  } else {
    paymentSection = `**💰 Payment Summary**
Even Swap: No money exchanged`;
  }
  
  if (format === 'markdown') {
    return generateMarkdownSummary(data, {
      transactionTitle,
      transactionEmoji,
      sourceDeviceName,
      accessoriesList,
      defectsList,
      photosStatus,
      paymentSection
    });
  } else {
    return generateHtmlSummary(data, {
      transactionTitle,
      transactionEmoji,
      sourceDeviceName,
      accessoriesList,
      defectsList,
      photosStatus,
      paymentSection
    });
  }
}

// ============================================
// MARKDOWN FORMAT (for Chat Bot)
// ============================================
function generateMarkdownSummary(data: TradeInSummaryData, computed: any): string {
  const { sourceDevice, targetDevice, contact, financial } = data;
  const { transactionEmoji, transactionTitle, sourceDeviceName, accessoriesList, defectsList, photosStatus, paymentSection } = computed;
  
  // Header varies by trade type
  let headerSection = `${transactionEmoji} **${transactionTitle}**\n\n`;
  
  // Trade-For line (only for trade-up/down)
  let tradeForLine = '';
  if (targetDevice) {
    tradeForLine = `**Trade For:** ${sourceDeviceName} → ${targetDevice.name}\n\n`;
  }
  
  return `${headerSection}${tradeForLine}**Your Device (Trade-In)**
${sourceDeviceName}
• Condition: ${sourceDevice.condition}
• Accessories: ${accessoriesList}
• Defects: ${defectsList}
• Estimated Value: ~S$${sourceDevice.estimatedValue}
${data.purchaseYear ? `• Purchase Year: ${data.purchaseYear}\n` : ''}
${targetDevice ? `\n**Target Device (What You're Getting)**
${targetDevice.name}
• Retail Price: S$${targetDevice.price}
• Availability: ${targetDevice.availability}
` : ''}
${paymentSection}

**📞 Contact Information**
Name: ${contact.name}
Phone: ${contact.phone}
Email: ${contact.email}
${contact.telegram ? `Telegram: ${contact.telegram}` : ''}

**📸 Photos**
Status: ${photosStatus}

**Lead ID:** #${data.shortId}`;
}

// ============================================
// HTML FORMAT (for Email Notification)
// ============================================
function generateHtmlSummary(data: TradeInSummaryData, computed: any): string {
  const { sourceDevice, targetDevice, contact, financial } = data;
  const { transactionEmoji, transactionTitle, sourceDeviceName, accessoriesList, defectsList, photosStatus, paymentSection } = computed;
  
  // Trade-For section (only for trade-up/down)
  let tradeForHtml = '';
  if (targetDevice) {
    tradeForHtml = `
    <div class="field-group" style="background: #fff3cd; border-left-color: #ffc107;">
      <div class="field-label">🔄 Trade For</div>
      <div class="field-value" style="font-size: 18px; font-weight: bold;">
        ${sourceDeviceName} → ${targetDevice.name}
      </div>
    </div>`;
  }
  
  // Target device section (only for trade-up/down)
  let targetDeviceHtml = '';
  if (targetDevice) {
    targetDeviceHtml = `
    <div class="field-group">
      <div class="field-label">🎯 Target Device (What Customer Wants)</div>
      <div class="field-value">
        <strong>${targetDevice.name}</strong><br>
        Retail Price: <strong>S$${targetDevice.price}</strong><br>
        Availability: ${targetDevice.availability}
      </div>
    </div>`;
  }
  
  // Payment section styling based on direction
  let paymentBgColor = '#e3f2fd';
  let paymentBorderColor = '#2196f3';
  if (financial.direction === 'customer_pays') {
    paymentBgColor = '#fff3e0';
    paymentBorderColor = '#ff9800';
  } else if (financial.direction === 'tradezone_pays') {
    paymentBgColor = '#e8f5e9';
    paymentBorderColor = '#4caf50';
  }
  
  const paymentLabel = financial.direction === 'customer_pays' 
    ? '💳 Top-Up Required' 
    : financial.direction === 'tradezone_pays'
    ? '💰 Payout to Customer'
    : '↔️ Even Swap';
  
  const paymentAmount = financial.netAmount === 0
    ? 'No money exchanged'
    : `S$${Math.abs(financial.netAmount)} via ${financial.paymentMethod}`;
  
  return `
  <div class="content">
    <div class="submission-info">
      <strong>${transactionEmoji} ${transactionTitle}</strong><br>
      Lead ID: <strong>#${data.shortId}</strong><br>
      Submitted: ${new Date(data.submittedAt).toLocaleString()}<br>
      Channel: ${data.channel}
    </div>
    
    ${tradeForHtml}
    
    <div class="field-group">
      <div class="field-label">📱 Customer's Device (Trade-In)</div>
      <div class="field-value">
        <strong>${sourceDeviceName}</strong><br>
        Condition: ${sourceDevice.condition}<br>
        Accessories: ${accessoriesList}<br>
        Defects: ${defectsList}<br>
        ${data.purchaseYear ? `Purchase Year: ${data.purchaseYear}<br>` : ''}
        Estimated Value: <strong>~S$${sourceDevice.estimatedValue}</strong>
      </div>
    </div>
    
    ${targetDeviceHtml}
    
    <div class="field-group" style="background: ${paymentBgColor}; border-left-color: ${paymentBorderColor};">
      <div class="field-label">${paymentLabel}</div>
      <div class="field-value" style="font-size: 18px; font-weight: bold;">
        ${paymentAmount}
      </div>
    </div>
    
    <div class="field-group">
      <div class="field-label">📞 Contact Information</div>
      <div class="field-value">
        Name: <strong>${contact.name}</strong><br>
        Phone: <a href="tel:${contact.phone}">${contact.phone}</a><br>
        Email: <a href="mailto:${contact.email}">${contact.email}</a>
        ${contact.telegram ? `<br>Telegram: @${contact.telegram}` : ''}
      </div>
    </div>
    
    <div class="field-group">
      <div class="field-label">📸 Photos</div>
      <div class="field-value">${photosStatus}</div>
    </div>
    
    ${data.notes ? `
    <div class="field-group">
      <div class="field-label">📝 Additional Notes</div>
      <div class="field-value">${data.notes}</div>
    </div>
    ` : ''}
  </div>`;
}
```

---

## Example Outputs

### Example 1: Trade-Up (PS4 Pro → PS5 Pro)

**Markdown (Chat):**
```
⬆️ **Trade-Up (Customer Pays Top-Up)**

**Trade For:** Sony PS4 Pro 1TB → Sony PS5 Pro Digital Edition

**Your Device (Trade-In)**
Sony PS4 Pro 1TB
• Condition: Good
• Accessories: Box, cables, controllers
• Defects: None
• Estimated Value: ~S$120

**Target Device (What You're Getting)**
Sony PS5 Pro Digital Edition
• Retail Price: S$900
• Availability: In Stock

**💰 Payment Summary**
Top-Up Required: S$780
Payment Method: PayNow

**📞 Contact Information**
Name: Cab Test
Phone: +65 8448 9068
Email: bobby_dennie@hotmail.com

**📸 Photos**
Status: Not provided (Final quote upon inspection)

**Lead ID:** #81ad579d
```

**HTML (Email):**
Same content but with:
- Color-coded sections
- Orange background for top-up payment (customer pays)
- Clickable phone/email links
- "Trade For" section in yellow highlight
- Professional email styling

---

### Example 2: Cash Trade-In (No Target Device)

**Markdown (Chat):**
```
💵 **Cash Trade-In**

**Your Device (Trade-In)**
Sony PlayStation 5 1TB Disc Edition
• Condition: Good
• Accessories: Box, cables, controller
• Defects: None
• Estimated Value: ~S$450
• Purchase Year: 2023

**💰 Payout Summary**
Refund/Payout Amount: S$450
Payout Method: PayNow

**📞 Contact Information**
Name: John Doe
Phone: +65 9123 4567
Email: john@example.com

**📸 Photos**
Status: 2 photo(s) uploaded ✅

**Lead ID:** #abc12345
```

---

### Example 3: Trade-Down (PS5 Pro → Switch OLED)

**Markdown (Chat):**
```
⬇️ **Trade-Down (Customer Receives Refund)**

**Trade For:** Sony PS5 Pro → Nintendo Switch OLED

**Your Device (Trade-In)**
Sony PlayStation 5 Pro
• Condition: Mint
• Accessories: Box, cables, controller, charging dock
• Defects: None
• Estimated Value: ~S$550

**Target Device (What You're Getting)**
Nintendo Switch OLED
• Retail Price: S$420
• Availability: In Stock

**💰 Payout Summary**
Refund/Payout Amount: S$130
Payout Method: Cash

**📞 Contact Information**
Name: Jane Smith
Phone: +65 8765 4321
Email: jane@example.com

**📸 Photos**
Status: 3 photo(s) uploaded ✅

**Lead ID:** #xyz67890
```

---

## Integration Points

### 1. Chat Bot Recap (Before Submission)
```typescript
// After collecting all info, before submitting
const summary = generateUnifiedSummary(leadData, 'markdown');
await sendMessage(`📋 **Please Review Your Trade Details**\n\n${summary}\n\n---\nEverything look good? Reply "yes" to submit, or tell me what to change.`);
```

### 2. Chat Bot Confirmation (After Submission)
```typescript
// After successful submission
const summary = generateUnifiedSummary(leadData, 'markdown');
await sendMessage(`✅ **Submission Successful!**\n\n${summary}\n\n**Next Steps**\n1️⃣ Our team will contact you within 24 hours\n2️⃣ Visit our store for inspection\n3️⃣ Complete transaction\n\n**Store Location**\n📍 21 Hougang St 51, #02-09\n🕐 11am - 8pm Daily\n\n---\nNeed anything else?`);
```

### 3. Email Notification to Staff
```typescript
// In lib/trade-in/service.ts
const htmlSummary = generateUnifiedSummary(leadData, 'html');
await EmailService.sendFormNotification({
  type: 'trade-in',
  htmlBody: wrapEmailTemplate(htmlSummary), // Wrap in email HTML shell
  subject: `🎮 New Trade-In Request - #${leadData.shortId}`,
  ...
});
```

### 4. Dashboard Display
```typescript
// In /dashboard/trade-in/[id]
const summary = generateUnifiedSummary(leadData, 'markdown');
// Render with markdown parser
<ReactMarkdown>{summary}</ReactMarkdown>
```

---

## Benefits

✅ **Single Source of Truth** - One function generates all formats  
✅ **Consistency** - User sees same details in chat and email  
✅ **Staff Efficiency** - Email has all info, no need to check dashboard  
✅ **Clear Trade Direction** - "Trade For" line shows X → Y clearly  
✅ **Smart Payment Labels** - Top-up vs Payout based on math  
✅ **Professional** - Both formats look polished and complete  
✅ **Maintainable** - Change format once, updates everywhere  

---

## Key Fields to Add to Database

```sql
ALTER TABLE trade_in_leads ADD COLUMN IF NOT EXISTS
  target_device TEXT,              -- "Sony PS5 Pro Digital Edition"
  target_price NUMERIC,            -- 900
  net_amount NUMERIC,              -- 780 (positive) or -130 (negative)
  trade_type TEXT CHECK (trade_type IN 
    ('cash_only', 'trade_up', 'trade_down', 'even_swap')),
  top_up_payment_method TEXT CHECK (top_up_payment_method IN 
    ('cash', 'paynow', 'bank', 'installment')),
  source_device_name TEXT,         -- Full name for easy reference
  photos_count INTEGER DEFAULT 0;  -- Track number of photos
```
