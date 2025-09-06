const API_BASE_URL = 'https://chabokan.irplatforme.ir';

// DOM elements - will be initialized after DOM loads
let fundSelector, statusDiv, startBtn, stopBtn, resetBtn, logBox, clearLogBtn;
let confirmAdjustedBtn, showLastNotifBtn, adjustmentStatus, logoutBtn, closeTabsBtn;
let loginScreen, mainInterface, loginBtn, loginUsername, loginPassword, loginStatus;
let securityInfoContainer, selectedSecurityName, sellableQuantity, expertPrice, selectedRowNumber;
let refreshSecurityDataBtn, testSelectorsBtn, testNotificationBtn;
// Current security info elements (above logs)
let currentSecurityInfoContainer, currentSecurityName, currentSellableQuantity, currentExpertPrice, currentRowNumber;
// Test selector elements
let testNavPageBtn, testExpertPageBtn, testSearchButtonBtn, testPageElementsBtn, testTableDataBtn, testAllSelectorsBtn, testResults;

// --- نوتیفیکیشن دسکتاپ ---
async function showDesktopNotification(options) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'SHOW_DESKTOP_NOTIFICATION',
            options: options
        });
        
        if (response && response.ok) {
            addLog(`نوتیفیکیشن دسکتاپ نمایش داده شد: ${response.notificationId}`, 'success');
            return response.notificationId;
        } else {
            addLog(`خطا در نمایش نوتیفیکیشن دسکتاپ: ${response?.error || 'نامشخص'}`, 'warn');
            return null;
        }
    } catch (error) {
        addLog(`خطا در ارسال درخواست نوتیفیکیشن: ${error.message}`, 'error');
        return null;
    }
}

// --- مدیریت لاگ ---
function renderLogEntry(entry) {
    if (!logBox) return;
    const row = document.createElement('p');
    row.className = `log-entry ${entry.type || 'info'}`;
    const time = new Date(entry.timestamp || Date.now()).toLocaleTimeString();
    row.textContent = `[${time}] ${entry.message}`;
    logBox.appendChild(row);
}

async function addLog(message, type = 'info') {
    if (!logBox) {
        console.log(`[${type.toUpperCase()}] ${message}`);
        return;
    }
    renderLogEntry({ message, type, timestamp: Date.now() });
    logBox.scrollTop = logBox.scrollHeight;
}

async function clearLogs() {
    if (logBox) {
        logBox.innerHTML = '';
        await new Promise(resolve => chrome.storage.local.set({ nav_logs: [], last_notification: null }, resolve));
        addLog('لاگ‌ها پاک شدند.');
    }
}

// --- Authentication ---
async function checkAuth() {
    // Wait for DOM elements to be ready
    if (!logBox) {
        addLog('DOM not ready yet, retrying in 100ms...', 'warn');
        setTimeout(checkAuth, 100);
        return false;
    }
    
    const stored = await new Promise(resolve => chrome.storage.sync.get(['authToken', 'authUser'], resolve));
    addLog(`Checking auth: token=${!!stored.authToken}, user=${stored.authUser?.username || 'none'}`);
    
    if (stored.authToken && stored.authUser) {
        // Only verify token if we haven't checked recently (to avoid too many requests)
        const lastCheck = await new Promise(resolve => chrome.storage.local.get('lastAuthCheck', resolve));
        const now = Date.now();
        const timeSinceLastCheck = now - (lastCheck.lastAuthCheck || 0);
        
        // Only check token validity every 5 minutes
        if (timeSinceLastCheck < 5 * 60 * 1000) {
            addLog(`Token check skipped (checked ${Math.round(timeSinceLastCheck/1000)}s ago)`);
            showMainInterface();
            await fetchFunds(); // Load funds data
            return true;
        }
        
        // Verify token is still valid
        try {
            const response = await fetch(`${API_BASE_URL}/funds`, {
                headers: { 'token': stored.authToken }
            });
            addLog(`Token validation response: ${response.status}`);
            
            // Update last check time
            await chrome.storage.local.set({ lastAuthCheck: now });
            
            if (response.status === 401 || response.status === 403) {
                addLog('Token invalid or expired. Clearing auth and showing login.', 'warn');
                await chrome.storage.sync.remove(['authToken', 'authUser']);
                showLoginScreen();
                return false;
            }

            // Any other response (including network errors) - keep the session
            showMainInterface();
            addLog(`Authenticated as ${stored.authUser.username}`);
            await fetchFunds(); // Load funds data
            return true;
            
        } catch (e) {
            // Network or transient error: keep user logged in but log properly
            addLog(`Token validation error (keeping session): ${e.message}`, 'warn');
            await chrome.storage.local.set({ lastAuthCheck: now });
            
            // Only show main interface if we have valid auth data
            if (stored.authToken && stored.authUser && stored.authUser.username) {
                showMainInterface();
                await fetchFunds(); // Load funds data
                return true;
            } else {
                // Clear invalid auth data and show login
                await chrome.storage.sync.remove(['authToken', 'authUser']);
                showLoginScreen();
                return false;
            }
        }
    }
    
    // No token or user data
    addLog('No auth data found, showing login screen');
    showLoginScreen();
    return false;
}

function showLoginScreen() {
    if (loginScreen) {
        loginScreen.style.display = 'block';
    }
    if (mainInterface) {
        mainInterface.style.display = 'none';
    }
}

function showMainInterface() {
    if (loginScreen) {
        loginScreen.style.display = 'none';
    }
    if (mainInterface) {
        mainInterface.style.display = 'block';
    }
}

async function login() {
    if (!loginStatus || !loginUsername) {
        console.error('Login elements not found');
        return;
    }
    
    loginStatus.textContent = '⏳ در حال ورود...';
    loginStatus.style.color = 'var(--secondary-color)';
    try {
        addLog(`Attempting login for user: ${loginUsername.value}`);
        
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: loginUsername.value, password: loginPassword.value })
        });
        
        const raw = await response.text();
        addLog(`Login response status: ${response.status}`);
        addLog(`Login response body: ${raw}`, 'info');
        
        if (!response.ok) {
            addLog(`Login failed: ${raw}`, 'error');
            throw new Error(raw || 'ورود ناموفق');
        }
        
        let result;
        try {
            result = JSON.parse(raw);
            addLog(`Parsed JSON: ${JSON.stringify(result)}`, 'info');
        } catch (e) {
            addLog(`Invalid JSON response: ${raw}`, 'error');
            throw new Error('پاسخ نامعتبر از سرور');
        }
        
        if (!result.token) {
            addLog('No token in response', 'error');
            throw new Error('توکن دریافت نشد');
        }
        
        await chrome.storage.sync.set({ 
            authToken: result.token, 
            authUser: { username: result.username, role: result.role } 
        });
        
        addLog(`Login successful for ${result.username} (${result.role})`, 'success');
        if (loginStatus) {
            loginStatus.textContent = '✅ ورود موفق';
            loginStatus.style.color = 'var(--success-color)';
        }
        if (loginPassword) loginPassword.value = '';
        
        setTimeout(() => {
            showMainInterface();
            fetchFunds();
            loadPersistedLogs();
            addLog('ورود موفق. در حال بارگذاری...');
        }, 1000);
        
    } catch (e) {
        if (loginStatus) {
            loginStatus.textContent = '❌ ورود ناموفق';
            loginStatus.style.color = 'var(--error-color)';
        }
        addLog(`Login error: ${e.message}`, 'error');
        
        // Show desktop notification for login failure
        await showDesktopNotification({
            id: `login_failed_${Date.now()}`,
            title: '❌ خطا در ورود',
            message: 'ورود ناموفق بود. لطفاً مجدداً تلاش کنید.',
            priority: 1,
            requireInteraction: false
        });
    }
}

