# TradeZone Chat Widget - Installation Guide

## Overview

The TradeZone Chat Widget is a lightweight, embeddable chat interface that can be added to any website, including WooCommerce stores. It provides a seamless way for customers to interact with your AI assistant.

## Features

- ✅ **Easy Integration** - Single script tag installation
- ✅ **Customizable** - Colors, position, greeting message
- ✅ **Responsive** - Works on desktop and mobile
- ✅ **Lightweight** - ~15KB minified
- ✅ **No Dependencies** - Pure JavaScript, no jQuery or React required
- ✅ **Session Management** - Automatic guest session creation
- ✅ **Modern UI** - Clean, professional design

## Quick Start

### Method 1: Simple Installation (Recommended)

Add this code before the closing `</body>` tag on your website:

```html
<script 
  src="https://your-dashboard-domain.com/widget/chat-widget.js"
  data-api-url="https://your-dashboard-domain.com"
  data-position="bottom-right"
  data-primary-color="#2563eb"
></script>
```

### Method 2: Manual Initialization

```html
<script src="https://your-dashboard-domain.com/widget/chat-widget.js"></script>
<script>
  TradeZoneChat.init({
    apiUrl: 'https://your-dashboard-domain.com',
    position: 'bottom-right',
    primaryColor: '#2563eb',
    greeting: 'Hi! How can I help you today?',
    botName: 'Izacc',
    placeholder: 'Type your message...'
  });
</script>
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiUrl` | string | **Required** | Your dashboard API URL |
| `position` | string | `'bottom-right'` | Widget position: `'bottom-right'` or `'bottom-left'` |
| `primaryColor` | string | `'#2563eb'` | Primary color (hex code) |
| `greeting` | string | `'Hi! How can I help you today?'` | Initial greeting message |
| `botName` | string | `'Izacc'` | Bot display name |
| `placeholder` | string | `'Type your message...'` | Input placeholder text |

## WooCommerce Installation

### Option 1: Theme Functions (Recommended)

Add to your theme's `functions.php`:

```php
function tradezone_chat_widget() {
    ?>
    <script 
      src="https://your-dashboard-domain.com/widget/chat-widget.js"
      data-api-url="https://your-dashboard-domain.com"
      data-position="bottom-right"
      data-primary-color="#2563eb"
    ></script>
    <?php
}
add_action('wp_footer', 'tradezone_chat_widget');
```

### Option 2: WooCommerce Customizer

1. Go to **Appearance → Customize → Additional CSS**
2. Click **Additional Scripts** (if available)
3. Paste the widget script in the footer section

### Option 3: Plugin (Code Snippets)

1. Install **Code Snippets** plugin
2. Add new snippet with the script
3. Set to run on **Frontend Only**

## WordPress Installation

### Using a Plugin

1. Install **Insert Headers and Footers** plugin
2. Go to **Settings → Insert Headers and Footers**
3. Paste the widget script in the **Footer** section
4. Save changes

### Manual Installation

Add to your theme's `footer.php` before `</body>`:

```php
<script 
  src="https://your-dashboard-domain.com/widget/chat-widget.js"
  data-api-url="https://your-dashboard-domain.com"
  data-position="bottom-right"
  data-primary-color="#2563eb"
></script>
```

## Shopify Installation

1. Go to **Online Store → Themes**
2. Click **Actions → Edit Code**
3. Open `theme.liquid`
4. Add the widget script before `</body>`
5. Save changes

```liquid
<script 
  src="https://your-dashboard-domain.com/widget/chat-widget.js"
  data-api-url="https://your-dashboard-domain.com"
  data-position="bottom-right"
  data-primary-color="{{ settings.primary_color }}"
></script>
```

## Custom HTML Sites

Simply add the script tag before the closing `</body>` tag:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Website</title>
</head>
<body>
    <!-- Your content -->
    
    <!-- TradeZone Chat Widget -->
    <script 
      src="https://your-dashboard-domain.com/widget/chat-widget.js"
      data-api-url="https://your-dashboard-domain.com"
      data-position="bottom-right"
      data-primary-color="#2563eb"
    ></script>
