#!/bin/bash

# Microsoft 365 Roadmap Dashboard - Automated Update Script
# 
# This script can be run manually or scheduled via cron to automatically
# update the roadmap data and optionally deploy to GitHub Pages.
#
# Usage:
#   ./update.sh [options]
#
# Options:
#   -d, --deploy      Deploy to GitHub Pages after update
#   -q, --quiet       Suppress non-error output
#   -h, --help        Show this help message
#
# Environment Variables:
#   GITHUB_TOKEN      GitHub personal access token for deployment
#   GITHUB_REPO       GitHub repository (owner/repo)
#   GH_PAGES_BRANCH   GitHub Pages branch (default: gh-pages)

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_DIR/data"

# Default values
DEPLOY=false
QUIET=false
GITHUB_REPO="${GITHUB_REPO:-""}"
GH_PAGES_BRANCH="${GH_PAGES_BRANCH:-gh-pages}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    if [ "$QUIET" = false ]; then
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

log_success() {
    if [ "$QUIET" = false ]; then
        echo -e "${GREEN}[SUCCESS]${NC} $1"
    fi
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Help function
show_help() {
    cat << EOF
Microsoft 365 Roadmap Dashboard - Automated Update Script

Usage: $0 [options]

Options:
    -d, --deploy      Deploy to GitHub Pages after update
    -q, --quiet       Suppress non-error output
    -h, --help        Show this help message

Environment Variables:
    GITHUB_TOKEN      GitHub personal access token for deployment
    GITHUB_REPO       GitHub repository (owner/repo)
    GH_PAGES_BRANCH   GitHub Pages branch (default: gh-pages)

Examples:
    $0                          # Update data only
    $0 --deploy                 # Update data and deploy
    $0 --quiet --deploy         # Silent update and deploy

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--deploy)
            DEPLOY=true
            shift
            ;;
        -q|--quiet)
            QUIET=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Check if Node.js is available
check_nodejs() {
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js to run this script."
        exit 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2)
    local major_version=$(echo $node_version | cut -d'.' -f1)
    
    if [ "$major_version" -lt 14 ]; then
        log_error "Node.js version 14 or higher is required. Current version: $node_version"
        exit 1
    fi
    
    log_info "Using Node.js version: $node_version"
}

# Create necessary directories
create_directories() {
    log_info "Creating necessary directories..."
    
    mkdir -p "$DATA_DIR"
    mkdir -p "$PROJECT_DIR/logs"
    
    log_success "Directories created"
}

# Update roadmap data
update_data() {
    log_info "Updating Microsoft 365 roadmap data..."
    
    local log_file="$PROJECT_DIR/logs/update-$(date '+%Y%m%d-%H%M%S').log"
    local success=true
    
    # Set environment variables for the Node.js script
    export OUTPUT_DIR="$DATA_DIR"
    export LOG_LEVEL="info"
    export JSON_OUTPUT="true"
    
    # Run the update script and capture output
    if node "$SCRIPT_DIR/update-data.js" 2>&1 | tee "$log_file"; then
        log_success "Data update completed successfully"
        
        # Extract JSON output from the last line
        local result=$(tail -n 1 "$log_file")
        if echo "$result" | jq -e . &> /dev/null; then
            local item_count=$(echo "$result" | jq -r '.itemCount // "unknown"')
            log_info "Updated with $item_count roadmap items"
        fi
    else
        log_error "Data update failed. Check log file: $log_file"
        exit 1
    fi
}