async function logout() {
    await chrome.storage.sync.remove(['authToken', 'authUser']);
    await chrome.storage.local.remove('lastAuthCheck');
    showLoginScreen();
    addLog('خروج انجام شد.');
}

// Function to close all NAV assistant tabs
async function closeNavAssistantTabs() {
    try {
        // Get bot-managed tabs
        const stored = await chrome.storage.local.get('botManagedTabs');
        const botManagedTabs = stored.botManagedTabs || [];
        
        if (botManagedTabs.length > 0) {
            // Close only bot-managed tabs
            await chrome.tabs.remove(botManagedTabs);
            
            // Clear the list
            await chrome.storage.local.set({ botManagedTabs: [] });
            
            addLog(`${botManagedTabs.length} تب مدیریت شده توسط ربات بسته شد.`, 'info');
        } else {
            addLog('هیچ تب مدیریت شده‌ای یافت نشد.', 'info');
        }
    } catch (error) {
        addLog(`خطا در بستن تب‌ها: ${error.message}`, 'error');
    }
}

// --- توابع اصلی ---
async function fetchFunds() {
    try {
        const stored = await chrome.storage.sync.get(['authToken', 'authUser']);
        const token = stored.authToken || '';
        const user = stored.authUser;
        
        addLog(`Fetching funds for user: ${user?.username || 'anonymous'}`);
        
        let response;
        if (token && user) {
            // Try with authentication first
            response = await fetch(`${API_BASE_URL}/funds`, { 
                headers: { 'token': token } 
            });
            addLog(`Authenticated request status: ${response.status}`);
        }
        
        if (!response || !response.ok) {
            // Fallback to public endpoint
            addLog('Falling back to public endpoint');
            response = await fetch(`${API_BASE_URL}/funds`);
        }
        
        const raw = await response.text();
        if (!response.ok) {
            addLog(`Server error: ${response.status} - ${raw}`, 'error');
            throw new Error(raw || 'Server connection failed');
        }
        
        let funds = [];
        try { 
            funds = raw ? JSON.parse(raw) : []; 
            addLog(`Received ${funds.length} funds`);
        } catch (e) { 
            addLog(`JSON parse error: ${e.message}`, 'error');
            throw new Error('Invalid JSON from /funds'); 
        }
        
        if (fundSelector) {
            fundSelector.innerHTML = '<option value="">-- انتخاب کنید --</option>';
            funds.forEach(fund => {
                const option = document.createElement('option');
                option.value = fund.name;
                option.textContent = `${fund.name} (${fund.type || 'unknown'})`;
                fundSelector.appendChild(option);
            });
        }
        
        if (!funds.length) {
            if (user) {
                updateStatus('هیچ صندوقی به شما اختصاص داده نشده. با ادمین تماس بگیرید.', 'neutral');
            } else {
                updateStatus('هیچ صندوقی یافت نشد. از پنل ادمین صندوق اضافه کنید.', 'neutral');
            }
        } else {
            updateStatus(`${funds.length} صندوق یافت شد.`, 'success');
        }
        
        chrome.storage.sync.get('activeFund', async (data) => {
            if (data.activeFund) {
                if (fundSelector) fundSelector.value = data.activeFund;
                
                // Get bot-managed tabs count
                const botStored = await chrome.storage.local.get('botManagedTabs');
                const botManagedTabs = botStored.botManagedTabs || [];
                
                updateStatus(`ربات برای صندوق ${data.activeFund} فعال است. (${botManagedTabs.length} تب مدیریت شده)`, 'success');
            } else {
                updateStatus('ربات خاموش است.', 'neutral');
            }
        });
    } catch (error) {
        addLog(`Funds fetch error: ${error.message}`, 'error');
        updateStatus(error.message, 'error');
    }
}

async function setActiveFund() {
    const selectedFund = fundSelector.value;
    if (!selectedFund) { 
        updateStatus('لطفاً یک صندوق را انتخاب کنید.', 'error'); 
        return; 
    }
    
    try {
        // Get fund configuration to open the correct URL
        const authStored = await chrome.storage.sync.get('authToken');
        const token = authStored.authToken || '';
        const response = await fetch(`${API_BASE_URL}/configurations/${selectedFund}`, {
            headers: { 'token': token }
        });
        
        if (!response.ok) {
            updateStatus('خطا در دریافت تنظیمات صندوق.', 'error');
            return;
        }
        
        const config = await response.json();
        const navUrl = config.fund_nav_page_url || config.nav_page_url;
        const expertUrl = config.fund_expert_page_url || config.expert_price_page_url;
        
        if (!navUrl) {
            updateStatus('URL صفحه NAV برای این صندوق تنظیم نشده.', 'error');
            return;
        }
        
        // Set active fund (do NOT clear local storage to preserve selected security)
        await new Promise(resolve => chrome.storage.sync.set({ activeFund: selectedFund }, resolve));
        await chrome.storage.local.set({ botActive: true });
        
        // Close existing bot-managed tabs first
        await closeNavAssistantTabs();
        
        // Open the NAV page
        const navTabResponse = await chrome.runtime.sendMessage({ 
            type: 'CREATE_TAB', 
            url: navUrl 
        });
        
        // Open the Expert page (inactive)
        let expertTabResponse = null;
        if (expertUrl) {
            expertTabResponse = await chrome.runtime.sendMessage({ 
                type: 'CREATE_TAB', 
                url: expertUrl,
                active: false
            });
        }

        if (navTabResponse && navTabResponse.ok && navTabResponse.tabId) {
            // Mark this tab as bot-managed
            const botStored = await chrome.storage.local.get('botManagedTabs');
            const botManagedTabs = botStored.botManagedTabs || [];
            botManagedTabs.push(navTabResponse.tabId);
            if (expertTabResponse && expertTabResponse.ok && expertTabResponse.tabId) {
                botManagedTabs.push(expertTabResponse.tabId);
            }
            
            // Ensure we don't exceed 2 tabs
            if (botManagedTabs.length > 2) {
                botManagedTabs.splice(0, botManagedTabs.length - 2);
            }
            
            const toStore = { botManagedTabs: botManagedTabs };
            toStore[`navTabId_${selectedFund}`] = navTabResponse.tabId;
            if (expertTabResponse && expertTabResponse.ok && expertTabResponse.tabId) {
                toStore[`expertTabId_${selectedFund}`] = expertTabResponse.tabId;
            }
            await chrome.storage.local.set(toStore);
            
            updateStatus(`ربات برای صندوق ${selectedFund} فعال شد. تب‌های NAV و Expert باز شدند.`, 'success');
            addLog(`NAV tab: ${navTabResponse.tabId}${expertTabResponse && expertTabResponse.tabId ? `, Expert tab: ${expertTabResponse.tabId}` : ''}`, 'success');
            
            // Wait for tabs to load and then initialize bot workflow
            setTimeout(async () => {
                try {
                    addLog('شروع پیکربندی اولیه تب‌ها...', 'info');
                    
                    // Send initialization message to NAV tab
                    await chrome.runtime.sendMessage({
                        type: 'SEND_MESSAGE_TO_TAB',
                        tabId: navTabResponse.tabId,
                        message: {
                            type: 'INITIALIZE_NAV_TAB',
                            fundName: selectedFund,
                            isMainTab: true
                        }
                    });
                    
                    // Send initialization message to Expert tab if exists
                    if (expertTabResponse && expertTabResponse.tabId) {
                        await chrome.runtime.sendMessage({
                            type: 'SEND_MESSAGE_TO_TAB',
                            tabId: expertTabResponse.tabId,
                            message: {
                                type: 'INITIALIZE_EXPERT_TAB',
                                fundName: selectedFund,
                                isMainTab: false
                            }
                        });
                    }
                    
                    addLog('پیکربندی اولیه تب‌ها کامل شد', 'success');
                } catch (error) {
                    addLog(`خطا در پیکربندی تب‌ها: ${error.message}`, 'error');
                }
            }, 3000); // Wait 3 seconds for tabs to load
            
            // Show desktop notification for successful activation
            await showDesktopNotification({
                id: `bot_activated_${selectedFund}_${Date.now()}`,
                title: '✅ ربات فعال شد',
                message: `نظارت صندوق ${selectedFund} شروع شد`,
                priority: 1,
                requireInteraction: false,
                silent: true
            });
        } else {
            throw new Error('خطا در باز کردن تب جدید');
        }
        
    } catch (error) {
        updateStatus(`خطا در فعال‌سازی صندوق: ${error.message}`, 'error');
        addLog(`خطا در فعال‌سازی صندوق: ${error.message}`, 'error');
    }
}

