#!/usr/bin/env node

/**
 * Test Setup Script for M365 Roadmap Dashboard
 * 
 * This script validates the dashboard setup and tests core functionality
 * without making external API calls.
 */

const fs = require('fs');
const path = require('path');

class SetupTester {
    constructor() {
        this.projectRoot = path.dirname(__dirname);
        this.errors = [];
        this.warnings = [];
        this.success = [];
    }
    
    log(level, message) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] ${level.toUpperCase()}:`;
        
        switch (level) {
            case 'error':
                console.error('\x1b[31m%s\x1b[0m', `${prefix} ${message}`);
                this.errors.push(message);
                break;
            case 'warn':
                console.warn('\x1b[33m%s\x1b[0m', `${prefix} ${message}`);
                this.warnings.push(message);
                break;
            case 'success':
                console.log('\x1b[32m%s\x1b[0m', `${prefix} ${message}`);
                this.success.push(message);
                break;
            default:
                console.log(`${prefix} ${message}`);
        }
    }
    
    checkFileExists(filePath, required = true) {
        const fullPath = path.join(this.projectRoot, filePath);
        if (fs.existsSync(fullPath)) {
            this.log('success', `Found ${filePath}`);
            return true;
        } else {
            if (required) {
                this.log('error', `Missing required file: ${filePath}`);
            } else {
                this.log('warn', `Optional file not found: ${filePath}`);
            }
            return false;
        }
    }
    
    checkDirectoryExists(dirPath, required = true) {
        const fullPath = path.join(this.projectRoot, dirPath);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
            this.log('success', `Found directory ${dirPath}`);
            return true;
        } else {
            if (required) {
                this.log('error', `Missing required directory: ${dirPath}`);
            } else {
                this.log('warn', `Optional directory not found: ${dirPath}`);
            }
            return false;
        }
    }
    
    validateHtmlStructure() {
        const indexPath = path.join(this.projectRoot, 'index.html');
        try {
            const content = fs.readFileSync(indexPath, 'utf8');
            
            // Check for essential elements
            const checks = [
                { test: /<meta name="viewport"/, name: 'Responsive viewport meta tag' },
                { test: /<title>.*Copilot Roadmap/, name: 'Appropriate page title' },
                { test: /id="search-input"/, name: 'Search input element' },
                { test: /id="cards-view"/, name: 'Cards view container' },
                { test: /id="timeline-view"/, name: 'Timeline view container' },
                { test: /id="table-view"/, name: 'Table view container' },
                { test: /<script src="js\/app\.js"/, name: 'Main JavaScript file reference' },
                { test: /<link rel="stylesheet" href="css\/styles\.css"/, name: 'Main CSS file reference' }
            ];
            
            checks.forEach(check => {
                if (check.test.test(content)) {
                    this.log('success', `HTML contains ${check.name}`);
                } else {
                    this.log('error', `HTML missing ${check.name}`);
                }
            });
            
        } catch (error) {
            this.log('error', `Failed to validate HTML structure: ${error.message}`);
        }
    }
    
    validateCssStructure() {
        const cssPath = path.join(this.projectRoot, 'css/styles.css');
        try {
            const content = fs.readFileSync(cssPath, 'utf8');
            
            // Check for essential CSS classes
            const checks = [
                { test: /\.roadmap-card/, name: 'Card component styles' },
                { test: /\.timeline-container/, name: 'Timeline component styles' },
                { test: /\.roadmap-table/, name: 'Table component styles' },
                { test: /@media.*768px/, name: 'Mobile responsive breakpoints' },
                { test: /\.loading/, name: 'Loading state styles' },
                { test: /\.error-state/, name: 'Error state styles' }
            ];
            
            checks.forEach(check => {
                if (check.test.test(content)) {
                    this.log('success', `CSS contains ${check.name}`);
                } else {
                    this.log('error', `CSS missing ${check.name}`);
                }
            });
            
        } catch (error) {
            this.log('error', `Failed to validate CSS structure: ${error.message}`);
        }
    }
    
    validateJavaScriptStructure() {
        const jsPath = path.join(this.projectRoot, 'js/app.js');
        try {
            const content = fs.readFileSync(jsPath, 'utf8');
            
            // Check for essential JavaScript features
            const checks = [
                { test: /class M365RoadmapDashboard/, name: 'Main dashboard class' },
                { test: /async loadData/, name: 'Data loading function' },
                { test: /applyFilters/, name: 'Filtering functionality' },
                { test: /switchView/, name: 'View switching functionality' },
                { test: /renderCardsView/, name: 'Cards rendering' },
                { test: /renderTimelineView/, name: 'Timeline rendering' },
                { test: /renderTableView/, name: 'Table rendering' }
            ];
            
            checks.forEach(check => {
                if (check.test.test(content)) {
                    this.log('success', `JavaScript contains ${check.name}`);
                } else {
                    this.log('error', `JavaScript missing ${check.name}`);
                }
            });
            
        } catch (error) {
            this.log('error', `Failed to validate JavaScript structure: ${error.message}`);
        }
    }
    
    /** Shared data-shape check: { metadata, items } with each item having id, title, description, status */
    validateRoadmapDataShape(data, sourceLabel) {
        const requiredItemKeys = ['id', 'title', 'description', 'status'];
        const requiredMetaKeys = ['lastUpdated', 'totalItems', 'apiSource', 'version'];
        if (!data || typeof data !== 'object') {
            this.log('error', `${sourceLabel}: root must be an object`);
            return false;
        }
        if (!data.metadata || typeof data.metadata !== 'object') {
            this.log('error', `${sourceLabel}: missing or invalid metadata`);
            return false;
        }
        for (const k of requiredMetaKeys) {
            if (!(k in data.metadata)) {
                this.log('error', `${sourceLabel}: metadata missing "${k}"`);
                return false;
            }
        }
        if (!Array.isArray(data.items)) {
            this.log('error', `${sourceLabel}: items must be an array`);
            return false;
        }
        if (data.metadata.totalItems !== data.items.length) {
            this.log('error', `${sourceLabel}: metadata.totalItems (${data.metadata.totalItems}) != items.length (${data.items.length})`);
            return false;
        }
        for (let i = 0; i < data.items.length; i++) {
            const item = data.items[i];
            if (!item || typeof item !== 'object') {
                this.log('error', `${sourceLabel}: items[${i}] must be an object`);
                return false;
            }
            const missing = requiredItemKeys.filter(field => !(field in item));
            if (missing.length > 0) {
                this.log('error', `${sourceLabel}: items[${i}] missing: ${missing.join(', ')}`);
                return false;
            }
        }
        return true;
    }

    validateSampleData() {
        const sampleDataPath = path.join(this.projectRoot, 'data/sample-data.json');
        if (!fs.existsSync(sampleDataPath)) return;
        try {
            const content = fs.readFileSync(sampleDataPath, 'utf8');
            const data = JSON.parse(content);
            if (this.validateRoadmapDataShape(data, 'sample-data.json')) {
                this.log('success', `Sample data is valid with ${data.items.length} items`);
            }
        } catch (error) {
            this.log('error', `Failed to validate sample data: ${error.message}`);
        }
    }

    /** Data-shape checks for current dataset (roadmap-data.json, roadmap-data-compact.json) */
    validateCurrentDataShape() {
        const dataDir = path.join(this.projectRoot, 'data');
        const files = [
            { file: 'roadmap-data.json', label: 'roadmap-data.json' },
            { file: 'roadmap-data-compact.json', label: 'roadmap-data-compact.json' }
        ];
        let anyFound = false;
        for (const { file, label } of files) {
            const fullPath = path.join(dataDir, file);
            if (!fs.existsSync(fullPath)) continue;
            anyFound = true;
            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                const data = JSON.parse(content);
                if (this.validateRoadmapDataShape(data, label)) {
                    this.log('success', `${label} shape valid (${data.items.length} items)`);
                }
            } catch (error) {
                this.log('error', `${label}: ${error.message}`);
            }
        }
        if (!anyFound) {
            this.log('warn', 'No current roadmap data files found; run npm run update-data to generate');
        }
    }
    
    checkScriptPermissions() {
        const updateScriptPath = path.join(this.projectRoot, 'scripts/update.sh');
        try {
            const stats = fs.statSync(updateScriptPath);
            const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;
            
            if (isExecutable) {
                this.log('success', 'Update script has execute permissions');
            } else {
                this.log('warn', 'Update script may need execute permissions (run: chmod +x scripts/update.sh)');
            }
        } catch (error) {
            this.log('error', `Failed to check script permissions: ${error.message}`);
        }
    }
    
    validateNodeEnvironment() {
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
        
        if (majorVersion >= 14) {
            this.log('success', `Node.js version ${nodeVersion} is supported`);
        } else {
            this.log('error', `Node.js version ${nodeVersion} is too old. Requires Node.js 14+`);
        }
    }
    
    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('                  SETUP TEST REPORT');
        console.log('='.repeat(60));
        
        console.log(`\n✅ Successes: ${this.success.length}`);
        console.log(`⚠️  Warnings:  ${this.warnings.length}`);
        console.log(`❌ Errors:    ${this.errors.length}`);
        
        if (this.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            this.warnings.forEach(warning => console.log(`   - ${warning}`));
        }
        
        if (this.errors.length > 0) {
            console.log('\n❌ Errors:');
            this.errors.forEach(error => console.log(`   - ${error}`));
        }
        
        console.log('\n' + '='.repeat(60));
        
        if (this.errors.length === 0) {
            console.log('🎉 Setup validation passed! The dashboard is ready to use.');
            console.log('\nNext steps:');
            console.log('  1. Run: npm start (or python -m http.server 8000)');
            console.log('  2. Open: http://localhost:8000');
            console.log('  3. Test: node scripts/update-data.js');
        } else {
            console.log('❌ Setup validation failed. Please fix the errors above.');
        }
        
        return this.errors.length === 0;
    }
    
    async run() {
        console.log('🧪 Running M365 Roadmap Dashboard setup tests...\n');
        
        // Check Node.js environment
        this.validateNodeEnvironment();
        
        // Check required files
        this.checkFileExists('index.html');
        this.checkFileExists('css/styles.css');
        this.checkFileExists('js/app.js');
        this.checkFileExists('scripts/update-data.js');
        this.checkFileExists('scripts/update.sh');
        this.checkFileExists('scripts/health-check.js');
        this.checkFileExists('README.md');
        this.checkFileExists('package.json');
        
        // Check required directories
        this.checkDirectoryExists('css');
        this.checkDirectoryExists('js');
        this.checkDirectoryExists('data');
        this.checkDirectoryExists('scripts');
        
        // Check optional files
        this.checkFileExists('data/sample-data.json', false);
        this.checkFileExists('.gitignore', false);
        
        // Validate file contents
        this.validateHtmlStructure();
        this.validateCssStructure();
        this.validateJavaScriptStructure();
        this.validateSampleData();
        this.validateCurrentDataShape();
        
        // Check permissions
        this.checkScriptPermissions();
        
        // Generate report
        return this.generateReport();
    }
}

// Run the tests if this script is executed directly
if (require.main === module) {
    const tester = new SetupTester();
    tester.run().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = SetupTester;