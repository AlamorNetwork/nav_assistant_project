const API_BASE_URL = 'https://chabokan.irplatforme.ir';
const MAX_PERSISTED_LOGS = 500;
let monitoringInterval = null;
let monitoringIntervalMs = 120000; // 2 minutes
let activeFunds = [];

// --- Helper Functions ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`);
    
    try {
        const stored = await chrome.storage.local.get('nav_logs');
        const logs = Array.isArray(stored.nav_logs) ? stored.nav_logs : [];
        logs.push({ message, type, timestamp: Date.now() });
        
        if (logs.length > MAX_PERSISTED_LOGS) {
            logs.splice(0, logs.length - MAX_PERSISTED_LOGS);
        }
        
        await chrome.storage.local.set({ nav_logs: logs });
        
        // Send to popup if open
        try {
            await chrome.runtime.sendMessage({
                type: 'LOG_ENTRY',
                data: { message, type, timestamp: Date.now() }
            });
        } catch (e) {
            // Popup not open, ignore
        }
    } catch (e) {
        console.error('Log storage error:', e);
    }
}

function parseNumber(text) {
    if (!text) return null;
    const cleaned = text.toString().replace(/[^\d.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

function isNavPage() {
    const url = window.location.href.toLowerCase();
    const isNav = url.includes('fund.do') || url.includes('navlist');
    if (isNav) {
        log(`✅ NAV page detected: ${url}`, 'info');
    }
    return isNav;
}

function isExpertPage() {
    const url = window.location.href.toLowerCase();
    const isExpert = url.includes('adjustedip') || url.includes('expert');
    if (isExpert) {
        log(`✅ Expert page detected: ${url}`, 'info');
    }
    return isExpert;
}

// --- Desktop Notifications ---
async function showDesktopNotification(options) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'SHOW_DESKTOP_NOTIFICATION',
            options: options
        });
        
        if (response && response.ok) {
            log(`✅ Desktop notification shown: ${response.notificationId}`, 'success');
        } else {
            log(`❌ Desktop notification failed: ${response?.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        log(`❌ Desktop notification error: ${error.message}`, 'error');
    }
}

// --- Main Bot Logic ---
class NAVBot {
    constructor() {
        this.currentFund = null;
        this.config = null;
        this.state = {
            navTabId: null,
            expertTabId: null,
            selectedSecurity: null,
            isMonitoring: false
        };
    }

    async initialize() {
        log('🤖 NAV Bot initializing...', 'info');
        
        // Get current tab ID
        try {
            // Check if chrome.tabs API is available
            if (!chrome.tabs || !chrome.tabs.query) {
                log('⚠️ Chrome tabs API not available in this context', 'warn');
                return;
            }
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentTabId = tab?.id;
            
            if (isNavPage()) {
                this.state.navTabId = currentTabId;
                log(`📊 NAV page detected - Tab ID: ${currentTabId}`, 'success');
                await chrome.storage.local.set({ navTabId: currentTabId });
            } else if (isExpertPage()) {
                this.state.expertTabId = currentTabId;
                log(`🔍 Expert page detected - Tab ID: ${currentTabId}`, 'success');
                await chrome.storage.local.set({ expertTabId: currentTabId });
            }
        } catch (e) {
            log(`❌ Tab detection error: ${e.message}`, 'error');
        }

        // Get active fund and config
        await this.loadFundConfig();
        
        // Start appropriate workflow
        if (isNavPage()) {
            await this.handleNavPage();
        } else if (isExpertPage()) {
            // Only handle Expert page if we actually need expert data
            const needsExpert = await chrome.storage.local.get(`needsExpertData_${this.currentFund}`);
            if (needsExpert[`needsExpertData_${this.currentFund}`]) {
                log('🔍 Expert data needed - processing Expert page', 'info');
                await this.handleExpertPage();
            } else {
                log('⚠️ Expert page detected but no expert data needed', 'warn');
            }
        } else {
            log('⚠️ Unknown page type', 'warn');
        }
    }

    async loadFundConfig() {
        try {
            // Get auth token
            const { authToken } = await chrome.storage.sync.get('authToken');
            if (!authToken) {
                log('❌ No auth token found', 'error');
                return;
            }

            // Get active fund
            const { activeFund } = await chrome.storage.sync.get('activeFund');
            if (!activeFund) {
                log('❌ No active fund selected', 'error');
                return;
            }

            this.currentFund = activeFund;
            log(`📁 Active fund: ${activeFund}`, 'info');

            // Get fund configuration
            const response = await fetch(`${API_BASE_URL}/configurations/${activeFund}`, {
                headers: { 'token': authToken },
                method: 'GET',
                mode: 'cors'
            });

            if (response.ok) {
                this.config = await response.json();
                log(`⚙️ Configuration loaded for ${activeFund}`, 'success');
            } else {
                // Use fallback config
                this.config = this.getFallbackConfig();
                log(`⚠️ Using fallback configuration`, 'warn');
            }

        } catch (error) {
            log(`❌ Config loading error: ${error.message}`, 'error');
            this.config = this.getFallbackConfig();
        }
    }

    getFallbackConfig() {
        return {
            nav_search_button_selector: 'input[type="submit"][value*="جستجو"]',
            expert_search_button_selector: 'input[type="submit"][value*="جستجو"]',
            nav_price_selector: 'td:nth-child(12)', // نرخ آماری
            total_units_selector: 'td:nth-child(9)', // کل واحدها
            securities_list_selector: 'table tbody tr',
            sellable_quantity_selector: 'td:nth-child(3)', // مانده قابل فروش
            expert_price_selector: 'td:nth-child(12)' // قیمت کارشناسی
        };
    }

    async handleNavPage() {
        log('📊 Processing NAV page...', 'info');

        try {
            // Check if search was already clicked recently
            const stored = await chrome.storage.local.get(['navSearchClicked', 'searchClickedTime']);
            const recentClick = stored.searchClickedTime && (Date.now() - stored.searchClickedTime < 30000); // 30 seconds
            
            if (!stored.navSearchClicked || !recentClick) {
                // Step 1: Find and set page rows (try various methods)
                await this.increasePageRows();
                
                // Step 2: Click search button (this will wait for content refresh)
                await this.clickSearchButton('nav');
            } else {
                log('🔄 Search already clicked recently, proceeding to read data...', 'info');
                // Clear the flag since we're processing now
                await chrome.storage.local.remove(['navSearchClicked', 'searchClickedTime']);
            }
            
            // Step 3: Read NAV data
            await this.readNavData();
            
        } catch (error) {
            log(`❌ NAV page error: ${error.message}`, 'error');
        }
    }

    async handleExpertPage() {
        log('🔍 Processing Expert page...', 'info');

        try {
            // Check if search was clicked recently (last 60 seconds)
            const stored = await chrome.storage.local.get(['expertSearchClicked', 'searchClickedTime']);
            const recentClick = stored.searchClickedTime && (Date.now() - stored.searchClickedTime < 60000); // 60 seconds
            
            if (!recentClick) {
                // Always do initial setup on fresh Expert page load
                log('🔧 Expert page setup - clicking search and loading securities...', 'info');
                
                // Step 1: Find and set page rows
                await this.increasePageRows();
                
                // Step 2: Click search button to load fresh data
                await this.clickSearchButton('expert');
                
                // Step 3: Check if we need to select security
                const needsSelection = await this.checkSecuritySelection();
                if (needsSelection) {
                    log('🎯 Security selection needed', 'info');
                    await this.selectSecurity();
                } else {
                    log('🔄 Using previously selected security', 'info');
                }
                
            } else {
                log('🔄 Search recently clicked, proceeding with data reading...', 'info');
                // Clear the flag since we're processing now
                await chrome.storage.local.remove(['expertSearchClicked', 'searchClickedTime']);
            }
            
            // Step 4: Read expert data (always do this)
            await this.readExpertData();
            
        } catch (error) {
            log(`❌ Expert page error: ${error.message}`, 'error');
        }
    }

    async increasePageRows() {
        log('📈 Attempting to increase page rows...', 'info');

        // Method 1: Try common input selectors
        const rowInputSelectors = [
            'input[name*="rows"]',
            'input[name*="pageSize"]', 
            'input[name*="search.rows"]',
            'input[type="number"]',
            'input[type="text"][value="10"]',
            'input[type="text"][value="25"]',
            'input[type="text"][value="50"]'
        ];

        for (const selector of rowInputSelectors) {
            const input = document.querySelector(selector);
            if (input) {
                try {
                    input.value = '';
                    input.value = '1000';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    log(`✅ Rows increased via selector: ${selector}`, 'success');
                    return;
                } catch (e) {
                    log(`❌ Failed with selector ${selector}: ${e.message}`, 'warn');
                }
            }
        }

        // Method 2: Try select dropdowns
        const selectElements = document.querySelectorAll('select');
        for (const select of selectElements) {
            const options = Array.from(select.options);
            const hasRowOptions = options.some(opt => 
                /^\d+$/.test(opt.value) && parseInt(opt.value) >= 50
            );
            
            if (hasRowOptions) {
                try {
                    // Find the highest value
                    const maxOption = options.reduce((max, opt) => {
                        const val = parseInt(opt.value);
                        return val > parseInt(max.value) ? opt : max;
                    });
                    
                    select.value = maxOption.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    log(`✅ Rows increased via select: ${maxOption.value}`, 'success');
                    return;
                } catch (e) {
                    log(`❌ Failed with select: ${e.message}`, 'warn');
                }
            }
        }

        // Method 3: Try URL parameter manipulation
        try {
            const url = new URL(window.location.href);
            const hasRowsParam = url.searchParams.has('rows') || 
                                url.searchParams.has('pageSize') ||
                                url.searchParams.has('limit');
                                
            if (hasRowsParam) {
                url.searchParams.set('rows', '1000');
                url.searchParams.set('pageSize', '1000');
                url.searchParams.set('limit', '1000');
                window.location.href = url.toString();
                log(`✅ Rows increased via URL parameters`, 'success');
                return;
            }
        } catch (e) {
            log(`❌ URL parameter method failed: ${e.message}`, 'warn');
        }

        log('⚠️ Could not find rows increase method - proceeding anyway', 'warn');
    }

    async clickSearchButton(pageType) {
        log(`🔎 Clicking ${pageType} search button...`, 'info');

        const selector = pageType === 'nav' ? 
            this.config.nav_search_button_selector : 
            this.config.expert_search_button_selector;

        let button = document.querySelector(selector);
        
        // Fallback selectors
        if (!button) {
            const fallbacks = [
                'input[type="submit"][value*="جستجو"]',
                'input[type="submit"][value="جستجو"]',
                'input[type="submit"]',
                'button[type="submit"]',
                'input[value*="search"]',
                'button:contains("جستجو")'
            ];
            
            for (const fallback of fallbacks) {
                button = document.querySelector(fallback);
                if (button) {
                    log(`✅ Found search button with fallback: ${fallback}`, 'info');
                    break;
                }
            }
        }

        if (button) {
            try {
                // Multiple click methods for reliability
                button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await sleep(500);
                
                button.click();
                
                // Dispatch click event
                button.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                }));
                
                // Try form submit if in form
                const form = button.closest('form');
                if (form) {
                    try {
                        if (form.requestSubmit) {
                            form.requestSubmit();
                        } else {
                            form.submit();
                        }
                    } catch (e) {
                        log(`⚠️ Form submit failed: ${e.message}`, 'warn');
                    }
                }
                
                log(`✅ Search button clicked successfully`, 'success');
                
                // Set flag and wait for content to load (no page reload, just content refresh)
                await chrome.storage.local.set({ 
                    [`${pageType}SearchClicked`]: true,
                    searchClickedTime: Date.now()
                });
                
                // Wait for content to refresh (not page reload)
                log(`⏳ Waiting for content to refresh...`, 'info');
                await sleep(3000); // Wait for AJAX/content refresh
                
            } catch (error) {
                log(`❌ Click failed: ${error.message}`, 'error');
            }
        } else {
            log(`❌ Search button not found`, 'error');
            
            // Debug: show all clickable elements
            const clickables = document.querySelectorAll('input[type="submit"], button, input[type="button"]');
            log(`🔍 Found ${clickables.length} clickable elements:`, 'info');
            clickables.forEach((el, i) => {
                const text = el.value || el.innerText || el.textContent || '';
                log(`  ${i+1}. "${text}" (${el.tagName})`, 'info');
            });
        }
    }

    async readNavData() {
        log('📊 Reading NAV data...', 'info');

        try {
            // Wait for table to load and check for data
            let attempts = 0;
            let dataTable = null;
            
            while (attempts < 10 && !dataTable) {
                await sleep(1000);
                
                // Find the main data table
                const tables = document.querySelectorAll('table');
                for (const table of tables) {
                    const rows = table.querySelectorAll('tbody tr');
                    if (rows.length > 5) { // Assume data table has many rows
                        dataTable = table;
                        break;
                    }
                }
                
                attempts++;
                if (!dataTable) {
                    log(`⏳ Waiting for data table to load... (attempt ${attempts}/10)`, 'info');
                }
            }
            
            if (!dataTable) {
                log('❌ Data table not found after waiting', 'error');
                return;
            }
            
            log(`✅ Data table found with ${dataTable.querySelectorAll('tbody tr').length} rows`, 'success');
            
            // Read latest NAV value (first data row)
            const dataRows = dataTable.querySelectorAll('tbody tr');
            if (dataRows.length === 0) {
                log('❌ No data rows found', 'error');
                return;
            }
            
            const firstRow = dataRows[0];
            const cells = firstRow.querySelectorAll('td');
            
            if (cells.length < 12) {
                log('❌ Insufficient columns in data row', 'error');
                return;
            }
            
            // Extract NAV and total units
            const navValue = parseNumber(cells[11]?.textContent); // نرخ آماری
            const totalUnits = parseNumber(cells[8]?.textContent); // کل واحدها
            
            if (navValue === null || totalUnits === null) {
                log('❌ Could not parse NAV or total units', 'error');
                return;
            }
            
            log(`📊 NAV Data - Value: ${navValue}, Units: ${totalUnits}`, 'success');
            
            // Send to server for checking
            await this.checkNavWithServer(navValue, totalUnits);
            
        } catch (error) {
            log(`❌ NAV reading error: ${error.message}`, 'error');
        }
    }

    async checkNavWithServer(navValue, totalUnits) {
        try {
            const { authToken } = await chrome.storage.sync.get('authToken');
            
            const response = await fetch(`${API_BASE_URL}/check-nav`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'token': authToken
                },
                body: JSON.stringify({
                    fund_name: this.currentFund,
                    nav_on_page: navValue,
                    total_units: totalUnits
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server response: ${response.status}`);
            }
            
            const result = await response.json();
            log(`📡 Server response: ${result.status}`, 'info');
            
            if (result.status === 'adjustment_needed_more_data_required') {
                log('⚠️ Adjustment needed - switching to Expert page', 'warn');
                
                // Save NAV data and switch to expert
                await chrome.storage.local.set({
                    [`navData_${this.currentFund}`]: { navValue, totalUnits },
                    [`needsExpertData_${this.currentFund}`]: true
                });
                
                // Open expert page
                await this.openExpertPage();
                
            } else if (result.status === 'ok') {
                log('✅ NAV check passed - no issues', 'success');
                
            } else if (result.status === 'adjustment_needed') {
                // Show adjustment notification
                await this.showAdjustmentNotification(result);
            }
            
        } catch (error) {
            log(`❌ Server check error: ${error.message}`, 'error');
        }
    }

    async openExpertPage() {
        try {
            const expertUrl = this.config.expert_price_page_url || 
                             'https://krzetf5.irbroker.com/adjustedIp.do';
            
            const tab = await chrome.tabs.create({ 
                url: expertUrl,
                active: false
            });
            
            this.state.expertTabId = tab.id;
            await chrome.storage.local.set({ expertTabId: tab.id });
            
            log(`🔍 Expert page opened - Tab ID: ${tab.id}`, 'success');
            
        } catch (error) {
            log(`❌ Failed to open expert page: ${error.message}`, 'error');
        }
    }

    async checkSecuritySelection() {
        // Check if we already have selected security for this fund
        const stored = await chrome.storage.local.get(`selectedSecurity_${this.currentFund}`);
        const hasSelectedSecurity = !!stored[`selectedSecurity_${this.currentFund}`];
        
        if (hasSelectedSecurity) {
            log(`✅ Security already selected: ${stored[`selectedSecurity_${this.currentFund}`].name}`, 'info');
        } else {
            log('🔄 No security selected yet - selection needed', 'info');
        }
        
        return !hasSelectedSecurity; // Return true if selection needed
    }

    async selectSecurity() {
        log('🎯 Security selection needed...', 'info');

        try {
            // Wait for Expert table to load with data
            let attempts = 0;
            let securities = [];
            
            while (attempts < 10 && securities.length === 0) {
                await sleep(1000);
                
                // Use the specific selector for adjustedIpList table
                const table = document.querySelector('#adjustedIpList');
                if (!table) {
                    log(`⏳ Waiting for #adjustedIpList table... (attempt ${attempts + 1}/10)`, 'info');
                    attempts++;
                    continue;
                }

                const rows = table.querySelectorAll('tbody tr');
                if (rows.length === 0) {
                    log(`⏳ Waiting for table rows... (attempt ${attempts + 1}/10)`, 'info');
                    attempts++;
                    continue;
                }

                // Extract security names using the specific selector pattern
                securities = [];
                rows.forEach((row, index) => {
                    // Use td:nth-child(1) for the first column (security name)
                    const nameCell = row.querySelector('td:nth-child(1)');
                    if (nameCell) {
                        const name = nameCell.textContent.trim();
                        if (name && name !== 'جمع' && name !== '' && !name.includes('نتيجه‌ي جستجو')) {
                            securities.push({ 
                                name, 
                                index, 
                                row,
                                selector: `#adjustedIpList > tbody > tr:nth-child(${index + 1}) > td:nth-child(1)`
                            });
                        }
                    }
                });

                if (securities.length > 0) {
                    log(`✅ Found ${securities.length} securities in #adjustedIpList`, 'success');
                    break;
                } else {
                    attempts++;
                    log(`⏳ No valid securities found yet... (attempt ${attempts}/10)`, 'info');
                }
            }

            if (securities.length === 0) {
                log('❌ No valid securities found after waiting', 'error');
                return;
            }

            // Log found securities for debugging
            log('📋 Available securities:', 'info');
            securities.forEach((sec, i) => {
                log(`  ${i + 1}. ${sec.name}`, 'info');
            });

            // Show selection modal
            await this.showSecuritySelectionModal(securities);

        } catch (error) {
            log(`❌ Security selection error: ${error.message}`, 'error');
        }
    }

    async showSecuritySelectionModal(securities) {
        return new Promise((resolve) => {
            // Create modal
            const modal = document.createElement('div');
            modal.innerHTML = `
                <div class="modal-content" style="background: white; padding: 20px; border-radius: 10px; max-width: 500px; direction: rtl;">
                    <h3>انتخاب اوراق بهادار</h3>
                    <p>لطفاً اوراق بهادار مورد نظر را برای صندوق "${this.currentFund}" انتخاب کنید:</p>
                    <select id="security-selector" style="width: 100%; margin: 10px 0; padding: 5px;">
                        ${securities.map((sec, i) => `<option value="${i}">${sec.name}</option>`).join('')}
                    </select>
                    <div style="margin: 15px 0;">
                        <button id="confirm-btn" style="background: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 5px; margin-left: 10px;">تایید</button>
                        <button id="cancel-btn" style="background: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px;">انصراف</button>
                    </div>
                </div>
            `;

            Object.assign(modal.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0,0,0,0.7)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: '10000',
                fontFamily: 'Arial, sans-serif'
            });

            document.body.appendChild(modal);

            // Event handlers
            modal.querySelector('#confirm-btn').onclick = async () => {
                const selectedIndex = parseInt(modal.querySelector('#security-selector').value);
                const selectedSecurity = securities[selectedIndex];
                
                // Save selection
                await chrome.storage.local.set({
                    [`selectedSecurity_${this.currentFund}`]: selectedSecurity
                });
                
                log(`✅ Security selected: ${selectedSecurity.name}`, 'success');
                modal.remove();
                resolve(selectedSecurity);
            };

            modal.querySelector('#cancel-btn').onclick = () => {
                modal.remove();
                resolve(null);
            };
        });
    }

    async readExpertData() {
        log('🔍 Reading Expert data...', 'info');

        try {
            // Get selected security
            const stored = await chrome.storage.local.get(`selectedSecurity_${this.currentFund}`);
            const selectedSecurity = stored[`selectedSecurity_${this.currentFund}`];
            
            if (!selectedSecurity) {
                log('❌ No selected security found', 'error');
                return;
            }

            // Wait for #adjustedIpList table to load with data
            let attempts = 0;
            let table = null;
            
            while (attempts < 10 && !table) {
                await sleep(1000);
                
                table = document.querySelector('#adjustedIpList');
                if (table) {
                    const rows = table.querySelectorAll('tbody tr');
                    if (rows.length < 3) {
                        table = null; // Not enough data yet
                    }
                }
                
                attempts++;
                if (!table) {
                    log(`⏳ Waiting for #adjustedIpList table with data... (attempt ${attempts}/10)`, 'info');
                }
            }

            if (!table) {
                log('❌ #adjustedIpList table not found after waiting', 'error');
                return;
            }
            
            log(`✅ #adjustedIpList table found with ${table.querySelectorAll('tbody tr').length} rows`, 'success');

            const rows = table.querySelectorAll('tbody tr');
            let securityRow = null;

            // Find the security row by name (first column)
            for (const row of rows) {
                const nameCell = row.querySelector('td:nth-child(1)');
                if (nameCell && nameCell.textContent.trim() === selectedSecurity.name) {
                    securityRow = row;
                    log(`✅ Found security row for: ${selectedSecurity.name}`, 'success');
                    break;
                }
            }

            if (!securityRow) {
                log(`❌ Security row not found: ${selectedSecurity.name}`, 'error');
                return;
            }

            // Extract data
            const cells = securityRow.querySelectorAll('td');
            const sellableQuantity = parseNumber(cells[2]?.textContent); // مانده قابل فروش
            const expertPrice = parseNumber(cells[11]?.textContent); // قیمت کارشناسی

            if (sellableQuantity === null || expertPrice === null) {
                log('❌ Could not parse expert data', 'error');
                return;
            }

            log(`🔍 Expert Data - Sellable: ${sellableQuantity}, Price: ${expertPrice}`, 'success');

            // Send final data to server
            await this.sendFinalDataToServer(sellableQuantity, expertPrice);

        } catch (error) {
            log(`❌ Expert data reading error: ${error.message}`, 'error');
        }
    }

    async sendFinalDataToServer(sellableQuantity, expertPrice) {
        try {
            // Get NAV data
            const navData = await chrome.storage.local.get(`navData_${this.currentFund}`);
            const { navValue, totalUnits } = navData[`navData_${this.currentFund}`] || {};

            if (!navValue || !totalUnits) {
                log('❌ NAV data not found', 'error');
                return;
            }

            const { authToken } = await chrome.storage.sync.get('authToken');

            const response = await fetch(`${API_BASE_URL}/check-nav`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'token': authToken
                },
                body: JSON.stringify({
                    fund_name: this.currentFund,
                    nav_on_page: navValue,
                    total_units: totalUnits,
                    sellable_quantity: sellableQuantity,
                    expert_price: expertPrice
                })
            });

            if (!response.ok) {
                throw new Error(`Server response: ${response.status}`);
            }

            const result = await response.json();
            log(`📡 Final server response: ${result.status}`, 'success');

            if (result.status === 'adjustment_needed') {
                await this.showAdjustmentNotification(result);
            } else {
                log('✅ All checks passed - no adjustment needed', 'success');
            }

            // Clear expert data flag
            await chrome.storage.local.remove(`needsExpertData_${this.currentFund}`);

        } catch (error) {
            log(`❌ Final server check error: ${error.message}`, 'error');
        }
    }

    async showAdjustmentNotification(result) {
        const suggestedNav = result.suggested_nav || result.suggested || result.new_nav;
        
        const notificationOptions = {
            type: 'basic',
            iconUrl: '/icons/icon48.png',
            title: `🚨 تعدیل ${this.currentFund}`,
            message: `NAV پیشنهادی: ${suggestedNav}\nبررسی و تعدیل را انجام دهید.`,
            requireInteraction: true
        };

        await showDesktopNotification(notificationOptions);
        
        // Save notification for later display
        await chrome.storage.local.set({
            last_notification: notificationOptions,
            adjustmentNeeded: true,
            suggestedNav: suggestedNav
        });

        log(`🚨 Adjustment notification sent - Suggested NAV: ${suggestedNav}`, 'warn');
    }

    async startMonitoring() {
        if (this.state.isMonitoring) {
            log('⚠️ Monitoring already active', 'warn');
            return;
        }

        this.state.isMonitoring = true;
        log('🔄 Starting continuous monitoring...', 'info');

        // Clear any existing interval
        if (monitoringInterval) {
            clearInterval(monitoringInterval);
        }

        // Start monitoring loop
        monitoringInterval = setInterval(async () => {
            try {
                if (isNavPage()) {
                    log('🔄 Monitoring cycle - reading NAV data...', 'info');
                    await this.readNavData();
                } else if (isExpertPage()) {
                    // Only read expert if we need expert data
                    const needsExpert = await chrome.storage.local.get(`needsExpertData_${this.currentFund}`);
                    if (needsExpert[`needsExpertData_${this.currentFund}`]) {
                        log('🔄 Monitoring cycle - reading Expert data...', 'info');
                        await this.readExpertData();
                    }
                }
            } catch (error) {
                log(`❌ Monitoring cycle error: ${error.message}`, 'error');
            }
        }, monitoringIntervalMs);

        log(`✅ Monitoring started - interval: ${monitoringIntervalMs / 1000}s`, 'success');
    }

    async stopMonitoring() {
        if (monitoringInterval) {
            clearInterval(monitoringInterval);
            monitoringInterval = null;
        }
        
        this.state.isMonitoring = false;
        log('⏹️ Monitoring stopped', 'info');
    }
}