async function stopBot() {
    try {
        // Remove active fund and deactivate bot
        await new Promise(resolve => chrome.storage.sync.remove('activeFund', resolve));
        await chrome.storage.local.set({ botActive: false });
        fundSelector.value = '';
        
        // Close NAV assistant tabs
        await closeNavAssistantTabs();
        
        // Clear pending bot tab
        await chrome.storage.local.remove('pendingBotTab');
        
        updateStatus('ربات با موفقیت خاموش شد و تب‌های مدیریت شده بسته شد.', 'neutral');
        addLog('ربات خاموش شد و تب‌های مدیریت شده بسته شد.', 'info');
        
        // Show desktop notification for bot stop
        await showDesktopNotification({
            id: `bot_stopped_${Date.now()}`,
            title: '⏹️ ربات خاموش شد',
            message: 'نظارت صندوق متوقف شد',
            priority: 0,
            requireInteraction: false,
            silent: true
        });
        
    } catch (error) {
        updateStatus(`خطا در خاموش کردن ربات: ${error.message}`, 'error');
        addLog(`خطا در خاموش کردن ربات: ${error.message}`, 'error');
    }
}

async function resetFund() {
    const { activeFund } = await new Promise(resolve => chrome.storage.sync.get('activeFund', resolve));
    if (!activeFund) { 
        updateStatus('ابتدا یک صندوق را فعال کنید.', 'error'); 
        return; 
    }
    
    try {
        const authStored = await chrome.storage.sync.get('authToken');
        const token = authStored.authToken || '';
        const response = await fetch(`${API_BASE_URL}/configurations/${activeFund}`, {
            headers: { 'token': token }
        });
        
        if (!response.ok) throw new Error('Could not get config for reset.');
        
        const config = await response.json();
        const expertUrl = config.fund_expert_page_url || config.expert_price_page_url;
        
        if (!expertUrl) { 
            updateStatus('URL صفحه قیمت کارشناسی ثبت نشده.', 'error'); 
            return; 
        }
        
        // Clear Expert page selections for fresh start
        await chrome.storage.local.remove([
            `selectedSecurity_${activeFund}`,
            `selectedSecurityName_${activeFund}`,
            `sellableQuantity_${activeFund}`,
            `expertPrice_${activeFund}`,
            `rowNumber_${activeFund}`,
            `expertSearchClicked`,
            `searchClickedTime`,
            `needsExpertData_${activeFund}`
        ]);
        
        addLog('🔄 Expert selections cleared for fresh start', 'info');
        
        // Close existing bot-managed tabs first
        await closeNavAssistantTabs();
        
        // Open expert page in new tab using background script
        const tabResponse = await chrome.runtime.sendMessage({ 
            type: 'CREATE_TAB', 
            url: expertUrl 
        });
        
        if (tabResponse && tabResponse.ok && tabResponse.tabId) {
            // Mark this tab as bot-managed
            const botStored = await chrome.storage.local.get('botManagedTabs');
            const botManagedTabs = botStored.botManagedTabs || [];
            botManagedTabs.push(tabResponse.tabId);
            
            // Ensure we don't exceed 2 tabs
            if (botManagedTabs.length > 2) {
                botManagedTabs.splice(0, botManagedTabs.length - 2);
            }
            
            await chrome.storage.local.set({ botManagedTabs: botManagedTabs });
            
            updateStatus(`تنظیمات صندوق ${activeFund} ریست شد و صفحه قیمت کارشناسی باز شد.`, 'success');
            addLog(`ریست صندوق ${activeFund}. صفحه قیمت کارشناسی باز شد. (تب ${tabResponse.tabId})`, 'success');
        } else {
            throw new Error('خطا در باز کردن تب جدید');
        }
        
    } catch (error) { 
        updateStatus(error.message, 'error');
        addLog(`خطا در ریست صندوق: ${error.message}`, 'error');
    }
}

function updateStatus(message, type) {
    if (!statusDiv) return;
    const colors = { error: 'var(--error-color)', success: 'var(--success-color)', neutral: 'var(--secondary-color)' };
    const bgColors = { error: '#f8d7da', success: '#d4edda', neutral: '#e2e3e5' };
    statusDiv.textContent = message;
    statusDiv.style.color = colors[type] || 'black';
    statusDiv.style.backgroundColor = bgColors[type] || 'transparent';
}

