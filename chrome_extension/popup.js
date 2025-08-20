const API_BASE_URL = 'https://respina.irplatforme.ir';
const fundSelector = document.getElementById('fundSelector');
const statusDiv = document.getElementById('status');
const startBtn = document.getElementById('setActiveFundBtn');
const stopBtn = document.getElementById('stopBotBtn');
const resetBtn = document.getElementById('resetFundBtn');
const logBox = document.getElementById('log-box');
const clearLogBtn = document.getElementById('clearLogBtn');
const confirmAdjustedBtn = document.getElementById('confirmAdjustedBtn');
const showLastNotifBtn = document.getElementById('showLastNotifBtn');
const adjustmentStatus = document.getElementById('adjustmentStatus');
const logoutBtn = document.getElementById('logoutBtn');
const closeTabsBtn = document.getElementById('closeTabsBtn');

// Login elements
const loginScreen = document.getElementById('loginScreen');
const mainInterface = document.getElementById('mainInterface');
const loginBtn = document.getElementById('loginBtn');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginStatus = document.getElementById('loginStatus');

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
    const stored = await new Promise(resolve => chrome.storage.sync.get(['authToken', 'authUser'], resolve));
    addLog(`Checking auth: token=${!!stored.authToken}, user=${stored.authUser?.username || 'none'}`);
    
    if (stored.authToken && stored.authUser) {
        // Verify token is still valid
        try {
            const response = await fetch(`${API_BASE_URL}/funds`, {
                headers: { 'token': stored.authToken }
            });
            addLog(`Token validation response: ${response.status}`);
            if (response.ok) {
                showMainInterface();
                addLog(`Authenticated as ${stored.authUser.username}`);
                return true;
            } else {
                addLog('Token validation failed, clearing stored auth', 'warn');
                await chrome.storage.sync.remove(['authToken', 'authUser']);
            }
        } catch (e) {
            addLog(`Token validation error: ${e.message}`, 'error');
            await chrome.storage.sync.remove(['authToken', 'authUser']);
        }
    }
    showLoginScreen();
    return false;
}

function showLoginScreen() {
    loginScreen.style.display = 'block';
    mainInterface.style.display = 'none';
}

function showMainInterface() {
    loginScreen.style.display = 'none';
    mainInterface.style.display = 'block';
}

async function login() {
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
        
        if (!response.ok) {
            addLog(`Login failed: ${raw}`, 'error');
            throw new Error(raw || 'ورود ناموفق');
        }
        
        let result;
        try {
            result = JSON.parse(raw);
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
        loginStatus.textContent = '✅ ورود موفق';
        loginStatus.style.color = 'var(--success-color)';
        loginPassword.value = '';
        
        setTimeout(() => {
            showMainInterface();
            fetchFunds();
            loadPersistedLogs();
            addLog('ورود موفق. در حال بارگذاری...');
        }, 1000);
        
    } catch (e) {
        loginStatus.textContent = '❌ ورود ناموفق';
        loginStatus.style.color = 'var(--error-color)';
        addLog(`Login error: ${e.message}`, 'error');
    }
}

