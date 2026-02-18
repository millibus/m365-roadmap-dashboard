/** Load state constants for deterministic UI (testable, never broken render). */
const LoadState = Object.freeze({
    IDLE: 'idle',
    LOADING: 'loading',
    SUCCESS: 'success',
    EMPTY: 'empty',
    ERROR_RECOVERABLE: 'error_recoverable',
    ERROR_FATAL: 'error_fatal'
});

/** Default cache max age: 4 hours. Override via M365_ROADMAP_CACHE_MAX_AGE_MS (env not available in browser; use window.__M365_ROADMAP_CACHE_MAX_AGE_MS for tests). */
function getCacheMaxAgeMs() {
    if (typeof window !== 'undefined' && window.__M365_ROADMAP_CACHE_MAX_AGE_MS != null) {
        return Math.max(0, Number(window.__M365_ROADMAP_CACHE_MAX_AGE_MS));
    }
    return 4 * 60 * 60 * 1000;
}

/** True if cache entry is past max age (stale). Testable via getCacheMaxAgeMs. */
function isCacheStale(timestamp) {
    if (timestamp == null || typeof timestamp !== 'number') return true;
    return (Date.now() - timestamp) >= getCacheMaxAgeMs();
}

/** True when diagnostics mode is on (URL ?diagnostics=1 or localStorage m365-roadmap-diagnostics). Non-visual: logs load/cache/render info to console. */
function isDiagnosticsMode() {
    if (typeof window === 'undefined') return false;
    try {
        if (typeof URLSearchParams !== 'undefined' && window.location.search) {
            const p = new URLSearchParams(window.location.search);
            if (p.get('diagnostics') === '1' || p.get('diagnostics') === 'true') return true;
        }
        return localStorage.getItem('m365-roadmap-diagnostics') === 'true';
    } catch (_) {
        return false;
    }
}

function logDiagnostics(...args) {
    if (isDiagnosticsMode()) {
        console.log('[M365 Roadmap]', ...args);
    }
}

function safeString(value) {
    return (value != null && typeof value === 'string') ? value : '';
}

function itemMatchesFilters(item, filters, timelineMatcher) {
    if (!item || typeof item !== 'object') return false;

    const title = safeString(item.title);

    if (filters.search) {
        const searchText = safeString(filters.search).toLowerCase();
        const desc = safeString(item.description);
        const titleMatch = title.toLowerCase().includes(searchText);
        const descMatch = desc.toLowerCase().includes(searchText);
        if (!titleMatch && !descMatch) return false;
    }

    if (filters.service) {
        const products = item.tagsContainer && Array.isArray(item.tagsContainer.products) ? item.tagsContainer.products : [];
        const hasService = products.some(p => p && p.tagName === filters.service);
        if (!hasService) return false;
    }

    if (filters.status) {
        if (safeString(item.status) !== filters.status) return false;
    }

    if (filters.platform) {
        const platforms = item.tagsContainer && Array.isArray(item.tagsContainer.platforms) ? item.tagsContainer.platforms : [];
        const hasPlatform = platforms.some(p => p && p.tagName === filters.platform);
        if (!hasPlatform) return false;
    }

    if (filters.timeline) {
        if (typeof timelineMatcher !== 'function') return false;
        if (!timelineMatcher(item, filters.timeline)) return false;
    }

    return true;
}

function filterCopilotItems(items) {
    if (!Array.isArray(items)) return [];
    return items.filter(item => {
        const products = item.tagsContainer && Array.isArray(item.tagsContainer.products)
            ? item.tagsContainer.products : [];
        return products.some(p => p && typeof p.tagName === 'string' && p.tagName.includes('Copilot'));
    });
}

function filterRoadmapItems(items, filters, timelineMatcher) {
    if (!Array.isArray(items)) return [];
    const safeFilters = (filters && typeof filters === 'object') ? filters : {};
    return items.filter((item) => itemMatchesFilters(item, safeFilters, timelineMatcher));
}

