#!/usr/bin/env node

/**
 * Microsoft 365 Roadmap Data Update Script
 * 
 * This script fetches the latest roadmap data from Microsoft's API
 * and saves it to a local JSON file for the dashboard to use.
 * 
 * Usage:
 *   node update-data.js
 *   
 * Environment Variables:
 *   - OUTPUT_DIR: Directory to save the data file (default: ../data)
 *   - LOG_LEVEL: Logging level (debug, info, warn, error) (default: info)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class RoadmapDataUpdater {
    constructor() {
        this.apiUrl = 'https://www.microsoft.com/releasecommunications/api/v1/m365';
        this.outputDir = process.env.OUTPUT_DIR || path.join(__dirname, '../data');
        this.logLevel = process.env.LOG_LEVEL || 'info';
        
        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }
    
    log(level, message, ...args) {
        const levels = { error: 0, warn: 1, info: 2, debug: 3 };
        if (levels[level] <= levels[this.logLevel]) {
            console[level === 'error' ? 'error' : 'log'](`[${new Date().toISOString()}] ${level.toUpperCase()}: ${message}`, ...args);
        }
    }
    
    async fetchData() {
        return new Promise((resolve, reject) => {
            this.log('info', `Fetching data from ${this.apiUrl}`);
            
            const request = https.get(this.apiUrl, (response) => {
                let data = '';
                
                response.on('data', (chunk) => {
                    data += chunk;
                });
                
                response.on('end', () => {
                    if (response.statusCode === 200) {
                        try {
                            const jsonData = JSON.parse(data);
                            this.log('info', `Successfully fetched ${jsonData.length} roadmap items`);
                            resolve(jsonData);
                        } catch (error) {
                            this.log('error', 'Failed to parse JSON response:', error.message);
                            reject(error);
                        }
                    } else {
                        this.log('error', `HTTP error: ${response.statusCode} ${response.statusMessage}`);
                        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                    }
                });
            });
            
            request.on('error', (error) => {
                this.log('error', 'Network error:', error.message);
                reject(error);
            });
            
            request.setTimeout(30000, () => {
                request.abort();
                reject(new Error('Request timeout'));
            });
        });
    }
    
    processData(rawData) {
        this.log('info', 'Processing roadmap data...');
        
        // Add processing metadata
        const processedData = {
            metadata: {
                lastUpdated: new Date().toISOString(),
                totalItems: rawData.length,
                apiSource: this.apiUrl,
                version: '1.0.0'
            },
            items: rawData,
            statistics: this.calculateStatistics(rawData)
        };
        
        this.log('info', 'Data processing complete');
        this.log('debug', 'Statistics:', processedData.statistics);
        
        return processedData;
    }
    
    calculateStatistics(data) {
        const stats = {
            byStatus: {},
            byProduct: {},
            byPlatform: {},
            byQuarter: {},
            totalItems: data.length
        };
        
        data.forEach(item => {
            // Status statistics
            const status = item.status || 'Unknown';
            stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
            
            // Product statistics
            if (item.tagsContainer?.products) {
                item.tagsContainer.products.forEach(product => {
                    stats.byProduct[product.tagName] = (stats.byProduct[product.tagName] || 0) + 1;
                });
            }
            
            // Platform statistics
            if (item.tagsContainer?.platforms) {
                item.tagsContainer.platforms.forEach(platform => {
                    stats.byPlatform[platform.tagName] = (stats.byPlatform[platform.tagName] || 0) + 1;
                });
            }
            
            // Quarter statistics
            if (item.publicDisclosureAvailabilityDate) {
                const date = new Date(item.publicDisclosureAvailabilityDate);
                const year = date.getFullYear();
                const quarter = Math.ceil((date.getMonth() + 1) / 3);
                const quarterKey = `${year} Q${quarter}`;
                stats.byQuarter[quarterKey] = (stats.byQuarter[quarterKey] || 0) + 1;
            }
        });
        
        return stats;
    }
    
    async saveData(data, filename = 'roadmap-data.json') {
        const filePath = path.join(this.outputDir, filename);
        
        try {
            // Save main data file
            await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
            this.log('info', `Data saved to ${filePath}`);
            
            // Save backup with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.outputDir, `roadmap-data-${timestamp}.json`);
            await fs.promises.writeFile(backupPath, JSON.stringify(data, null, 2));
            this.log('info', `Backup saved to ${backupPath}`);
            
            // Save compact version for web use
            const compactPath = path.join(this.outputDir, 'roadmap-data-compact.json');
            await fs.promises.writeFile(compactPath, JSON.stringify(data));
            this.log('info', `Compact version saved to ${compactPath}`);
            
            // Clean up old backups (keep last 10)
            await this.cleanupBackups();
            
        } catch (error) {
            this.log('error', 'Failed to save data:', error.message);
            throw error;
        }
    }
    
    async cleanupBackups() {
        try {
            const files = await fs.promises.readdir(this.outputDir);
            const backupFiles = files
                .filter(file => file.startsWith('roadmap-data-') && file.endsWith('.json') && file !== 'roadmap-data-compact.json')
                .map(file => ({
                    name: file,
                    path: path.join(this.outputDir, file),
                    time: fs.statSync(path.join(this.outputDir, file)).mtime
                }))
                .sort((a, b) => b.time - a.time);
            
            // Keep only the 10 most recent backups
            if (backupFiles.length > 10) {
                const filesToDelete = backupFiles.slice(10);
                for (const file of filesToDelete) {
                    await fs.promises.unlink(file.path);
                    this.log('debug', `Deleted old backup: ${file.name}`);
                }
                this.log('info', `Cleaned up ${filesToDelete.length} old backup files`);
            }
        } catch (error) {
            this.log('warn', 'Failed to cleanup backups:', error.message);
        }
    }
    
    async generateReport() {
        const reportPath = path.join(this.outputDir, 'update-report.json');
        const report = {
            timestamp: new Date().toISOString(),
            success: true,
            apiUrl: this.apiUrl,
            dataPath: path.join(this.outputDir, 'roadmap-data.json'),
            nextUpdate: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
            version: '1.0.0'
        };
        
        try {
            await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2));
            this.log('info', `Update report saved to ${reportPath}`);
        } catch (error) {
            this.log('warn', 'Failed to save update report:', error.message);
        }
    }
    
    async run() {
        const startTime = Date.now();
        
        try {
            this.log('info', 'Starting Microsoft 365 Roadmap data update...');
            
            // Fetch data from API
            const rawData = await this.fetchData();
            
            // Process the data
            const processedData = this.processData(rawData);
            
            // Save to files
            await this.saveData(processedData);
            
            // Generate update report
            await this.generateReport();
            
            const duration = Date.now() - startTime;
            this.log('info', `Update completed successfully in ${duration}ms`);
            
            // Output summary for scripts
            if (process.env.JSON_OUTPUT === 'true') {
                console.log(JSON.stringify({
                    success: true,
                    itemCount: processedData.totalItems,
                    duration: duration,
                    timestamp: new Date().toISOString()
                }));
            }
            
            process.exit(0);
            
        } catch (error) {
            this.log('error', 'Update failed:', error.message);
            
            if (process.env.JSON_OUTPUT === 'true') {
                console.log(JSON.stringify({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }));
            }
            
            process.exit(1);
        }
    }
}

// Run the updater if this script is executed directly
if (require.main === module) {
    const updater = new RoadmapDataUpdater();
    updater.run();
}

module.exports = RoadmapDataUpdater;