# Microsoft 365 Roadmap Dashboard 🚀

A modern, responsive web dashboard for visualizing Microsoft 365's public roadmap data. Built with vanilla HTML, CSS, and JavaScript for easy hosting on GitHub Pages.

![Dashboard Preview](https://img.shields.io/badge/Status-Ready%20for%20GitHub%20Pages-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue) ![Version](https://img.shields.io/badge/Version-1.0.0-orange)

## ✨ Features

### 🎨 Modern Design
- **Microsoft-inspired UI** with Fluent Design elements
- **Fully responsive** - works on desktop, tablet, and mobile
- **Dark/light theme support** via CSS variables
- **Smooth animations** and transitions

### 📊 Multiple Views
- **Cards View**: Rich cards with feature details and tags
- **Timeline View**: Chronological roadmap with visual timeline
- **Table View**: Compact data table for quick scanning

### 🔍 Powerful Filtering
- **Real-time search** across titles and descriptions
- **Service filtering** (Teams, SharePoint, Exchange, etc.)
- **Status filtering** (In Development, Rolling Out, etc.)
- **Platform filtering** (Web, Desktop, Mobile)
- **Timeline filtering** (This Month, Quarter, Year)

### 📈 Data Features
- **Live API integration** with Microsoft's official roadmap
- **Local caching** for offline access and performance
- **Automatic updates** via scheduled scripts
- **Data statistics** and analytics
- **Export capabilities** (JSON format)

### 🚀 GitHub Pages Ready
- **Static deployment** - no server required
- **Automated updates** via GitHub Actions
- **CDN optimized** for fast loading
- **SEO optimized** meta tags

## 🚀 Quick Start

### Option 1: GitHub Pages (Recommended)

1. **Fork this repository**
   ```bash
   # Click "Fork" on GitHub or use GitHub CLI
   gh repo fork your-username/m365-roadmap-dashboard
   ```

2. **Enable GitHub Pages**
   - Go to repository Settings → Pages
   - Source: Deploy from a branch
   - Branch: `main` (or `gh-pages` if using automated updates)

3. **Access your dashboard**
   - URL: `https://your-username.github.io/m365-roadmap-dashboard/`

### Option 2: Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/m365-roadmap-dashboard.git
   cd m365-roadmap-dashboard
   ```

2. **Serve locally**
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Using PHP
   php -S localhost:8000
   ```

3. **Open in browser**
   - Navigate to `http://localhost:8000`

## 📁 Project Structure

```
m365-roadmap-dashboard/
├── index.html              # Main dashboard page
├── css/
│   └── styles.css          # Responsive styles and themes
├── js/
│   └── app.js             # Dashboard functionality
├── data/
│   ├── sample-data.json   # Sample data for development
│   └── roadmap-data.json  # Live data (generated)
├── scripts/
│   ├── update-data.js     # Node.js data fetcher
│   └── update.sh          # Automated update script
├── logs/                  # Update logs (auto-created)
└── README.md             # This file
```

## 🔧 Configuration

### Environment Variables

For automated updates, you can configure these environment variables:

```bash
# Data Update Configuration
OUTPUT_DIR="./data"                    # Data directory
LOG_LEVEL="info"                      # Logging level (debug|info|warn|error)

# GitHub Pages Deployment
GITHUB_TOKEN="ghp_your_token_here"    # GitHub personal access token
GITHUB_REPO="username/repo-name"      # Repository name
GH_PAGES_BRANCH="gh-pages"           # Deployment branch
```

### Manual Data Updates

Update the roadmap data manually:

```bash
# Install Node.js dependencies (none required - vanilla JS!)
# Just run the update script
cd scripts
node update-data.js

# Or use the automated script
./update.sh
```

### Automated Updates

#### Using Cron (Linux/macOS)

Add to your crontab (`crontab -e`):

```bash
# Update every 4 hours
0 */4 * * * /path/to/m365-roadmap-dashboard/scripts/update.sh --quiet

# Update and deploy daily at 6 AM
0 6 * * * /path/to/m365-roadmap-dashboard/scripts/update.sh --deploy --quiet
```

#### Using GitHub Actions

Create `.github/workflows/update-data.yml`:

```yaml
name: Update Roadmap Data

on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC
  workflow_dispatch:      # Manual trigger

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - name: Update data
        run: |
          cd scripts
          node update-data.js
        env:
          OUTPUT_DIR: '../data'
      
      - name: Commit changes
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"
          git add data/
          git diff --staged --quiet || git commit -m "Update roadmap data"
          git push
```

## 🎨 Customization

### Styling

The dashboard uses CSS custom properties for easy theming:

```css
:root {
  /* Primary Colors */
  --primary-color: #0078d4;
  --primary-hover: #106ebe;
  
  /* Background */
  --bg-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  
  /* Cards */
  --card-bg: rgba(255, 255, 255, 0.95);
  --card-border: rgba(255, 255, 255, 0.2);
}
```

### Adding Custom Filters

Extend the filtering system in `js/app.js`:

```javascript
// Add custom filter logic
matchesCustomFilter(item, filterValue) {
    // Your custom filtering logic here
    return true;
}

// Register in the applyFilters method
if (this.filters.customFilter) {
    if (!this.matchesCustomFilter(item, this.filters.customFilter)) return false;
}
```

### Data Processing

Customize data processing in `scripts/update-data.js`:

```javascript
processData(rawData) {
    // Add custom data transformations
    return rawData.map(item => ({
        ...item,
        customField: this.calculateCustomValue(item)
    }));
}
```

## 📊 API Integration

The dashboard integrates with Microsoft's official roadmap API:

### Endpoint
```
https://www.microsoft.com/releasecommunications/api/v1/m365
```

### Data Structure
```javascript
{
  "id": 557348,
  "title": "Feature Title",
  "description": "Detailed description...",
  "publicDisclosureAvailabilityDate": "March CY2026",
  "status": "In development",
  "tagsContainer": {
    "products": [{"tagName": "Microsoft Teams"}],
    "platforms": [{"tagName": "Web"}],
    "cloudInstances": [{"tagName": "Worldwide"}],
    "releasePhase": [{"tagName": "General Availability"}]
  }
}
```

### Rate Limiting
- The API has no documented rate limits
- Dashboard implements 4-hour caching to minimize requests
- Update scripts include retry logic and error handling

## 🔍 Troubleshooting

### Common Issues

1. **CORS Errors**
   ```
   Solution: Serve via HTTP server, not file:// protocol
   Command: python -m http.server 8000
   ```

2. **No Data Loading**
   ```
   Check: Browser console for API errors
   Solution: Verify internet connection and API availability
   Fallback: Sample data available in data/sample-data.json
   ```

3. **GitHub Pages Not Updating**
   ```
   Check: Repository Settings → Pages configuration
   Verify: GitHub Actions are enabled (if using automation)
   Debug: Check Actions tab for deployment logs
   ```

### Debug Mode

Enable debug logging:

```javascript
// In browser console
localStorage.setItem('debug', 'true');
location.reload();
```

## 🚀 Deployment Options

### GitHub Pages (Static)
- ✅ Free hosting
- ✅ Automatic HTTPS
- ✅ CDN distribution
- ✅ Custom domains
- ❌ No server-side processing

### Netlify
```bash
# Deploy to Netlify
npm install -g netlify-cli
netlify deploy --prod --dir .
```

### Vercel
```bash
# Deploy to Vercel
npm install -g vercel
vercel --prod
```

### AWS S3 + CloudFront
```bash
# Deploy to S3
aws s3 sync . s3://your-bucket-name --delete
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

## 🤝 Contributing

We welcome contributions! Here's how to help:

### Development Setup

1. **Fork and clone**
   ```bash
   git clone https://github.com/your-username/m365-roadmap-dashboard.git
   cd m365-roadmap-dashboard
   ```

2. **Create feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Make changes**
   - Follow existing code style
   - Add comments for complex logic
   - Test on multiple devices/browsers

4. **Test thoroughly**
   ```bash
   # Test data updates
   cd scripts && node update-data.js
   
   # Test different screen sizes
   # Verify all filters work
   # Check mobile responsiveness
   ```

5. **Submit pull request**
   - Describe your changes
   - Include screenshots if UI changes
   - Link to any related issues

### Reporting Issues

Please include:
- Browser and version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙋 Support

- **Issues**: [GitHub Issues](https://github.com/your-username/m365-roadmap-dashboard/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/m365-roadmap-dashboard/discussions)
- **Documentation**: This README and inline code comments

## 🌟 Acknowledgments

- **Microsoft**: For providing the public roadmap API
- **Fluent UI**: For design inspiration
- **GitHub Pages**: For free hosting
- **Contributors**: Everyone who helps improve this project

---

**Made with ❤️ for the Microsoft 365 community**

*This is an independent project and is not affiliated with Microsoft Corporation.*