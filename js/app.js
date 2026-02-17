class M365RoadmapDashboard {
    constructor() {
        this.allData = [];
        this.filteredData = [];
        this.currentView = 'cards';
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
    
    async loadData() {
        this.showLoading();
        
        try {
            // Try to load from local cache first
            const cachedData = this.getCachedData();
            if (cachedData && this.isCacheValid(cachedData.timestamp)) {
                this.allData = cachedData.data;
                this.processData();
                this.hideLoading();
                return;
            }
            
            // Fetch from API
            const response = await fetch('https://www.microsoft.com/releasecommunications/api/v1/m365');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.allData = data;
            
            // Cache the data
            this.setCachedData(data);
            
            this.processData();
            this.hideLoading();
            
        } catch (error) {
            console.error('Error loading data:', error);
            
            // Try to use cached data even if expired
            const cachedData = this.getCachedData();
            if (cachedData) {
                this.allData = cachedData.data;
                this.processData();
                this.hideLoading();
                this.showNotification('Using cached data - unable to fetch latest updates', 'warning');
            } else {
                this.showError();
            }
        }
    }
    
    getCachedData() {
        try {
            const cached = localStorage.getItem('m365-roadmap-data');
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.error('Error reading cache:', error);
            return null;
        }
    }
    
    setCachedData(data) {
        try {
            const cacheData = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem('m365-roadmap-data', JSON.stringify(cacheData));
        } catch (error) {
            console.error('Error setting cache:', error);
        }
    }
    
    isCacheValid(timestamp) {
        const cacheAge = Date.now() - timestamp;
        const maxAge = 4 * 60 * 60 * 1000; // 4 hours
        return cacheAge < maxAge;
    }
    
    processData() {
        this.populateFilterOptions();
        this.filteredData = [...this.allData];
        this.updateStatistics();
        this.renderCurrentView();
        this.updateResultsInfo();
    }
    
    populateFilterOptions() {
        // Extract unique services
        const services = new Set();
        const platforms = new Set();
        
        this.allData.forEach(item => {
            // Extract products from tags
            if (item.tagsContainer && item.tagsContainer.products) {
                item.tagsContainer.products.forEach(product => {
                    services.add(product.tagName);
                });
            }
            
            // Extract platforms
            if (item.tagsContainer && item.tagsContainer.platforms) {
                item.tagsContainer.platforms.forEach(platform => {
                    platforms.add(platform.tagName);
                });
            }
        });
        
        // Populate service filter
        const serviceFilter = document.getElementById('service-filter');
        serviceFilter.innerHTML = '<option value="">All Services</option>';
        Array.from(services).sort().forEach(service => {
            const option = document.createElement('option');
            option.value = service;
            option.textContent = service;
            serviceFilter.appendChild(option);
        });
        
        // Populate platform filter
        const platformFilter = document.getElementById('platform-filter');
        platformFilter.innerHTML = '<option value="">All Platforms</option>';
        Array.from(platforms).sort().forEach(platform => {
            const option = document.createElement('option');
            option.value = platform;
            option.textContent = platform;
            platformFilter.appendChild(option);
        });
    }
    
    applyFilters() {
        this.filteredData = this.allData.filter(item => {
            // Search filter
            if (this.filters.search) {
                const searchText = this.filters.search;
                const titleMatch = item.title.toLowerCase().includes(searchText);
                const descMatch = item.description.toLowerCase().includes(searchText);
                if (!titleMatch && !descMatch) return false;
            }
            
            // Service filter
            if (this.filters.service) {
                const hasService = item.tagsContainer?.products?.some(
                    product => product.tagName === this.filters.service
                );
                if (!hasService) return false;
            }
            
            // Status filter
            if (this.filters.status) {
                if (item.status !== this.filters.status) return false;
            }
            
            // Platform filter
            if (this.filters.platform) {
                const hasPlatform = item.tagsContainer?.platforms?.some(
                    platform => platform.tagName === this.filters.platform
                );
                if (!hasPlatform) return false;
            }
            
            // Timeline filter
            if (this.filters.timeline) {
                if (!this.matchesTimeline(item, this.filters.timeline)) return false;
            }
            
            return true;
        });
        
        this.renderCurrentView();
        this.updateResultsInfo();
    }
    
    matchesTimeline(item, timeline) {
        if (!item.publicDisclosureAvailabilityDate) return false;
        
        const itemDate = new Date(item.publicDisclosureAvailabilityDate);
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        switch (timeline) {
            case 'current-month':
                return itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
            case 'next-month':
                const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1);
                return itemDate.getMonth() === nextMonth.getMonth() && itemDate.getFullYear() === nextMonth.getFullYear();
            case 'this-quarter':
                const currentQuarter = Math.floor(currentMonth / 3);
                const itemQuarter = Math.floor(itemDate.getMonth() / 3);
                return itemQuarter === currentQuarter && itemDate.getFullYear() === currentYear;
            case 'next-quarter':
                const nextQuarter = (Math.floor(currentMonth / 3) + 1) % 4;
                const nextQuarterYear = nextQuarter === 0 ? currentYear + 1 : currentYear;
                const itemQ = Math.floor(itemDate.getMonth() / 3);
                return itemQ === nextQuarter && itemDate.getFullYear() === nextQuarterYear;
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
        document.querySelector(`[data-view="${view}"]`).classList.add('active');
        
        // Hide all views
        document.getElementById('cards-view').style.display = 'none';
        document.getElementById('timeline-view').style.display = 'none';
        document.getElementById('table-view').style.display = 'none';
        
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
        
        // Show appropriate view
        document.getElementById(`${this.currentView}-view`).style.display = 'block';
        
        // Show/hide no results
        document.getElementById('no-results').style.display = 
            this.filteredData.length === 0 ? 'block' : 'none';
    }
    
    renderCardsView() {
        const container = document.getElementById('cards-view');
        container.innerHTML = '';
        
        this.filteredData.forEach(item => {
            const card = this.createCard(item);
            container.appendChild(card);
        });
    }
    
    createCard(item) {
        const card = document.createElement('div');
        card.className = 'roadmap-card';
        
        const products = item.tagsContainer?.products?.map(p => p.tagName).join(', ') || 'General';
        const platforms = item.tagsContainer?.platforms?.map(p => p.tagName).join(', ') || '';
        const releasePhase = item.tagsContainer?.releasePhase?.map(p => p.tagName).join(', ') || item.status;
        
        const date = item.publicDisclosureAvailabilityDate ? 
            new Date(item.publicDisclosureAvailabilityDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short'
            }) : 'TBD';
        
        card.innerHTML = `
            <div class="card-header">
                <h3 class="card-title">${this.escapeHtml(item.title)}</h3>
                <div class="card-id">#${item.id}</div>
            </div>
            <div class="card-description">
                ${this.escapeHtml(item.description)}
            </div>
            <div class="card-tags">
                <span class="tag">${products}</span>
                ${platforms ? `<span class="tag">${platforms}</span>` : ''}
                <span class="tag status ${this.getStatusClass(item.status)}">${releasePhase}</span>
            </div>
            <div class="card-footer">
                <div class="card-date">
                    <i class="fas fa-calendar"></i>
                    ${date}
                </div>
                <button class="expand-btn" onclick="this.classList.toggle('expanded'); this.textContent = this.classList.contains('expanded') ? 'Show Less' : 'Show More'; this.parentNode.parentNode.querySelector('.card-description').style.webkitLineClamp = this.classList.contains('expanded') ? 'unset' : '3';">
                    Show More
                </button>
            </div>
        `;
        
        return card;
    }
    
    renderTimelineView() {
        const container = document.querySelector('#timeline-view .timeline');
        container.innerHTML = '';
        
        // Sort by date
        const sortedData = [...this.filteredData].sort((a, b) => {
            const dateA = new Date(a.publicDisclosureAvailabilityDate || '9999-12-31');
            const dateB = new Date(b.publicDisclosureAvailabilityDate || '9999-12-31');
            return dateA - dateB;
        });
        
        sortedData.forEach(item => {
            const timelineItem = this.createTimelineItem(item);
            container.appendChild(timelineItem);
        });
    }
    
    createTimelineItem(item) {
        const timelineItem = document.createElement('div');
        timelineItem.className = 'timeline-item';
        
        const date = item.publicDisclosureAvailabilityDate ? 
            new Date(item.publicDisclosureAvailabilityDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) : 'To Be Determined';
        
        const products = item.tagsContainer?.products?.map(p => p.tagName).join(', ') || 'General';
        
        timelineItem.innerHTML = `
            <div class="timeline-date">${date}</div>
            <div class="timeline-title">${this.escapeHtml(item.title)}</div>
            <div class="timeline-description">
                <strong>Service:</strong> ${products}<br>
                <strong>Status:</strong> ${item.status}<br><br>
                ${this.escapeHtml(item.description)}
            </div>
        `;
        
        return timelineItem;
    }
    
    renderTableView() {
        const tbody = document.querySelector('#table-view tbody');
        tbody.innerHTML = '';
        
        this.filteredData.forEach(item => {
            const row = this.createTableRow(item);
            tbody.appendChild(row);
        });
    }
    
    createTableRow(item) {
        const row = document.createElement('tr');
        
        const products = item.tagsContainer?.products?.map(p => p.tagName).join(', ') || 'General';
        const platforms = item.tagsContainer?.platforms?.map(p => p.tagName).join(', ') || '';
        
        const date = item.publicDisclosureAvailabilityDate ? 
            new Date(item.publicDisclosureAvailabilityDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short'
            }) : 'TBD';
        
        row.innerHTML = `
            <td>
                <strong>${this.escapeHtml(item.title)}</strong><br>
                <small style="color: #605e5c;">${this.escapeHtml(item.description.substring(0, 100))}...</small>
            </td>
            <td>${products}</td>
            <td><span class="tag status ${this.getStatusClass(item.status)}">${item.status}</span></td>
            <td>${platforms}</td>
            <td>${date}</td>
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
        document.getElementById('loading').style.display = 'block';
        document.getElementById('error').style.display = 'none';
        document.getElementById('results-info').style.display = 'none';
        document.getElementById(`${this.currentView}-view`).style.display = 'none';
    }
    
    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }
    
    showError() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('results-info').style.display = 'none';
        document.getElementById(`${this.currentView}-view`).style.display = 'none';
    }
    
    showNotification(message, type) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'times-circle'}"></i>
                <span>${message}</span>
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
            default:
                return '';
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the dashboard when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new M365RoadmapDashboard();
});