class M365RoadmapDashboard {
    constructor() {
        this.allData = [];
        this.filteredData = [];
        this.currentView = 'cards';
        this.loadState = LoadState.IDLE;
        this.filters = {
            search: '',
            service: '',
            status: '',
            platform: '',
            timeline: ''
        };
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadData();
    }
    
    bindEvents() {
        // Search functionality
        const searchInput = document.getElementById('search-input');
        const clearSearchBtn = document.getElementById('clear-search');
        
        searchInput.addEventListener('input', this.debounce((e) => {
            this.filters.search = e.target.value.toLowerCase();
            this.applyFilters();
            clearSearchBtn.style.display = e.target.value ? 'block' : 'none';
        }, 300));
        
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            this.filters.search = '';
            clearSearchBtn.style.display = 'none';
            this.applyFilters();
        });
        
        // Filter dropdowns
        document.getElementById('service-filter').addEventListener('change', (e) => {
            this.filters.service = e.target.value;
            this.applyFilters();
        });
        
        document.getElementById('status-filter').addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.applyFilters();
        });
        
        document.getElementById('platform-filter').addEventListener('change', (e) => {
            this.filters.platform = e.target.value;
            this.applyFilters();
        });
        
        document.getElementById('timeline-filter').addEventListener('change', (e) => {
            this.filters.timeline = e.target.value;
            this.applyFilters();
        });
        
        // View controls
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = btn.dataset.view;
                this.switchView(view);
            });
        });
        
        // Clear filters
        document.getElementById('clear-filters').addEventListener('click', () => {
            this.clearAllFilters();
        });
        
        // Refresh data
        document.getElementById('refresh-data').addEventListener('click', () => {
            this.refreshData();
        });
        
        // Retry button
        document.getElementById('retry-btn').addEventListener('click', () => {
            this.loadData();
        });
    }
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    /**
     * Normalizes API/file payload to an array of roadmap items.
     * Accepts: { items: [] } or raw array. Returns empty array if invalid.
     */
    normalizeLoadedData(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) return this.normalizeItemList(raw);
        if (raw && typeof raw === 'object' && Array.isArray(raw.items)) {
            return this.normalizeItemList(raw.items);
        }
        logDiagnostics('normalizeLoadedData: unexpected shape', typeof raw);
        return [];
    }

    /** Filters and returns only items that have required fields for rendering (guards against malformed data). */
    normalizeItemList(items) {
        if (!Array.isArray(items)) return [];
        const out = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item && typeof item === 'object' && item.id != null && typeof item.title === 'string') {
                out.push(item);
            } else if (isDiagnosticsMode() && items[i] != null) {
                logDiagnostics('normalizeItemList: skipping invalid item at index', i, items[i]);
            }
        }
        return out;
    }

    async loadData() {
        this.setLoadState(LoadState.LOADING);
        logDiagnostics('loadData: start');

        try {
            let response = await fetch('data/roadmap-data.json');
            if (!response.ok) {
                response = await fetch('data/roadmap-data-compact.json');
            }
            if (!response.ok) {
                response = await fetch('data/sample-data.json');
            }
            if (!response.ok) {
                throw new Error(`Failed to load data files: ${response.status}`);
            }

            const raw = await response.json();
            let data = this.normalizeLoadedData(raw);
            data = filterCopilotItems(data);
            logDiagnostics('loadData: fetched', data.length, 'Copilot items');

            this.allData = data;
            this.setCachedData({ items: data, raw });
            this.setLoadState(data.length === 0 ? LoadState.EMPTY : LoadState.SUCCESS);
            this.processData();
            this.applyStateToDOM();
            return;
        } catch (error) {
            console.error('Error loading data:', error);
            logDiagnostics('loadData: fetch failed', error.message);

            const cached = this.getCachedData();
            const cachedList = cached && Array.isArray(cached.data) ? cached.data : (cached && cached.data && Array.isArray(cached.data.items) ? cached.data.items : null);
            const cachedItems = cachedList ? this.normalizeItemList(cachedList) : [];

            const copilotCachedItems = filterCopilotItems(cachedItems);
            if (copilotCachedItems.length > 0) {
                this.allData = copilotCachedItems;
                this.setCachedData({ items: copilotCachedItems, raw: { items: copilotCachedItems } });
                this.setLoadState(LoadState.ERROR_RECOVERABLE);
                this.processData();
                this.applyStateToDOM();
                this.showNotification('Using cached data - unable to fetch latest updates', 'warning');
                logDiagnostics('loadData: recovered from cache', copilotCachedItems.length);
            } else {
                this.setLoadState(LoadState.ERROR_FATAL);
                this.applyStateToDOM();
                logDiagnostics('loadData: fatal, no cache');
            }
        }
    }

    setLoadState(state) {
        this.loadState = state;
        logDiagnostics('setLoadState', state);
    }

    /** Single place that applies current load state to DOM (deterministic: never broken render). */
    applyStateToDOM() {
        const loadingEl = document.getElementById('loading');
        const errorEl = document.getElementById('error');
        const resultsInfo = document.getElementById('results-info');
        const viewIds = ['cards-view', 'timeline-view', 'table-view'];
        const noResultsEl = document.getElementById('no-results');

        if (!loadingEl || !errorEl) return;

        loadingEl.style.display = 'none';
        errorEl.style.display = 'none';
        resultsInfo.style.display = 'none';
        viewIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        if (noResultsEl) noResultsEl.style.display = 'none';

        switch (this.loadState) {
            case LoadState.LOADING:
                loadingEl.style.display = 'block';
                break;
            case LoadState.ERROR_FATAL:
                errorEl.style.display = 'block';
                break;
            case LoadState.ERROR_RECOVERABLE:
            case LoadState.SUCCESS:
            case LoadState.EMPTY:
                resultsInfo.style.display = 'flex';
                const viewEl = document.getElementById(`${this.currentView}-view`);
                if (viewEl) viewEl.style.display = 'block';
                if (noResultsEl) {
                    noResultsEl.style.display = this.filteredData.length === 0 ? 'block' : 'none';
                }
                break;
            default:
                break;
        }
    }

    getCachedData() {
        try {
            const cached = localStorage.getItem('m365-roadmap-data');
            if (!cached) return null;
            const parsed = JSON.parse(cached);
            return parsed && (parsed.data || parsed.items) ? parsed : null;
        } catch (error) {
            console.error('Error reading cache:', error);
            return null;
        }
    }

    setCachedData(payload) {
        try {
            const data = Array.isArray(payload)
                ? payload
                : (payload && Array.isArray(payload.items))
                    ? payload.items
                    : (payload && Array.isArray(payload.data))
                        ? payload.data
                        : null;
            const cacheData = { data: data || [], timestamp: Date.now() };
            localStorage.setItem('m365-roadmap-data', JSON.stringify(cacheData));
        } catch (error) {
            console.error('Error setting cache:', error);
        }
    }

    /** True if cache entry is still within max age (fresh). Testable via getCacheMaxAgeMs. */
    isCacheValid(timestamp) {
        if (timestamp == null || typeof timestamp !== 'number') return false;
        return !isCacheStale(timestamp);
    }
    
    processData() {
        this.populateFilterOptions();
        this.filteredData = [...this.allData];
        this.updateStatistics();
        this.renderCurrentView();
        this.updateResultsInfo();
    }
    
    populateFilterOptions() {
        const services = new Set();
        const platforms = new Set();

        this.allData.forEach(item => {
            if (!item || typeof item !== 'object') return;
            const products = item.tagsContainer && Array.isArray(item.tagsContainer.products) ? item.tagsContainer.products : [];
            products.forEach(p => {
                if (p && p.tagName != null) services.add(String(p.tagName));
            });
            const plats = item.tagsContainer && Array.isArray(item.tagsContainer.platforms) ? item.tagsContainer.platforms : [];
            plats.forEach(p => {
                if (p && p.tagName != null) platforms.add(String(p.tagName));
            });
        });

        const serviceFilter = document.getElementById('service-filter');
        const platformFilter = document.getElementById('platform-filter');
        if (serviceFilter) {
            serviceFilter.innerHTML = '<option value="">All Services</option>';
            Array.from(services).sort().forEach(service => {
                const option = document.createElement('option');
                option.value = service;
                option.textContent = service;
                serviceFilter.appendChild(option);
            });
        }
        if (platformFilter) {
            platformFilter.innerHTML = '<option value="">All Platforms</option>';
            Array.from(platforms).sort().forEach(platform => {
                const option = document.createElement('option');
                option.value = platform;
                option.textContent = platform;
                platformFilter.appendChild(option);
            });
        }
    }
    
    applyFilters() {
        this.filteredData = filterRoadmapItems(
            this.allData,
            this.filters,
            (item, timeline) => this.matchesTimeline(item, timeline)
        );

        this.renderCurrentView();
        this.updateResultsInfo();
    }

    matchesTimeline(item, timeline) {
        if (!item || !item.publicDisclosureAvailabilityDate) return false;
        const raw = item.publicDisclosureAvailabilityDate;
        const itemDate = new Date(raw);
        if (Number.isNaN(itemDate.getTime())) return false;
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        switch (timeline) {
            case 'current-month':
                return itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
            case 'next-month': {
                const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1);
                return itemDate.getMonth() === nextMonth.getMonth() && itemDate.getFullYear() === nextMonth.getFullYear();
            }
            case 'this-quarter': {
                const currentQuarter = Math.floor(currentMonth / 3);
                const itemQuarter = Math.floor(itemDate.getMonth() / 3);
                return itemQuarter === currentQuarter && itemDate.getFullYear() === currentYear;
            }
            case 'next-quarter': {
                const nextQuarter = (Math.floor(currentMonth / 3) + 1) % 4;
                const nextQuarterYear = nextQuarter === 0 ? currentYear + 1 : currentYear;
                const itemQ = Math.floor(itemDate.getMonth() / 3);
                return itemQ === nextQuarter && itemDate.getFullYear() === nextQuarterYear;
            }
            case 'this-year':
                return itemDate.getFullYear() === currentYear;
            case 'next-year':
                return itemDate.getFullYear() === currentYear + 1;
            default:
                return true;
        }
    }
    
    switchView(view) {
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`[data-view="${view}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        ['cards-view', 'timeline-view', 'table-view'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        this.currentView = view;
        this.renderCurrentView();
    }

    renderCurrentView() {
        switch (this.currentView) {
            case 'cards':
                this.renderCardsView();
                break;
            case 'timeline':
                this.renderTimelineView();
                break;
            case 'table':
                this.renderTableView();
                break;
        }
        const viewEl = document.getElementById(`${this.currentView}-view`);
        const noResultsEl = document.getElementById('no-results');
        if (viewEl) viewEl.style.display = 'block';
        if (noResultsEl) noResultsEl.style.display = this.filteredData.length === 0 ? 'block' : 'none';
    }
    
    renderCardsView() {
        const container = document.getElementById('cards-view');
        if (!container) return;
        container.innerHTML = '';

        this.filteredData.forEach(item => {
            const card = this.createCard(item);
            if (card) container.appendChild(card);
        });
    }
    
    createCard(item) {
        if (!item || typeof item.title !== 'string') return null;
        const card = document.createElement('div');
        const statusSlug = (item.status || '').toLowerCase().replace(/\s+/g, '-');
        card.className = `roadmap-card status-${statusSlug}`;

        const products = this.safeTagList(item.tagsContainer?.products);
        const platforms = this.safeTagList(item.tagsContainer?.platforms);
        const rp = this.safeTagList(item.tagsContainer?.releasePhase);
        const releasePhase = rp === 'General' ? String(item.status || '') : rp;
        const date = this.safeFormatDate(item.publicDisclosureAvailabilityDate, { year: 'numeric', month: 'short' }) || 'TBD';

        const changePill = item._changeType === 'new'
            ? '<span class="change-pill change-new">NEW</span>'
            : item._changeType === 'changed'
                ? '<span class="change-pill change-updated">UPDATED</span>'
                : '';
        const changedFieldsHtml = item._changeType === 'changed' && item._changedFields?.length
            ? `<div class="card-changed-fields">Changed: ${this.escapeHtml(item._changedFields.join(', '))}</div>`
            : '';

        card.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">${changePill}${this.escapeHtml(item.title)}</h3>
                <div class="card-date">${this.escapeHtml(date)}</div>
            </div>
            <div class="card-description">
                ${this.escapeHtml(this.safeDescription(item.description))}
            </div>
            ${changedFieldsHtml}
            <div class="card-tags">
                <span class="tag status ${this.getStatusClass(item.status)}">${this.escapeHtml(releasePhase)}</span>
                <span class="tag">${this.escapeHtml(products)}</span>
                ${platforms ? `<span class="tag">${this.escapeHtml(platforms)}</span>` : ''}
            </div>
        `;
        const expandBtn = card.querySelector('[data-expand="card"]');
        if (expandBtn) {
            expandBtn.addEventListener('click', function () {
                this.classList.toggle('expanded');
                this.textContent = this.classList.contains('expanded') ? 'Show Less' : 'Show More';
                const desc = this.closest('.roadmap-card')?.querySelector('.card-description');
                if (desc) desc.style.webkitLineClamp = this.classList.contains('expanded') ? 'unset' : '3';
            });
        }
        return card;
    }
    
    renderTimelineView() {
        const container = document.querySelector('#timeline-view .timeline');
        if (!container) return;
        container.innerHTML = '';

        const sortedData = [...this.filteredData].sort((a, b) => {
            const dA = this.safeParseDate(a?.publicDisclosureAvailabilityDate);
            const dB = this.safeParseDate(b?.publicDisclosureAvailabilityDate);
            return (dA.getTime ? dA.getTime() : 0) - (dB.getTime ? dB.getTime() : 0);
        });

        sortedData.forEach(item => {
            const node = this.createTimelineItem(item);
            if (node) container.appendChild(node);
        });
    }

    createTimelineItem(item) {
        if (!item || typeof item.title !== 'string') return null;
        const timelineItem = document.createElement('div');
        timelineItem.className = 'timeline-item';

        const date = this.safeFormatDate(item.publicDisclosureAvailabilityDate, { year: 'numeric', month: 'long', day: 'numeric' }) || 'To Be Determined';
        const products = this.safeTagList(item.tagsContainer?.products);

        const timelineChangePill = item._changeType === 'new'
            ? '<span class="change-pill change-new">NEW</span>'
            : item._changeType === 'changed'
                ? '<span class="change-pill change-updated">UPDATED</span>'
                : '';

        timelineItem.innerHTML = `
            <div class="timeline-date">${this.escapeHtml(date)}</div>
            <div class="timeline-title">${timelineChangePill}${this.escapeHtml(item.title)}</div>
            <div class="timeline-description">
                <strong>Service:</strong> ${this.escapeHtml(products)}<br>
                <strong>Status:</strong> ${this.escapeHtml(String(item.status || ''))}<br><br>
                ${this.escapeHtml(this.safeDescription(item.description))}
            </div>
        `;
        return timelineItem;
    }
    
    renderTableView() {
        const tbody = document.querySelector('#table-view tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        this.filteredData.forEach(item => {
            const row = this.createTableRow(item);
            if (row) tbody.appendChild(row);
        });
    }

    createTableRow(item) {
        if (!item || typeof item.title !== 'string') return null;
        const row = document.createElement('tr');

        const products = this.safeTagList(item.tagsContainer?.products);
        const platforms = this.safeTagList(item.tagsContainer?.platforms);
        const date = this.safeFormatDate(item.publicDisclosureAvailabilityDate, { year: 'numeric', month: 'short' }) || 'TBD';
        const descSnippet = this.safeDescription(item.description).substring(0, 100);
        const descDisplay = descSnippet.length >= 100 ? `${descSnippet}...` : descSnippet;

        const tableChangePill = item._changeType === 'new'
            ? '<span class="change-pill change-new">NEW</span>'
            : item._changeType === 'changed'
                ? '<span class="change-pill change-updated">UPDATED</span>'
                : '';

        row.innerHTML = `
            <td>
                <strong>${this.escapeHtml(item.title)}</strong><br>
                <small style="color: #605e5c;">${this.escapeHtml(descDisplay)}</small>
            </td>
            <td>${this.escapeHtml(products)}</td>
            <td><span class="tag status ${this.getStatusClass(item.status)}">${this.escapeHtml(String(item.status || ''))}</span></td>
            <td>${this.escapeHtml(platforms)}</td>
            <td>${this.escapeHtml(date)}</td>
            <td>${tableChangePill}</td>
        `;
        return row;
    }
    
    updateStatistics() {
        document.getElementById('total-items').textContent = this.allData.length;
        
        const inDevelopment = this.allData.filter(item => 
            item.status === 'In development').length;
        document.getElementById('in-development').textContent = inDevelopment;
        
        const rollingOut = this.allData.filter(item =>
            item.status === 'Rolling out' || item.status === 'General Availability').length;
        document.getElementById('rolling-out').textContent = rollingOut;

        // Launched count
        const launched = this.allData.filter(i => i.status === 'Launched').length;
        const launchedEl = document.getElementById('stat-launched');
        if (launchedEl) launchedEl.textContent = launched;

        // This quarter count
        const quarterCount = this.allData.filter(i =>
            this.matchesTimeline(i, 'this-quarter')).length;
        const quarterEl = document.getElementById('stat-quarter');
        if (quarterEl) quarterEl.textContent = quarterCount;

        this.updateRefreshStatus();
    }
    
    updateRefreshStatus() {
        const cachedData = this.getCachedData();
        const lastUpdateElement = document.getElementById('last-update');
        if (!lastUpdateElement) return;

        if (cachedData && typeof cachedData.timestamp === 'number') {
            const lastUpdate = new Date(cachedData.timestamp);
            const now = new Date();
            const diffMinutes = Math.floor((now - lastUpdate) / (1000 * 60));
            let timeAgo;
            if (diffMinutes < 1) timeAgo = 'just now';
            else if (diffMinutes < 60) timeAgo = `${diffMinutes}m ago`;
            else if (diffMinutes < 1440) timeAgo = `${Math.floor(diffMinutes / 60)}h ago`;
            else timeAgo = `${Math.floor(diffMinutes / 1440)}d ago`;
            lastUpdateElement.textContent = `Last updated: ${timeAgo}`;
            if (isDiagnosticsMode()) {
                logDiagnostics('cache age minutes', diffMinutes, 'stale', isCacheStale(cachedData.timestamp));
            }
        } else {
            lastUpdateElement.textContent = 'Last updated: Unknown';
        }

        const nextUpdateElement = document.getElementById('next-update');
        if (nextUpdateElement) nextUpdateElement.textContent = `Next update: ${this.getNextUpdateTime()}`;
    }
    
    getNextUpdateTime() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(5, 0, 0, 0); // 5:00 AM
        
        // Convert to PT (UTC-8)
        const ptTime = new Date(tomorrow.getTime() - (8 * 60 * 60 * 1000));
        
        return ptTime.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short', 
            day: 'numeric'
        }) + ' at 5:00 AM PT';
    }
    
    updateResultsInfo() {
        const resultsInfo = document.getElementById('results-info');
        const resultsCount = document.getElementById('results-count');
        const clearFiltersBtn = document.getElementById('clear-filters');
        
        resultsCount.textContent = this.filteredData.length;
        resultsInfo.style.display = 'flex';
        
        // Show clear filters button if any filters are active
        const hasActiveFilters = Object.values(this.filters).some(filter => filter);
        clearFiltersBtn.style.display = hasActiveFilters ? 'block' : 'none';
    }
    
    clearAllFilters() {
        // Reset all filters
        this.filters = {
            search: '',
            service: '',
            status: '',
            platform: '',
            timeline: ''
        };
        
        // Reset UI elements
        document.getElementById('search-input').value = '';
        document.getElementById('clear-search').style.display = 'none';
        document.getElementById('service-filter').value = '';
        document.getElementById('status-filter').value = '';
        document.getElementById('platform-filter').value = '';
        document.getElementById('timeline-filter').value = '';
        
        this.applyFilters();
    }
    
    async refreshData() {
        const refreshBtn = document.getElementById('refresh-data');
        refreshBtn.classList.add('refreshing');
        refreshBtn.disabled = true;
        
        try {
            // Clear cache
            localStorage.removeItem('m365-roadmap-data');
            
            // Reload data
            await this.loadData();
            
            this.showNotification('Data refreshed successfully!', 'success');
        } catch (error) {
            this.showNotification('Failed to refresh data', 'error');
        } finally {
            refreshBtn.classList.remove('refreshing');
            refreshBtn.disabled = false;
        }
    }
    
    showLoading() {
        this.setLoadState(LoadState.LOADING);
        this.applyStateToDOM();
    }

    hideLoading() {
        if (this.loadState === LoadState.LOADING) {
            this.setLoadState(this.allData.length === 0 ? LoadState.EMPTY : LoadState.SUCCESS);
            this.applyStateToDOM();
        }
    }

    showError() {
        this.setLoadState(LoadState.ERROR_FATAL);
        this.applyStateToDOM();
    }
    
    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        const safeMessage = this.escapeHtml(message != null ? String(message) : '');
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'times-circle'}"></i>
                <span>${safeMessage}</span>
            </div>
        `;
        
        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#107c10' : type === 'warning' ? '#ff8c00' : '#a4262c'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Auto remove
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 4000);
    }
    
    getStatusClass(status) {
        switch (status?.toLowerCase()) {
            case 'in development':
                return 'in-development';
            case 'rolling out':
                return 'rolling-out';
            case 'launched':
                return 'launched';
            default:
                return '';
        }
    }
    
    escapeHtml(text) {
        if (text == null) return '';
        const s = String(text);
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    /** Safe string for description (null/undefined -> ''). */
    safeDescription(desc) {
        return (desc != null && typeof desc === 'string') ? desc : '';
    }

    /** Safe tag list from tagsContainer array; returns 'General' if empty. */
    safeTagList(arr) {
        if (!Array.isArray(arr)) return 'General';
        const names = arr.map(p => (p && p.tagName != null) ? String(p.tagName) : '').filter(Boolean);
        return names.length ? names.join(', ') : 'General';
    }

    /** Format date for display; invalid/missing returns null. */
    safeFormatDate(value, options) {
        if (value == null || value === '') return null;
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return null;
        return d.toLocaleDateString('en-US', options || { year: 'numeric', month: 'short' });
    }

    /** Parse date for sorting; invalid returns sentinel. */
    safeParseDate(value) {
        if (value == null || value === '') return { getTime: () => 0 };
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? { getTime: () => 0 } : d;
    }
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    // Initialize the dashboard when the DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
        new M365RoadmapDashboard();
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        LoadState,
        getCacheMaxAgeMs,
        isCacheStale,
        filterCopilotItems,
        filterRoadmapItems,
        itemMatchesFilters,
        M365RoadmapDashboard
    };
}