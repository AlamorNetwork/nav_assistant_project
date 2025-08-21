const API_BASE_URL = 'https://chabokan.irplatforme.ir';

// DOM elements - will be initialized after DOM loads
let fundSelector, statusDiv, startBtn, stopBtn, resetBtn, logBox, clearLogBtn;
let confirmAdjustedBtn, showLastNotifBtn, adjustmentStatus, logoutBtn, closeTabsBtn;
let loginScreen, mainInterface, loginBtn, loginUsername, loginPassword, loginStatus;

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
        await new Promise(resolve => chrome.storage.local.set({ nav_logs: [] }, resolve));
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
            // Network or transient error: keep user logged in
            addLog(`Token validation error (keeping session): ${e.message}`, 'warn');
            await chrome.storage.local.set({ lastAuthCheck: now });
            showMainInterface();
            await fetchFunds(); // Load funds data
            return true;
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
            
            updateStatus(`ربات برای صندوق ${selectedFund} فعال شد و صفحه NAV باز شد.`, 'success');
            addLog(`NAV tab: ${navTabResponse.tabId}${expertTabResponse && expertTabResponse.tabId ? `, Expert tab: ${expertTabResponse.tabId}` : ''}`, 'success');
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
        // Remove active fund
        await new Promise(resolve => chrome.storage.sync.remove('activeFund', resolve));
        fundSelector.value = '';
        
        // Close NAV assistant tabs
        await closeNavAssistantTabs();
        
        // Clear pending bot tab
        await chrome.storage.local.remove('pendingBotTab');
        
        updateStatus('ربات با موفقیت خاموش شد و تب‌های مدیریت شده بسته شد.', 'neutral');
        addLog('ربات خاموش شد و تب‌های مدیریت شده بسته شد.', 'info');
        
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
        
        // Do NOT clear local storage to preserve selected security and state
        
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
    }
});

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
}

// دکمه‌های وضعیت تعدیل
if (confirmAdjustedBtn) {
    confirmAdjustedBtn.addEventListener('click', async () => {
        try {
            const { activeFund } = await new Promise(resolve => chrome.storage.sync.get('activeFund', resolve));
            if (!activeFund) { addLog('ابتدا یک صندوق را فعال کنید.', 'error'); return; }
            const stored = await chrome.storage.sync.get('authToken');
            const token = stored.authToken || '';
            const response = await fetch(`${API_BASE_URL}/configurations/${activeFund}`, {
                headers: { 'token': token }
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