# Deploy to GitHub Pages
deploy_to_github() {
    if [ "$DEPLOY" = false ]; then
        return 0
    fi
    
    log_info "Deploying to GitHub Pages..."
    
    # Check required environment variables
    if [ -z "$GITHUB_TOKEN" ]; then
        log_error "GITHUB_TOKEN environment variable is required for deployment"
        exit 1
    fi
    
    if [ -z "$GITHUB_REPO" ]; then
        log_error "GITHUB_REPO environment variable is required for deployment"
        exit 1
    fi
    
    # Check if git is available
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed. Please install Git for deployment."
        exit 1
    fi
    
    # Create a temporary directory for deployment
    local temp_dir=$(mktemp -d)
    local repo_url="https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git"
    
    # Cleanup function
    cleanup_temp() {
        if [ -d "$temp_dir" ]; then
            rm -rf "$temp_dir"
        fi
    }
    trap cleanup_temp EXIT
    
    # Clone the repository
    log_info "Cloning repository..."
    if git clone --quiet --depth 1 --branch "$GH_PAGES_BRANCH" "$repo_url" "$temp_dir" 2>/dev/null || \
       git clone --quiet --depth 1 "$repo_url" "$temp_dir"; then
        
        cd "$temp_dir"
        
        # Create or switch to GitHub Pages branch
        if ! git checkout "$GH_PAGES_BRANCH" 2>/dev/null; then
            log_info "Creating new $GH_PAGES_BRANCH branch"
            git checkout --orphan "$GH_PAGES_BRANCH"
            git rm -rf . 2>/dev/null || true
        fi
        
        # Copy dashboard files
        log_info "Copying dashboard files..."
        cp -r "$PROJECT_DIR"/* "$temp_dir/" 2>/dev/null || true
        
        # Remove unnecessary files for GitHub Pages
        rm -rf "$temp_dir/scripts" "$temp_dir/logs" "$temp_dir/.git" 2>/dev/null || true
        
        # Configure git
        git config user.name "Automated Update Bot"
        git config user.email "update-bot@example.com"
        
        # Add and commit changes
        git add .
        
        if git diff --cached --quiet; then
            log_info "No changes to deploy"
        else
            local commit_message="Update roadmap data - $(date '+%Y-%m-%d %H:%M:%S UTC')"
            git commit -m "$commit_message"
            
            # Push to GitHub
            log_info "Pushing to GitHub..."
            if git push origin "$GH_PAGES_BRANCH" --quiet; then
                log_success "Successfully deployed to GitHub Pages"
                log_info "Your dashboard will be available at: https://$(echo $GITHUB_REPO | tr '[:upper:]' '[:lower:]' | cut -d'/' -f1).github.io/$(echo $GITHUB_REPO | cut -d'/' -f2)/"
            else
                log_error "Failed to push to GitHub Pages"
                exit 1
            fi
        fi
    else
        log_error "Failed to clone repository: $GITHUB_REPO"
        exit 1
    fi
}

# Generate summary report
generate_summary() {
    log_info "Generating update summary..."
    
    local summary_file="$PROJECT_DIR/logs/last-update-summary.json"
    local data_file="$DATA_DIR/roadmap-data.json"
    
    if [ -f "$data_file" ]; then
        local total_items=$(jq '.metadata.totalItems // .items | length' "$data_file" 2>/dev/null || echo "unknown")
        local last_updated=$(jq -r '.metadata.lastUpdated // "unknown"' "$data_file" 2>/dev/null || echo "unknown")
        
        cat > "$summary_file" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
    "success": true,
    "totalItems": $total_items,
    "lastDataUpdate": "$last_updated",
    "deployed": $DEPLOY,
    "dataFile": "$data_file"
}
EOF
        
        log_success "Summary saved to: $summary_file"
        
        if [ "$QUIET" = false ]; then
            echo
            echo "Update Summary:"
            echo "  Total Items: $total_items"
            echo "  Last Updated: $last_updated"
            echo "  Deployed: $DEPLOY"
            echo
        fi
    else
        log_warning "Data file not found, cannot generate complete summary"
    fi
}

# Main execution
main() {
    log_info "Starting Microsoft 365 Roadmap Dashboard update..."
    log_info "Project directory: $PROJECT_DIR"
    
    check_nodejs
    create_directories
    update_data
    deploy_to_github
    generate_summary
    
    log_success "Update process completed successfully!"
}

# Run main function
main "$@"