// --- توابع مدیریت اطلاعات اوراق ---
async function loadSecurityInfo() {
    try {
        const { activeFund } = await new Promise(resolve => chrome.storage.sync.get('activeFund', resolve));
        if (!activeFund) {
            hideSecurityInfo();
            hideCurrentSecurityInfo();
            return;
        }

        const stored = await chrome.storage.local.get([
            `selectedSecurityName_${activeFund}`,
            `sellableQuantity_${activeFund}`,
            `expertPrice_${activeFund}`,
            `rowNumber_${activeFund}`
        ]);

        const securityName = stored[`selectedSecurityName_${activeFund}`];
        const sellableQty = stored[`sellableQuantity_${activeFund}`];
        const expertPriceValue = stored[`expertPrice_${activeFund}`];
        const rowNumber = stored[`rowNumber_${activeFund}`];

        if (securityName) {
            showSecurityInfo(securityName, sellableQty, expertPriceValue, rowNumber);
            showCurrentSecurityInfo(securityName, sellableQty, expertPriceValue, rowNumber);
        } else {
            hideSecurityInfo();
            hideCurrentSecurityInfo();
        }
    } catch (error) {
        addLog(`خطا در بارگذاری اطلاعات اوراق: ${error.message}`, 'error');
        hideSecurityInfo();
        hideCurrentSecurityInfo();
    }
}

function showSecurityInfo(securityName, sellableQty, expertPriceValue, rowNumber) {
    if (!securityInfoContainer || !selectedSecurityName || !sellableQuantity || !expertPrice) return;

    selectedSecurityName.textContent = securityName || '-';
    sellableQuantity.textContent = (sellableQty !== undefined && sellableQty !== null) ? sellableQty.toLocaleString() : '-';
    expertPrice.textContent = (expertPriceValue !== undefined && expertPriceValue !== null) ? expertPriceValue.toLocaleString() : '-';
    if (selectedRowNumber) {
        selectedRowNumber.textContent = rowNumber || '-';
    }

    securityInfoContainer.style.display = 'block';
}

function hideSecurityInfo() {
    if (securityInfoContainer) {
        securityInfoContainer.style.display = 'none';
    }
}

// توابع مدیریت اطلاعات اوراق فعلی (بالای لاگ‌ها)
function showCurrentSecurityInfo(securityName, sellableQty, expertPriceValue, rowNumber) {
    if (!currentSecurityInfoContainer || !currentSecurityName || !currentSellableQuantity || !currentExpertPrice) return;

    currentSecurityName.textContent = securityName || '-';
    currentSellableQuantity.textContent = (sellableQty !== undefined && sellableQty !== null) ? sellableQty.toLocaleString() : '-';
    currentExpertPrice.textContent = (expertPriceValue !== undefined && expertPriceValue !== null) ? expertPriceValue.toLocaleString() : '-';
    if (currentRowNumber) {
        currentRowNumber.textContent = rowNumber || '-';
    }

    currentSecurityInfoContainer.style.display = 'block';
}

function hideCurrentSecurityInfo() {
    if (currentSecurityInfoContainer) {
        currentSecurityInfoContainer.style.display = 'none';
    }
}

async function refreshSecurityData() {
    try {
        const { activeFund } = await new Promise(resolve => chrome.storage.sync.get('activeFund', resolve));
        if (!activeFund) {
            addLog('ابتدا یک صندوق را فعال کنید.', 'error');
            return;
        }

        addLog('در حال بروزرسانی اطلاعات اوراق...', 'info');

        // Get expert tab ID
        const stored = await chrome.storage.local.get(`expertTabId_${activeFund}`);
        const expertTabId = stored[`expertTabId_${activeFund}`];

        if (!expertTabId) {
            addLog('تب Expert یافت نشد. ابتدا صندوق را فعال کنید.', 'error');
            return;
        }

        // Send message to expert tab to refresh data
        const response = await chrome.runtime.sendMessage({
            type: 'SEND_MESSAGE_TO_TAB',
            tabId: expertTabId,
            message: {
                type: 'REFRESH_SECURITY_DATA',
                fundName: activeFund
            }
        });

        if (response && response.ok && response.data) {
            const { securityName, sellableQuantity, expertPrice, rowNumber } = response.data;
            showSecurityInfo(securityName, sellableQuantity, expertPrice, rowNumber);
            showCurrentSecurityInfo(securityName, sellableQuantity, expertPrice, rowNumber);
            addLog(`اطلاعات بروزرسانی شد: ${securityName} (ردیف ${rowNumber})`, 'success');
        } else {
            addLog('خطا در بروزرسانی اطلاعات', 'error');
        }

    } catch (error) {
        addLog(`خطا در بروزرسانی اطلاعات: ${error.message}`, 'error');
    }
}

async function testSelectors() {
    try {
        const { activeFund } = await new Promise(resolve => chrome.storage.sync.get('activeFund', resolve));
        if (!activeFund) {
            addLog('ابتدا یک صندوق را فعال کنید.', 'error');
            return;
        }

        addLog('در حال تست سلکتورها...', 'info');

        // Get expert tab ID
        const stored = await chrome.storage.local.get(`expertTabId_${activeFund}`);
        const expertTabId = stored[`expertTabId_${activeFund}`];

        if (!expertTabId) {
            addLog('تب Expert یافت نشد. ابتدا صندوق را فعال کنید.', 'error');
            return;
        }

        // Send message to expert tab to test selectors
        const response = await chrome.runtime.sendMessage({
            type: 'SEND_MESSAGE_TO_TAB',
            tabId: expertTabId,
            message: {
                type: 'TEST_SELECTORS',
                fundName: activeFund
            }
        });

        if (response && response.ok && response.data) {
            const { sellable_quantity, expert_price } = response.data;
            addLog(`نتایج تست سلکتورها:`, 'info');
            addLog(`  مانده قابل فروش: ${sellable_quantity.count} عنصر یافت شد`, 'info');
            addLog(`  قیمت کارشناسی: ${expert_price.count} عنصر یافت شد`, 'info');
            
            if (sellable_quantity.sampleValues.length > 0) {
                addLog(`  نمونه مقادیر مانده: ${sellable_quantity.sampleValues.map(v => `${v.text}(${v.number})`).join(', ')}`, 'info');
            }
            if (expert_price.sampleValues.length > 0) {
                addLog(`  نمونه مقادیر قیمت: ${expert_price.sampleValues.map(v => `${v.text}(${v.number})`).join(', ')}`, 'info');
            }
        } else {
            addLog(`خطا در تست سلکتورها: ${response?.error || 'پاسخ نامعتبر از سرور'}`, 'error');
        }

    } catch (error) {
        addLog(`خطا در تست سلکتورها: ${error.message}`, 'error');
    }
}

