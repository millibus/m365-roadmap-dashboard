#!/usr/bin/env node

/**
 * Microsoft 365 Roadmap Data Update Script
 *
 * Fetches roadmap data from Microsoft's API with retry/backoff, validates
 * response shape, and writes JSON outputs atomically. Configurable via env.
 *
 * Usage:
 *   node update-data.js
 *
 * Environment Variables:
 *   - OUTPUT_DIR: Directory to save the data file (default: ../data)
 *   - LOG_LEVEL: Logging level (debug, info, warn, error) (default: info)
 *   - FETCH_TIMEOUT_MS: Request timeout in milliseconds (default: 30000)
 *   - FETCH_RETRY_COUNT: Number of retries after initial failure (default: 3)
 *   - BACKUP_RETENTION_COUNT: Number of timestamped backups to keep (default: 10)
 *   - JSON_OUTPUT: If "true", emit JSON summary to stdout for scripting
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

/** Minimum schema for a single roadmap item from the API */
const REQUIRED_ITEM_KEYS = ['id', 'title', 'description', 'status'];

function isRoadmapItem(item) {
    if (!item || typeof item !== 'object') return false;
    return REQUIRED_ITEM_KEYS.every(key => key in item);
}

function validateApiResponse(data) {
    if (!Array.isArray(data)) {
        throw new Error(`API response must be an array, got ${typeof data}`);
    }
    const bad = data.findIndex((item, i) => !isRoadmapItem(item));
    if (bad !== -1) {
        throw new Error(
            `API item at index ${bad} missing required fields (id, title, description, status)`
        );
    }
    return true;
}

/** Exponential backoff with jitter: delay = base * 2^attempt + jitter */
function delayMs(attempt, baseMs = 1000, maxMs = 30000) {
    const exp = Math.min(baseMs * Math.pow(2, attempt), maxMs);
    const jitter = Math.floor(Math.random() * 0.3 * exp);
    return exp + jitter;
}

