const API_BASE_URL = 'https://respina.irplatforme.ir';
const fundSelector = document.getElementById('fundSelector');
const statusDiv = document.getElementById('status');
const startBtn = document.getElementById('setActiveFundBtn');
const stopBtn = document.getElementById('stopBotBtn');
const resetBtn = document.getElementById('resetFundBtn');
const logBox = document.getElementById('log-box');
const clearLogBtn = document.getElementById('clearLogBtn');

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

// گوش دادن به پیام‌های ارسالی از content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'LOG_MESSAGE') {
        addLog(request.payload.message, request.payload.type);
    }
});

// --- توابع اصلی ---
async function fetchFunds() {
    try {
        const response = await fetch(`${API_BASE_URL}/funds`);
        if (!response.ok) throw new Error('Server connection failed');
        const funds = await response.json();
        fundSelector.innerHTML = '<option value="">-- انتخاب کنید --</option>';
        funds.forEach(fund => {
            const option = document.createElement('option');
            option.value = fund.name;
            option.textContent = fund.name;
            fundSelector.appendChild(option);
        });
        chrome.storage.sync.get('activeFund', (data) => {
            if (data.activeFund) {
                fundSelector.value = data.activeFund;
                updateStatus(`ربات برای صندوق ${data.activeFund} فعال است.`, 'success');
            } else {
                updateStatus('ربات خاموش است.', 'neutral');
            }
        });
    } catch (error) { updateStatus(error.message, 'error'); }
}

function setActiveFund() {
    const selectedFund = fundSelector.value;
    if (!selectedFund) { updateStatus('لطفاً یک صندوق را انتخاب کنید.', 'error'); return; }
    chrome.storage.local.clear(() => {
        chrome.storage.sync.set({ activeFund: selectedFund }, () => {
            updateStatus(`ربات برای صندوق ${selectedFund} فعال شد.`, 'success');
        });
    });
}

function stopBot() {
    chrome.storage.sync.remove('activeFund', () => {
        fundSelector.value = '';
        updateStatus('ربات با موفقیت خاموش شد.', 'neutral');
    });
}

async function resetFund() {
    const { activeFund } = await new Promise(resolve => chrome.storage.sync.get('activeFund', resolve));
    if (!activeFund) { updateStatus('ابتدا یک صندوق را فعال کنید.', 'error'); return; }
    try {
        const response = await fetch(`${API_BASE_URL}/configurations/${activeFund}`);
        if (!response.ok) throw new Error('Could not get config for reset.');
        const config = await response.json();
        const startUrl = config.expert_price_page_url;
        if (!startUrl) { updateStatus('URL صفحه قیمت کارشناسی ثبت نشده.', 'error'); return; }
        await new Promise(resolve => chrome.storage.local.clear(resolve));
        chrome.tabs.create({ url: startUrl, active: true });
        updateStatus(`تنظیمات صندوق ${activeFund} ریست شد.`, 'success');
    } catch (error) { updateStatus(error.message, 'error'); }
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

document.addEventListener('DOMContentLoaded', () => {
    fetchFunds();
    loadPersistedLogs();
    addLog('پنجره باز شد. در حال گوش دادن به لاگ‌ها...');
});
startBtn.addEventListener('click', setActiveFund);
stopBtn.addEventListener('click', stopBot);
resetBtn.addEventListener('click', resetFund);
clearLogBtn.addEventListener('click', clearLogs);