// Test bot functionality
async function testBot() {
    addLog('🚀 شروع تست کامل ربات...', 'info');
    
    try {
        // Check if user is authenticated
        const { authToken, activeFund } = await new Promise(resolve => 
            chrome.storage.sync.get(['authToken', 'activeFund'], resolve)
        );
        
        if (!authToken) {
            addLog('❌ ابتدا وارد شوید', 'error');
            return;
        }
        
        if (!activeFund) {
            addLog('❌ ابتدا یک صندوق را فعال کنید', 'error');
            return;
        }
        
        addLog(`✅ احراز هویت موفق - صندوق فعال: ${activeFund}`, 'success');
        
        // Test 1: Check API connection
        addLog('تست 1: بررسی اتصال به API...', 'info');
        try {
            const response = await fetch(`${API_BASE_URL}/configurations/${activeFund}`, {
                headers: { 'token': authToken }
            });
            
            if (response.ok) {
                const config = await response.json();
                addLog(`✅ اتصال API موفق - تنظیمات دریافت شد`, 'success');
                addLog(`📊 URL NAV: ${config.nav_page_url ? '✅' : '❌'}`, 'info');
                addLog(`📊 URL Expert: ${config.expert_price_page_url ? '✅' : '❌'}`, 'info');
            } else {
                addLog(`❌ خطای API: ${response.status}`, 'error');
                return;
            }
        } catch (error) {
            addLog(`❌ خطای اتصال API: ${error.message}`, 'error');
            return;
        }
        
        // Test 2: Check active tabs
        addLog('تست 2: بررسی تب‌های فعال...', 'info');
        try {
            const response = await chrome.runtime.sendMessage({ action: 'GET_ACTIVE_TAB' });
            if (response && response.tab) {
                addLog(`✅ تب فعال: ${response.tab.title}`, 'success');
                addLog(`📊 URL: ${response.tab.url}`, 'info');
            } else {
                addLog('❌ تب فعال یافت نشد', 'error');
            }
        } catch (error) {
            addLog(`❌ خطای بررسی تب: ${error.message}`, 'error');
        }
        
        // Test 3: Send test data to server
        addLog('تست 3: ارسال داده تست به سرور...', 'info');
        try {
            const testData = {
                fund_name: activeFund,
                nav_on_page: 1000.50,
                total_units: 1000000,
                sellable_quantity: 500000,
                expert_price: 1005.25,
                board_price: 1002.75
            };
            
            const response = await fetch(`${API_BASE_URL}/check-nav`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'token': authToken
                },
                body: JSON.stringify(testData)
            });
            
            if (response.ok) {
                const result = await response.json();
                addLog(`✅ داده تست ارسال شد`, 'success');
                addLog(`📊 نتیجه: ${result.status}`, 'info');
                if (result.adjustment_needed) {
                    addLog(`📊 قیمت پیشنهادی: ${result.suggested_price}`, 'info');
                }
            } else {
                addLog(`❌ خطای ارسال داده: ${response.status}`, 'error');
            }
        } catch (error) {
            addLog(`❌ خطای ارسال داده: ${error.message}`, 'error');
        }
        
        // Test 4: Check content script communication
        addLog('تست 4: بررسی ارتباط با Content Script...', 'info');
        try {
            const response = await chrome.runtime.sendMessage({ action: 'GET_ACTIVE_TAB' });
            if (response && response.tab) {
                const contentResponse = await chrome.tabs.sendMessage(response.tab.id, { 
                    action: 'TEST_COMMUNICATION' 
                });
                
                if (contentResponse) {
                    addLog(`✅ ارتباط با Content Script موفق`, 'success');
                    addLog(`📊 پاسخ: ${contentResponse.message}`, 'info');
                } else {
                    addLog('❌ Content Script پاسخ نداد', 'error');
                }
            }
        } catch (error) {
            addLog(`❌ خطای ارتباط با Content Script: ${error.message}`, 'error');
        }
        
        addLog('🎉 تست کامل ربات تمام شد!', 'success');
        
    } catch (error) {
        addLog(`❌ خطای کلی در تست ربات: ${error.message}`, 'error');
    }
}

async function testNotifications() {
    addLog('🧪 شروع تست نوتیفیکیشن‌های دسکتاپ...', 'info');
    
    try {
        // Check if notifications are supported
        if (!chrome.notifications) {
            addLog('❌ Notifications API غیر قابل دسترس', 'error');
            return;
        }
        
        // Check notification permission
        const permission = await chrome.notifications.getPermissionLevel();
        addLog(`📋 سطح مجوز فعلی: ${permission}`, 'info');
        
        if (permission === 'denied') {
            addLog('❌ مجوز نوتیفیکیشن رد شده - لطفاً در تنظیمات Chrome فعال کنید', 'error');
            return;
        }
        
        // Test 1: Basic notification
        addLog('تست 1: نوتیفیکیشن ساده', 'info');
        const result1 = await showDesktopNotification({
            id: 'test_basic',
            title: '🧪 تست دستیار NAV',
            message: 'این یک پیام تست ساده است',
            priority: 1,
            requireInteraction: false
        });
        
        if (result1) {
            addLog(`✅ نوتیفیکیشن ساده ایجاد شد: ${result1}`, 'success');
        } else {
            addLog('❌ نوتیفیکیشن ساده شکست خورد', 'error');
        }
        
        // Test 2: Adjustment notification with buttons (after 2 seconds)
        setTimeout(async () => {
            addLog('تست 2: نوتیفیکیشن تعدیل با دکمه‌ها', 'info');
            const result2 = await showDesktopNotification({
                id: 'test_adjustment',
                title: '🚨 تست تعدیل NAV',
                message: 'صندوق تست: قیمت پیشنهادی 1250.75',
                priority: 2,
                requireInteraction: true,
                buttons: [
                    { text: 'تعدیل زدم، دوباره چک کن' },
                    { text: 'بستن' }
                ]
            });
            
            if (result2) {
                addLog(`✅ نوتیفیکیشن تعدیل ایجاد شد: ${result2}`, 'success');
            } else {
                addLog('❌ نوتیفیکیشن تعدیل شکست خورد', 'error');
            }
        }, 2000);
        
        // Test 3: Stale NAV notification (after 4 seconds)
        setTimeout(async () => {
            addLog('تست 3: نوتیفیکیشن تاخیر NAV', 'info');
            await showDesktopNotification({
                id: 'test_stale',
                title: '⏰ تست تاخیر NAV',
                message: 'صندوق تست: آخرین بروزرسانی 5 دقیقه پیش',
                priority: 1,
                requireInteraction: false,
                buttons: [
                    { text: 'رفرش صفحه' },
                    { text: 'بستن' }
                ]
            });
        }, 4000);
        
        // Test 4: Silent notification (after 6 seconds)
        setTimeout(async () => {
            addLog('تست 4: نوتیفیکیشن بی‌صدا', 'info');
            await showDesktopNotification({
                id: 'test_silent',
                title: '🔇 تست بی‌صدا',
                message: 'این نوتیفیکیشن صدا ندارد',
                priority: 0,
                requireInteraction: false,
                silent: true
            });
        }, 6000);
        
        addLog('✅ همه تست‌ها در صف قرار گرفتند! نوتیفیکیشن‌ها را در دسکتاپ چک کنید.', 'success');
        
    } catch (error) {
        addLog(`خطا در تست نوتیفیکیشن‌ها: ${error.message}`, 'error');
    }
}