// --- Main Initialization ---
let botInstance = null;

async function initializeBot() {
    try {
        // Check if we should run on this page
        if (!isNavPage() && !isExpertPage()) {
            log('⚠️ Not a NAV or Expert page - skipping bot initialization', 'warn');
            return;
        }

        log(`🔍 Page detected: ${isNavPage() ? 'NAV' : 'Expert'} - URL: ${window.location.href}`, 'info');

        // Get active fund
        const { activeFund } = await chrome.storage.sync.get('activeFund');
        if (!activeFund) {
            log('⚠️ No active fund - bot not started', 'warn');
            return;
        }

        log(`📁 Active fund found: ${activeFund}`, 'success');

        // Check if this is after a search button click (no page reload, just content refresh)
        const stored = await chrome.storage.local.get(['navSearchClicked', 'expertSearchClicked', 'searchClickedTime']);
        const recentClick = stored.searchClickedTime && (Date.now() - stored.searchClickedTime < 30000); // 30 seconds

        if (recentClick) {
            log('🔄 Content refreshed after search click - continuing workflow...', 'info');
        }

        // Initialize bot
        log('🤖 Creating NAV Bot instance...', 'info');
        botInstance = new NAVBot();
        await botInstance.initialize();
        
        // Start monitoring after initial setup
        log('⏰ Starting monitoring in 2 seconds...', 'info');
        await sleep(2000);
        await botInstance.startMonitoring();

    } catch (error) {
        log(`❌ Bot initialization error: ${error.message}`, 'error');
    }
}