class RoadmapDataUpdater {
    constructor() {
        this.apiUrl = 'https://www.microsoft.com/releasecommunications/api/v1/m365';
        this.outputDir = process.env.OUTPUT_DIR || path.join(__dirname, '../data');
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.fetchTimeoutMs = Math.max(1000, parseInt(process.env.FETCH_TIMEOUT_MS || '30000', 10) || 30000);
        this.retryCount = Math.max(0, Math.min(10, parseInt(process.env.FETCH_RETRY_COUNT || '3', 10) || 3));
        this.backupRetention = Math.max(1, Math.min(100, parseInt(process.env.BACKUP_RETENTION_COUNT || '10', 10) || 10));

        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    log(level, message, ...args) {
        const levels = { error: 0, warn: 1, info: 2, debug: 3 };
        if (levels[level] <= levels[this.logLevel]) {
            console[level === 'error' ? 'error' : 'log'](
                `[${new Date().toISOString()}] ${level.toUpperCase()}: ${message}`,
                ...args
            );
        }
    }

    async fetchOne() {
        return new Promise((resolve, reject) => {
            const request = https.get(this.apiUrl, (response) => {
                let data = '';
                response.on('data', (chunk) => { data += chunk; });
                response.on('end', () => {
                    if (response.statusCode !== 200) {
                        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                        return;
                    }
                    try {
                        const jsonData = JSON.parse(data);
                        validateApiResponse(jsonData);
                        resolve(jsonData);
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            request.on('error', reject);
            request.setTimeout(this.fetchTimeoutMs, () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    async fetchData() {
        this.log('info', `Fetching data from ${this.apiUrl} (timeout=${this.fetchTimeoutMs}ms, retries=${this.retryCount})`);
        let lastError;
        for (let attempt = 0; attempt <= this.retryCount; attempt++) {
            try {
                const jsonData = await this.fetchOne();
                this.log('info', `Successfully fetched ${jsonData.length} roadmap items`);
                return jsonData;
            } catch (error) {
                lastError = error;
                this.log('warn', `Attempt ${attempt + 1}/${this.retryCount + 1} failed: ${error.message}`);
                if (attempt < this.retryCount) {
                    const wait = delayMs(attempt);
                    this.log('info', `Retrying in ${wait}ms...`);
                    await new Promise(r => setTimeout(r, wait));
                }
            }
        }
        this.log('error', 'All fetch attempts failed:', lastError.message);
        throw lastError;
    }

    /**
     * Compare new items against the previous snapshot to detect NEW and UPDATED items.
     * Mutates items in-place by adding _changeType and _changedFields properties.
     */
    detectChanges(newItems) {
        const dataPath = path.join(this.outputDir, 'roadmap-data.json');
        let prevItems = [];
        try {
            if (fs.existsSync(dataPath)) {
                const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
                prevItems = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : []);
            }
        } catch (err) {
            this.log('warn', 'Could not read previous data for change detection:', err.message);
        }

        // If no previous data, mark everything unchanged (avoid false positives on first run)
        if (prevItems.length === 0) {
            for (const item of newItems) {
                item._changeType = 'unchanged';
                item._changedFields = [];
            }
            return;
        }

        const prevMap = new Map(prevItems.map(i => [i.id, i]));
        const comparedFields = ['title', 'description', 'status', 'publicDisclosureAvailabilityDate'];

        for (const item of newItems) {
            const prev = prevMap.get(item.id);
            if (!prev) {
                item._changeType = 'new';
                item._changedFields = [];
                continue;
            }

            const changedFields = [];
            for (const field of comparedFields) {
                const newVal = item[field] != null ? String(item[field]) : '';
                const oldVal = prev[field] != null ? String(prev[field]) : '';
                if (newVal !== oldVal) {
                    changedFields.push(field);
                }
            }

            // Compare tagsContainer via JSON.stringify
            const newTags = JSON.stringify(item.tagsContainer || {});
            const oldTags = JSON.stringify(prev.tagsContainer || {});
            if (newTags !== oldTags) {
                changedFields.push('tagsContainer');
            }

            if (changedFields.length > 0) {
                item._changeType = 'changed';
                item._changedFields = changedFields;
            } else {
                item._changeType = 'unchanged';
                item._changedFields = [];
            }
        }

        const newCount = newItems.filter(i => i._changeType === 'new').length;
        const changedCount = newItems.filter(i => i._changeType === 'changed').length;
        this.log('info', `Change detection: ${newCount} new, ${changedCount} changed, ${newItems.length - newCount - changedCount} unchanged`);
    }

    processData(rawData) {
        this.log('info', 'Processing roadmap data...');
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
            const status = item.status || 'Unknown';
            stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
            if (item.tagsContainer?.products) {
                item.tagsContainer.products.forEach(product => {
                    stats.byProduct[product.tagName] = (stats.byProduct[product.tagName] || 0) + 1;
                });
            }
            if (item.tagsContainer?.platforms) {
                item.tagsContainer.platforms.forEach(platform => {
                    stats.byPlatform[platform.tagName] = (stats.byPlatform[platform.tagName] || 0) + 1;
                });
            }
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

    /** Write content to filePath atomically (temp file + rename). */
    async writeFileAtomic(filePath, content) {
        const dir = path.dirname(filePath);
        const name = path.basename(filePath);
        const tmpPath = path.join(dir, `.${name}.tmp`);
        await fs.promises.writeFile(tmpPath, content, 'utf8');
        await fs.promises.rename(tmpPath, filePath);
    }

    async saveData(data, filename = 'roadmap-data.json') {
        const filePath = path.join(this.outputDir, filename);
        const payload = JSON.stringify(data, null, 2);

        try {
            await this.writeFileAtomic(filePath, payload);
            this.log('info', `Data saved to ${filePath}`);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.outputDir, `roadmap-data-${timestamp}.json`);
            await this.writeFileAtomic(backupPath, payload);
            this.log('info', `Backup saved to ${backupPath}`);

            const compactPath = path.join(this.outputDir, 'roadmap-data-compact.json');
            await this.writeFileAtomic(compactPath, JSON.stringify(data));
            this.log('info', `Compact version saved to ${compactPath}`);

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
                .filter(
                    (file) =>
                        file.startsWith('roadmap-data-') &&
                        file.endsWith('.json') &&
                        file !== 'roadmap-data-compact.json'
                )
                .map((file) => ({
                    name: file,
                    path: path.join(this.outputDir, file),
                    time: fs.statSync(path.join(this.outputDir, file)).mtime
                }))
                .sort((a, b) => b.time - a.time);

            const toKeep = this.backupRetention;
            if (backupFiles.length > toKeep) {
                const filesToDelete = backupFiles.slice(toKeep);
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
            nextUpdate: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
            version: '1.0.0'
        };
        try {
            await this.writeFileAtomic(reportPath, JSON.stringify(report, null, 2));
            this.log('info', `Update report saved to ${reportPath}`);
        } catch (error) {
            this.log('warn', 'Failed to save update report:', error.message);
        }
    }

    /**
     * Emit a compact health/status artifact for operational diagnostics.
     * The file persists lastSuccessfulUpdate across failed runs.
     */
    async generateHealthStatus({ status, sourceStatus, itemCount, durationMs, errorMessage, timestamp }) {
        const healthPath = path.join(this.outputDir, 'health-status.json');
        let previous = {};
        try {
            const existing = await fs.promises.readFile(healthPath, 'utf8');
            previous = JSON.parse(existing);
        } catch (error) {
            // Missing/invalid prior health file is non-fatal; continue with fresh state.
            previous = {};
        }

        const currentTimestamp = timestamp || new Date().toISOString();
        const lastSuccessfulUpdate = status === 'ok'
            ? currentTimestamp
            : (previous.lastSuccessfulUpdate || null);

        const health = {
            timestamp: currentTimestamp,
            status,
            lastSuccessfulUpdate,
            source: {
                apiUrl: this.apiUrl,
                status: sourceStatus
            },
            metrics: {
                backupRetention: this.backupRetention
            }
        };

        if (typeof itemCount === 'number') {
            health.metrics.itemCount = itemCount;
        }
        if (typeof durationMs === 'number') {
            health.metrics.durationMs = durationMs;
        }
        if (errorMessage) {
            health.error = { message: errorMessage };
        }

        await this.writeFileAtomic(healthPath, JSON.stringify(health, null, 2));
        this.log('info', `Health status saved to ${healthPath}`);
    }

    async run() {
        const startTime = Date.now();

        try {
            this.log('info', 'Starting Microsoft 365 Roadmap data update...');

            const rawData = await this.fetchData();
            this.detectChanges(rawData);
            const processedData = this.processData(rawData);
            await this.saveData(processedData);
            await this.generateReport();

            const duration = Date.now() - startTime;
            const timestamp = new Date().toISOString();
            await this.generateHealthStatus({
                status: 'ok',
                sourceStatus: 'success',
                itemCount: processedData.metadata.totalItems,
                durationMs: duration,
                timestamp
            });
            this.log('info', `Update completed successfully in ${duration}ms`);

            if (process.env.JSON_OUTPUT === 'true') {
                console.log(
                    JSON.stringify({
                        success: true,
                        itemCount: processedData.metadata.totalItems,
                        duration,
                        timestamp: new Date().toISOString()
                    })
                );
            }
            process.exit(0);
        } catch (error) {
            this.log('error', 'Update failed:', error.message);
            const duration = Date.now() - startTime;
            try {
                await this.generateHealthStatus({
                    status: 'degraded',
                    sourceStatus: 'failed',
                    durationMs: duration,
                    errorMessage: error.message,
                    timestamp: new Date().toISOString()
                });
            } catch (healthError) {
                this.log('warn', 'Failed to write health status:', healthError.message);
            }

            if (process.env.JSON_OUTPUT === 'true') {
                console.log(
                    JSON.stringify({
                        success: false,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    })
                );
            }
            process.exit(1);
        }
    }
}

if (require.main === module) {
    const updater = new RoadmapDataUpdater();
    updater.run();
}

module.exports = { RoadmapDataUpdater, validateApiResponse, isRoadmapItem };