async function logout() {
    await chrome.storage.sync.remove(['authToken', 'authUser']);
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
        
        fundSelector.innerHTML = '<option value="">-- انتخاب کنید --</option>';
        funds.forEach(fund => {
            const option = document.createElement('option');
            option.value = fund.name;
            option.textContent = `${fund.name} (${fund.type || 'unknown'})`;
            fundSelector.appendChild(option);
        });
        
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
                fundSelector.value = data.activeFund;
                
                // Get bot-managed tabs count
                const stored = await chrome.storage.local.get('botManagedTabs');
                const botManagedTabs = stored.botManagedTabs || [];
                
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
        const stored = await chrome.storage.sync.get('authToken');
        const token = stored.authToken || '';
        const response = await fetch(`${API_BASE_URL}/configurations/${selectedFund}`, {
            headers: { 'token': token }
        });
        
        if (!response.ok) {
            updateStatus('خطا در دریافت تنظیمات صندوق.', 'error');
            return;
        }
        
        const config = await response.json();
        const navUrl = config.fund_nav_page_url || config.nav_page_url;
        
        if (!navUrl) {
            updateStatus('URL صفحه NAV برای این صندوق تنظیم نشده.', 'error');
            return;
        }
        
        // Clear storage and set active fund
        await new Promise(resolve => chrome.storage.local.clear(resolve));
        await new Promise(resolve => chrome.storage.sync.set({ activeFund: selectedFund }, resolve));
        
        // Open the NAV page in a new tab
        const newTab = await chrome.tabs.create({ url: navUrl, active: true });
        
        // Mark this tab as bot-managed
        const stored = await chrome.storage.local.get('botManagedTabs');
        const botManagedTabs = stored.botManagedTabs || [];
        botManagedTabs.push(newTab.id);
        await chrome.storage.local.set({ botManagedTabs: botManagedTabs });
        
        updateStatus(`ربات برای صندوق ${selectedFund} فعال شد و صفحه NAV باز شد.`, 'success');
        addLog(`صندوق ${selectedFund} فعال شد. صفحه NAV باز شد. (تب ${newTab.id})`, 'success');
        
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
        const stored = await chrome.storage.sync.get('authToken');
        const token = stored.authToken || '';
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
        
        // Clear local storage
        await new Promise(resolve => chrome.storage.local.clear(resolve));
        
        // Open expert page in new tab
        const newTab = await chrome.tabs.create({ url: expertUrl, active: true });
        
        // Mark this tab as bot-managed
        const stored = await chrome.storage.local.get('botManagedTabs');
        const botManagedTabs = stored.botManagedTabs || [];
        botManagedTabs.push(newTab.id);
        await chrome.storage.local.set({ botManagedTabs: botManagedTabs });
        
        updateStatus(`تنظیمات صندوق ${activeFund} ریست شد و صفحه قیمت کارشناسی باز شد.`, 'success');
        addLog(`ریست صندوق ${activeFund}. صفحه قیمت کارشناسی باز شد. (تب ${newTab.id})`, 'success');
        
    } catch (error) { 
        updateStatus(error.message, 'error');
        addLog(`خطا در ریست صندوق: ${error.message}`, 'error');
    }
}

function updateStatus(message, type) {
    const colors = { error: 'var(--error-color)', success: 'var(--success-color)', neutral: 'var(--secondary-color)' };
    const bgColors = { error: '#f8d7da', success: '#d4edda', neutral: '#e2e3e5' };
    statusDiv.textContent = message;
    statusDiv.style.color = colors[type] || 'black';
    statusDiv.style.backgroundColor = bgColors[type] || 'transparent';
}

// --- Event Listeners ---
async function loadPersistedLogs() {
    try {
        const stored = await new Promise(resolve => chrome.storage.local.get('nav_logs', resolve));
        const logs = Array.isArray(stored.nav_logs) ? stored.nav_logs : [];
        logBox.innerHTML = '';
        logs.forEach(renderLogEntry);
        logBox.scrollTop = logBox.scrollHeight;
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
    await loadPersistedLogs();
    await checkAuth();
});

// Login events
loginBtn.addEventListener('click', login);
loginPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
});

// Main interface events
startBtn.addEventListener('click', setActiveFund);
stopBtn.addEventListener('click', stopBot);
resetBtn.addEventListener('click', resetFund);
clearLogBtn.addEventListener('click', clearLogs);
closeTabsBtn.addEventListener('click', closeNavAssistantTabs);
logoutBtn.addEventListener('click', logout);

// دکمه‌های وضعیت تعدیل
confirmAdjustedBtn?.addEventListener('click', async () => {
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
        adjustmentStatus.textContent = '-';
        chrome.tabs.create({ url: config.nav_page_url, active: true });
        addLog('کاربر تایید کرد که تعدیل انجام شده. در حال چک مجدد...', 'success');
    } catch (e) {
        addLog(e.message || 'خطا در شروع بررسی مجدد.', 'error');
    }
});

showLastNotifBtn?.addEventListener('click', () => {
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
