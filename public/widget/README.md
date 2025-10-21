# TradeZone Chat Widget

A lightweight, embeddable chat widget for integrating AI-powered customer support on any website.

## Quick Start

### 1. Basic Installation

Add this script before the closing `</body>` tag:

```html
<script 
  src="https://your-dashboard.com/widget/chat-widget.js"
  data-api-url="https://your-dashboard.com"
  data-position="bottom-right"
  data-primary-color="#2563eb"
></script>
```

### 2. Test Locally

Open `demo.html` in your browser to see the widget in action.

## Files

- **chat-widget.js** - Main widget script (~15KB)
- **demo.html** - Demo page with examples
- **README.md** - This file

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| `data-api-url` | Dashboard API URL | Required |
| `data-position` | `bottom-right` or `bottom-left` | `bottom-right` |
| `data-primary-color` | Brand color (hex) | `#2563eb` |

## Features

✅ **Zero Dependencies** - Pure JavaScript  
✅ **Responsive Design** - Works on all devices  
✅ **Customizable** - Match your brand  
✅ **Lightweight** - ~15KB minified  
✅ **CORS Ready** - Works across domains  

## Platform Support

- ✅ WordPress / WooCommerce
- ✅ Shopify
- ✅ Custom HTML sites
- ✅ Any website with HTML access

## Documentation

See `/docs/widget-installation.md` for detailed installation instructions for different platforms.

## Support

For issues or questions, check the browser console for error messages and verify:
1. API URL is correct and accessible
2. CORS is properly configured
3. Dashboard is running

## License

Proprietary - TradeZone.sg