</body>
</html>
```

## Customization Examples

### Match Your Brand Colors

```html
<script>
  TradeZoneChat.init({
    apiUrl: 'https://your-dashboard-domain.com',
    primaryColor: '#ff6b35', // Your brand color
    botName: 'Alex',
    greeting: 'Welcome to TradeZone! Need help finding the perfect gaming gear?'
  });
</script>
```

### Left-Side Position

```html
<script 
  src="https://your-dashboard-domain.com/widget/chat-widget.js"
  data-api-url="https://your-dashboard-domain.com"
  data-position="bottom-left"
></script>
```

### Custom Greeting for Different Pages

```html
<script>
  // Detect page and customize greeting
  const isProductPage = window.location.pathname.includes('/product/');
  const greeting = isProductPage 
    ? 'Interested in this product? Ask me anything!'
    : 'Hi! How can I help you today?';
  
  TradeZoneChat.init({
    apiUrl: 'https://your-dashboard-domain.com',
    greeting: greeting
  });
</script>
```

## Testing

After installation:

1. **Refresh your website**
2. **Look for the chat button** in the bottom-right (or bottom-left) corner
3. **Click the button** to open the chat
4. **Send a test message** like "Hello" or "What products do you have?"
5. **Verify the response** from your AI assistant

## Troubleshooting

### Widget Not Appearing

1. **Check browser console** for errors (F12 → Console)
2. **Verify API URL** is correct and accessible
3. **Check CORS settings** on your dashboard
4. **Ensure script loads** (Network tab in DevTools)

### Messages Not Sending

1. **Check API endpoint** is responding: `https://your-dashboard-domain.com/api/chatkit/agent`
2. **Verify session ID** is being generated (check console logs)
3. **Test API directly** with curl or Postman

### Styling Issues

1. **Check for CSS conflicts** with your theme
2. **Increase z-index** if widget is hidden behind other elements
3. **Adjust position** if overlapping with other elements

## CORS Configuration

If you're hosting the widget on a different domain than your dashboard, you need to configure CORS.

Add to your Next.js API routes:

```typescript
// app/api/chatkit/agent/route.ts
export async function POST(request: Request) {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*', // Or specify your domain
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  // Your existing code...
  
  return NextResponse.json(data, { headers });
}
```

## Advanced: Self-Hosting

To host the widget on your own domain:

1. **Copy `chat-widget.js`** to your website's assets folder
2. **Update the script src** to point to your local file
3. **Configure API URL** to point to your dashboard

```html
<script src="/assets/js/chat-widget.js"></script>
<script>
  TradeZoneChat.init({
    apiUrl: 'https://dashboard.tradezone.sg'
  });
</script>
```

## Security Considerations

1. **Use HTTPS** - Always serve the widget over HTTPS
2. **Validate API URL** - Ensure it points to your legitimate dashboard
3. **Rate Limiting** - Implement rate limiting on your API
4. **Session Management** - Sessions are ephemeral and client-side only
5. **Content Security Policy** - Add your dashboard domain to CSP if needed

## Performance

- **Widget Size**: ~15KB minified
- **Load Time**: <100ms on average connection
- **No External Dependencies**: Pure JavaScript
- **Lazy Loading**: Widget only loads when script executes
- **Minimal DOM Impact**: Single container element

## Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile browsers (iOS Safari, Chrome Android)

## Support

For issues or questions:
- **Documentation**: Check this guide and troubleshooting section
- **API Status**: Verify your dashboard is running and accessible
- **Console Logs**: Enable debug mode by checking browser console

## Next Steps

1. ✅ Install the widget on your website
2. ✅ Test with sample messages
3. ✅ Customize colors and greeting
4. ✅ Monitor chat logs in your dashboard
5. ✅ Optimize based on user interactions

---

**Need Help?** Contact your dashboard administrator or check the API documentation at `/docs/api`.