// --- DOM Initialization ---
function initializeDOMElements() {
    fundSelector = document.getElementById('fundSelector');
    statusDiv = document.getElementById('status');
    startBtn = document.getElementById('setActiveFundBtn');
    stopBtn = document.getElementById('stopBotBtn');
    resetBtn = document.getElementById('resetFundBtn');
    logBox = document.getElementById('log-box');
    clearLogBtn = document.getElementById('clearLogBtn');
    confirmAdjustedBtn = document.getElementById('confirmAdjustedBtn');
    showLastNotifBtn = document.getElementById('showLastNotifBtn');
    adjustmentStatus = document.getElementById('adjustmentStatus');
    logoutBtn = document.getElementById('logoutBtn');
    closeTabsBtn = document.getElementById('closeTabsBtn');
    
    // Security info elements
    securityInfoContainer = document.getElementById('securityInfoContainer');
    selectedSecurityName = document.getElementById('selectedSecurityName');
    sellableQuantity = document.getElementById('sellableQuantity');
    expertPrice = document.getElementById('expertPrice');
    selectedRowNumber = document.getElementById('selectedRowNumber');
    refreshSecurityDataBtn = document.getElementById('refreshSecurityDataBtn');
    testSelectorsBtn = document.getElementById('testSelectorsBtn');
    testNotificationBtn = document.getElementById('testNotificationBtn');
    
    // Current security info elements (above logs)
    currentSecurityInfoContainer = document.getElementById('currentSecurityInfoContainer');
    currentSecurityName = document.getElementById('currentSecurityName');
    currentSellableQuantity = document.getElementById('currentSellableQuantity');
    currentExpertPrice = document.getElementById('currentExpertPrice');
    currentRowNumber = document.getElementById('currentRowNumber');
    
    // Test selector elements
    testNavPageBtn = document.getElementById('testNavPageBtn');
    testExpertPageBtn = document.getElementById('testExpertPageBtn');
    testSearchButtonBtn = document.getElementById('testSearchButtonBtn');
    testPageElementsBtn = document.getElementById('testPageElementsBtn');
    testTableDataBtn = document.getElementById('testTableDataBtn');
    testAllSelectorsBtn = document.getElementById('testAllSelectorsBtn');
    testResults = document.getElementById('testResults');
    
    // Login elements
    loginScreen = document.getElementById('loginScreen');
    mainInterface = document.getElementById('mainInterface');
    loginBtn = document.getElementById('loginBtn');
    loginUsername = document.getElementById('loginUsername');
    loginPassword = document.getElementById('loginPassword');
    loginStatus = document.getElementById('loginStatus');
}

// --- Event Listeners ---
async function loadPersistedLogs() {
    try {
        const stored = await new Promise(resolve => chrome.storage.local.get('nav_logs', resolve));
        const logs = Array.isArray(stored.nav_logs) ? stored.nav_logs : [];
        if (logBox) {
            logBox.innerHTML = '';
            logs.forEach(renderLogEntry);
            logBox.scrollTop = logBox.scrollHeight;
        }
    } catch {}
}

// گوش دادن به پیام‌های ارسالی از content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'LOG_MESSAGE') {
        addLog(request.payload.message, request.payload.type);
    } else if (request.type === 'OPEN_NEW_TAB') {
        chrome.tabs.create({ url: request.url, active: true });
    } else if (request.type === 'SECURITY_DATA_UPDATED') {
        // Handle security data update from content script
        const { securityName, sellableQuantity, expertPrice, rowNumber } = request.data;
        showSecurityInfo(securityName, sellableQuantity, expertPrice, rowNumber);
        showCurrentSecurityInfo(securityName, sellableQuantity, expertPrice, rowNumber);
        addLog(`اطلاعات اوراق بروزرسانی شد: ${securityName} (ردیف ${rowNumber})`, 'success');
    } else if (request.type === 'SELECTOR_TEST_RESULTS') {
        // Handle selector test results from content script
        const { sellable_quantity, expert_price } = request.data;
        addLog(`نتایج تست سلکتورها:`, 'info');
        addLog(`  مانده قابل فروش: ${sellable_quantity.count} عنصر یافت شد`, 'info');
        addLog(`  قیمت کارشناسی: ${expert_price.count} عنصر یافت شد`, 'info');
        
        if (sellable_quantity.sampleValues.length > 0) {
            addLog(`  نمونه مقادیر مانده: ${sellable_quantity.sampleValues.map(v => `${v.text}(${v.number})`).join(', ')}`, 'info');
        }
        if (expert_price.sampleValues.length > 0) {
            addLog(`  نمونه مقادیر قیمت: ${expert_price.sampleValues.map(v => `${v.text}(${v.number})`).join(', ')}`, 'info');
        }
    }
});

// --- Test Functions ---
function updateTestResults(result) {
    if (testResults) {
        testResults.textContent = result;
        testResults.scrollTop = testResults.scrollHeight;
    }
}

function appendTestResults(result) {
    if (testResults) {
        testResults.textContent += result;
        testResults.scrollTop = testResults.scrollHeight;
    }
}

function smartUpdateTestResults(result) {
    // If this is part of testAllSelectors, append. Otherwise, replace.
    if (testResults && testResults.textContent.includes('تست همه سلکتورها')) {
        appendTestResults(result);
    } else {
        updateTestResults(result);
    }
}

async function testPageType(pageType) {
    smartUpdateTestResults(`🔍 تست ${pageType} شروع شد...\n`);
    
    try {
        // Get current active tab
        const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
        if (!tabs || tabs.length === 0) {
            smartUpdateTestResults('❌ تب فعالی یافت نشد');
            return;
        }
        
        const tabId = tabs[0].id;
        const url = tabs[0].url;
        
        smartUpdateTestResults(`📄 URL فعلی: ${url}\n`);
        
        // Execute test script in the active tab
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: function(pageType) {
                const currentUrl = window.location.href.toLowerCase();
                
                // Check page type
                const isNavPage = currentUrl.includes('fund.do') || currentUrl.includes('navlist');
                const isExpertPage = currentUrl.includes('adjustedip') || currentUrl.includes('expert');
                
                let result = `🌐 صفحه ${pageType} - تحلیل URL:\n`;
                result += `URL: ${window.location.href}\n`;
                result += `NAV صفحه: ${isNavPage ? '✅' : '❌'}\n`;
                result += `Expert صفحه: ${isExpertPage ? '✅' : '❌'}\n\n`;
                
                if (pageType === 'NAV' && isNavPage) {
                    result += `📊 آنالیز صفحه NAV:\n`;
                    
                    // Find forms
                    const forms = document.querySelectorAll('form');
                    result += `تعداد فرم‌ها: ${forms.length}\n`;
                    
                    // Find tables
                    const tables = document.querySelectorAll('table');
                    result += `تعداد جداول: ${tables.length}\n`;
                    
                    // Find select elements for increasing rows
                    const selects = document.querySelectorAll('select');
                    result += `تعداد dropdown ها: ${selects.length}\n`;
                    
                    selects.forEach((select, i) => {
                        const options = select.querySelectorAll('option');
                        result += `  Dropdown ${i+1}: ${options.length} گزینه\n`;
                        if (options.length > 1) {
                            result += `    Options: ${Array.from(options).map(opt => opt.text || opt.value).join(', ')}\n`;
                        }
                    });
                    
                } else if (pageType === 'Expert' && isExpertPage) {
                    result += `🔍 آنالیز صفحه Expert:\n`;
                    
                    // Find forms
                    const forms = document.querySelectorAll('form');
                    result += `تعداد فرم‌ها: ${forms.length}\n`;
                    
                    // Find input fields
                    const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
                    result += `تعداد فیلدهای متنی: ${inputs.length}\n`;
                    
                    // Find dropdown for securities
                    const selects = document.querySelectorAll('select');
                    result += `تعداد dropdown ها: ${selects.length}\n`;
                    
                    selects.forEach((select, i) => {
                        const options = select.querySelectorAll('option');
                        result += `  Dropdown ${i+1}: ${options.length} گزینه\n`;
                    });
                    
                } else {
                    result += `⚠️ صفحه مطابق نیست. انتظار ${pageType} صفحه بود.\n`;
                }
                
                return result;
            },
            args: [pageType]
        });
        
        if (results && results[0] && results[0].result) {
            smartUpdateTestResults(results[0].result);
        } else {
            smartUpdateTestResults('❌ خطا در اجرای تست');
        }
        
    } catch (error) {
        smartUpdateTestResults(`❌ خطا: ${error.message}`);
    }
}