// --- Message Handlers ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            if (request.type === 'START_MONITORING') {
                await initializeBot();
                sendResponse({ ok: true });
                
            } else if (request.type === 'STOP_MONITORING') {
                if (botInstance) {
                    await botInstance.stopMonitoring();
                }
                sendResponse({ ok: true });
                
            } else if (request.type === 'GET_STATUS') {
                const isMonitoring = botInstance?.state.isMonitoring || false;
                sendResponse({ ok: true, isMonitoring });
                
            } else if (request.type === 'FORCE_CHECK') {
                if (botInstance) {
                    if (isNavPage()) {
                        await botInstance.readNavData();
                    } else if (isExpertPage()) {
                        await botInstance.readExpertData();
                    }
                }
                sendResponse({ ok: true });
                
            } else if (request.action === 'TEST_COMMUNICATION') {
                sendResponse({ 
                    ok: true, 
                    message: 'Content Script فعال است',
                    url: window.location.href,
                    pageType: isNavPage() ? 'NAV' : (isExpertPage() ? 'Expert' : 'Unknown'),
                    timestamp: new Date().toLocaleString('fa-IR')
                });
            }
            
        } catch (error) {
            log(`❌ Message handler error: ${error.message}`, 'error');
            sendResponse({ ok: false, error: error.message });
        }
    })();
    
    return true; // Keep message channel open
});

// --- Auto-start ---
(async () => {
    log('🚀 Starting NAV Checker initialization...', 'info');
    await sleep(1000); // Wait for page to settle
    
    // Debug: Show current URL
    log(`🌐 Current URL: ${window.location.href}`, 'info');
    log(`📊 Is NAV page: ${isNavPage()}`, 'info');
    log(`🔍 Is Expert page: ${isExpertPage()}`, 'info');
    
    await initializeBot();
})();

log('🤖 NAV Checker Content Script Loaded', 'info');