async function testSearchButton() {
    smartUpdateTestResults('🔎 تست دکمه جستجو شروع شد...\n');
    
    try {
        const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
        if (!tabs || tabs.length === 0) {
            smartUpdateTestResults('❌ تب فعالی یافت نشد');
            return;
        }
        
        const tabId = tabs[0].id;
        
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: function() {
                let result = '🔍 جستجوی دکمه‌های submit:\n\n';
                
                // Find all submit buttons
                const submitButtons = document.querySelectorAll('input[type="submit"]');
                result += `تعداد دکمه‌های submit: ${submitButtons.length}\n`;
                
                submitButtons.forEach((btn, i) => {
                    const value = btn.value || '';
                    const id = btn.id || '';
                    const className = btn.className || '';
                    const form = btn.closest('form');
                    
                    result += `\n${i+1}. VALUE="${value}"\n`;
                    result += `   ID="${id}"\n`;
                    result += `   CLASS="${className}"\n`;
                    result += `   در فرم: ${form ? 'بله' : 'خیر'}\n`;
                    
                    if (form) {
                        const formAction = form.action || '';
                        const formMethod = form.method || '';
                        result += `   Form action: ${formAction}\n`;
                        result += `   Form method: ${formMethod}\n`;
                    }
                });
                
                // Test finding search button
                result += '\n🎯 تست پیدا کردن دکمه جستجو:\n';
                
                let searchButton = document.querySelector('input[type="submit"][value*="جستجو"]');
                if (!searchButton) {
                    searchButton = document.querySelector('input[type="submit"]');
                }
                
                if (searchButton) {
                    result += `✅ دکمه پیدا شد: "${searchButton.value}"\n`;
                    result += `ID: ${searchButton.id}\n`;
                    result += `Class: ${searchButton.className}\n`;
                    
                    // Test click functionality
                    result += '\n⚡ تست کلیک:\n';
                    try {
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        
                        const clickSuccess = searchButton.dispatchEvent(clickEvent);
                        result += `Click event: ${clickSuccess ? 'موفق' : 'ناموفق'}\n`;
                        
                        // Check if in form
                        const form = searchButton.closest('form');
                        if (form) {
                            result += `Form submit test: آماده برای submit\n`;
                        }
                        
                    } catch (e) {
                        result += `❌ خطای کلیک: ${e.message}\n`;
                    }
                    
                } else {
                    result += '❌ هیچ دکمه جستجویی پیدا نشد\n';
                    
                    // Show all clickable elements
                    const clickables = document.querySelectorAll('button, input[type="button"], input[type="submit"], a[onclick]');
                    result += `\nتمام المنت‌های کلیک‌پذیر (${clickables.length}):\n`;
                    
                    clickables.forEach((el, i) => {
                        const text = el.innerText || el.value || el.textContent || '';
                        const tag = el.tagName.toLowerCase();
                        const type = el.type || '';
                        result += `${i+1}. ${tag}${type ? `[${type}]` : ''}: "${text.trim()}"\n`;
                    });
                }
                
                return result;
            }
        });
        
        if (results && results[0] && results[0].result) {
            smartUpdateTestResults(results[0].result);
        } else {
            smartUpdateTestResults('❌ خطا در اجرای تست');
        }
        
    } catch (error) {
        smartUpdateTestResults(`❌ خطا: ${error.message}`);
    }
}

async function testPageElements() {
    smartUpdateTestResults('📋 تست المنت‌های صفحه شروع شد...\n');
    
    try {
        const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
        if (!tabs || tabs.length === 0) {
            smartUpdateTestResults('❌ تب فعالی یافت نشد');
            return;
        }
        
        const tabId = tabs[0].id;
        
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: function() {
                let result = '📋 آنالیز المنت‌های صفحه:\n\n';
                
                // Basic page info
                result += `📄 عنوان صفحه: ${document.title}\n`;
                result += `🌐 URL: ${window.location.href}\n\n`;
                
                // Forms
                const forms = document.querySelectorAll('form');
                result += `📝 فرم‌ها (${forms.length}):\n`;
                forms.forEach((form, i) => {
                    result += `  ${i+1}. Action: ${form.action || 'ندارد'}\n`;
                    result += `     Method: ${form.method || 'GET'}\n`;
                    result += `     Elements: ${form.elements.length}\n`;
                });
                result += '\n';
                
                // Tables
                const tables = document.querySelectorAll('table');
                result += `📊 جداول (${tables.length}):\n`;
                tables.forEach((table, i) => {
                    const rows = table.querySelectorAll('tr');
                    const headers = table.querySelectorAll('th');
                    result += `  ${i+1}. ردیف‌ها: ${rows.length}, سرفصل‌ها: ${headers.length}\n`;
                });
                result += '\n';
                
                // Select dropdowns
                const selects = document.querySelectorAll('select');
                result += `🔽 Dropdown ها (${selects.length}):\n`;
                selects.forEach((select, i) => {
                    const options = select.querySelectorAll('option');
                    result += `  ${i+1}. ID: ${select.id || 'ندارد'}\n`;
                    result += `     Name: ${select.name || 'ندارد'}\n`;
                    result += `     گزینه‌ها: ${options.length}\n`;
                    if (options.length <= 10) {
                        result += `     Values: ${Array.from(options).map(opt => opt.value || opt.text).join(', ')}\n`;
                    }
                });
                result += '\n';
                
                // Input fields
                const inputs = document.querySelectorAll('input');
                result += `🎛️ فیلدهای ورودی (${inputs.length}):\n`;
                const inputTypes = {};
                inputs.forEach(input => {
                    const type = input.type || 'text';
                    inputTypes[type] = (inputTypes[type] || 0) + 1;
                });
                Object.entries(inputTypes).forEach(([type, count]) => {
                    result += `  ${type}: ${count}\n`;
                });
                
                return result;
            }
        });
        
        if (results && results[0] && results[0].result) {
            smartUpdateTestResults(results[0].result);
        } else {
            smartUpdateTestResults('❌ خطا در اجرای تست');
        }
        
    } catch (error) {
        smartUpdateTestResults(`❌ خطا: ${error.message}`);
    }
}

async function testTableData() {
    smartUpdateTestResults('📊 تست دیتای جدول شروع شد...\n');
    
    try {
        const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
        if (!tabs || tabs.length === 0) {
            smartUpdateTestResults('❌ تب فعالی یافت نشد');
            return;
        }
        
        const tabId = tabs[0].id;
        
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: function() {
                let result = '📊 آنالیز دیتای جداول:\n\n';
                
                const tables = document.querySelectorAll('table');
                
                if (tables.length === 0) {
                    result += '❌ هیچ جدولی پیدا نشد\n';
                    return result;
                }
                
                tables.forEach((table, tableIndex) => {
                    result += `📋 جدول ${tableIndex + 1}:\n`;
                    
                    const headers = table.querySelectorAll('th');
                    const rows = table.querySelectorAll('tr');
                    
                    result += `  سرفصل‌ها (${headers.length}): `;
                    if (headers.length > 0) {
                        result += Array.from(headers).map(th => th.textContent.trim()).join(' | ');
                    } else {
                        result += 'ندارد';
                    }
                    result += '\n';
                    
                    result += `  تعداد ردیف‌ها: ${rows.length}\n`;
                    
                    // Show first few data rows
                    const dataRows = Array.from(rows).filter(row => !row.querySelector('th'));
                    result += `  ردیف‌های دیتا: ${dataRows.length}\n`;
                    
                    if (dataRows.length > 0) {
                        result += '  نمونه دیتا (5 ردیف اول):\n';
                        dataRows.slice(0, 5).forEach((row, i) => {
                            const cells = row.querySelectorAll('td');
                            const cellData = Array.from(cells).map(cell => cell.textContent.trim()).join(' | ');
                            result += `    ${i+1}: ${cellData.substring(0, 100)}${cellData.length > 100 ? '...' : ''}\n`;
                        });
                    }
                    
                    result += '\n';
                });
                
                return result;
            }
        });
        
        if (results && results[0] && results[0].result) {
            smartUpdateTestResults(results[0].result);
        } else {
            smartUpdateTestResults('❌ خطا در اجرای تست');
        }
        
    } catch (error) {
        smartUpdateTestResults(`❌ خطا: ${error.message}`);
    }
}

async function testAllSelectors() {
    updateTestResults('🔍 تست همه سلکتورها شروع شد...\n\n');
    
    // Run all tests in sequence with append
    appendTestResults('==== تست صفحه NAV ====\n');
    await testPageType('NAV');
    
    appendTestResults('\n' + '='.repeat(50) + '\n');
    appendTestResults('==== تست دکمه جستجو ====\n');
    await testSearchButton();
    
    appendTestResults('\n' + '='.repeat(50) + '\n');
    appendTestResults('==== تست المنت‌های صفحه ====\n');
    await testPageElements();
    
    appendTestResults('\n' + '='.repeat(50) + '\n');
    appendTestResults('==== تست دیتای جدول ====\n');
    await testTableData();
    
    appendTestResults('\n✅ همه تست‌ها تمام شد!\n');
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize DOM elements first
    initializeDOMElements();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load logs first
    await loadPersistedLogs();
    
    // Then check auth (which will also load funds if authenticated)
    setTimeout(async () => {
        await checkAuth();
        await loadSecurityInfo(); // Load security info after auth check
    }, 100); // Small delay to ensure DOM is fully ready
});

function setupEventListeners() {
    // Login events
    if (loginBtn) {
        loginBtn.addEventListener('click', login);
    }
    if (loginPassword) {
        loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });
    }

    // Main interface events
    if (startBtn) startBtn.addEventListener('click', setActiveFund);
    if (stopBtn) stopBtn.addEventListener('click', stopBot);
    if (resetBtn) resetBtn.addEventListener('click', resetFund);
    if (clearLogBtn) clearLogBtn.addEventListener('click', clearLogs);
    if (closeTabsBtn) closeTabsBtn.addEventListener('click', closeNavAssistantTabs);
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    
    // Security info events
    if (refreshSecurityDataBtn) refreshSecurityDataBtn.addEventListener('click', refreshSecurityData);
    if (testSelectorsBtn) testSelectorsBtn.addEventListener('click', testSelectors);
    
    // Test notification event
    if (testNotificationBtn) testNotificationBtn.addEventListener('click', testNotifications);
    
    // Test bot event
    if (testBotBtn) testBotBtn.addEventListener('click', testBot);
    
    // Test selector events
    if (testNavPageBtn) testNavPageBtn.addEventListener('click', () => testPageType('NAV'));
    if (testExpertPageBtn) testExpertPageBtn.addEventListener('click', () => testPageType('Expert'));
    if (testSearchButtonBtn) testSearchButtonBtn.addEventListener('click', testSearchButton);
    if (testPageElementsBtn) testPageElementsBtn.addEventListener('click', testPageElements);
    if (testTableDataBtn) testTableDataBtn.addEventListener('click', testTableData);
    if (testAllSelectorsBtn) testAllSelectorsBtn.addEventListener('click', testAllSelectors);
    
    // Adjustment events
    if (confirmAdjustedBtn) {
        confirmAdjustedBtn.addEventListener('click', async () => {
            try {
                const { activeFund } = await new Promise(resolve => chrome.storage.sync.get('activeFund', resolve));
                if (!activeFund) { addLog('ابتدا یک صندوق را فعال کنید.', 'error'); return; }
                const stored = await chrome.storage.sync.get('authToken');
                const token = stored.authToken || '';
                const headers = token ? { 'token': token } : {};
                const response = await fetch(`${API_BASE_URL}/configurations/${activeFund}`, {
                    headers: headers
                });
                if (!response.ok) throw new Error('Could not get config for recheck.');
                const config = await response.json();
                const dueAt = Date.now() + 2 * 60 * 1000; // 2 minutes later
                await new Promise(resolve => chrome.storage.local.set({ postAdjustmentActive: true, postAdjustmentCheckDueAt: dueAt }, resolve));
                await new Promise(resolve => chrome.storage.local.remove(['last_notification', 'needsExpertData', 'navSearchClicked'], resolve));
                if (adjustmentStatus) adjustmentStatus.textContent = '-';
                chrome.tabs.create({ url: config.nav_page_url, active: true });
                addLog('کاربر تایید کرد که تعدیل انجام شده. در حال چک مجدد...', 'success');
            } catch (e) {
                addLog(e.message || 'خطا در شروع بررسی مجدد.', 'error');
            }
        });
    }
    
    // Show notification events
    if (showLastNotifBtn) {
        showLastNotifBtn.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tabId = tabs[0]?.id;
                if (!tabId) return;
                chrome.storage.local.get('last_notification', (data) => {
                    if (!data.last_notification) { addLog('اعلان ذخیره‌شده‌ای وجود ندارد.'); return; }
                    chrome.scripting.executeScript({
                        target: { tabId },
                        func: (opts) => {
                            const ev = new CustomEvent('NAV_ASSISTANT_SHOW_NOTIFICATION', { detail: opts });
                            window.dispatchEvent(ev);
                        },
                        args: [data.last_notification]
                    });
                });
            });
        });
    }
}
