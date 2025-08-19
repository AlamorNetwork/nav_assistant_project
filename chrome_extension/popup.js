const API_BASE_URL = 'https://respina.irplatforme.ir'; // آدرس سرور شما
const fundSelector = document.getElementById('fundSelector');
const statusDiv = document.getElementById('status');
const startBtn = document.getElementById('setActiveFundBtn');
const stopBtn = document.getElementById('stopBotBtn');
const resetBtn = document.getElementById('resetFundBtn');

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
    } catch (error) {
        updateStatus(error.message, 'error');
    }
}

function setActiveFund() {
    const selectedFund = fundSelector.value;
    if (!selectedFund) {
        updateStatus('لطفاً یک صندوق را انتخاب کنید.', 'error');
        return;
    }
    chrome.storage.sync.set({ activeFund: selectedFund }, () => {
        updateStatus(`ربات برای صندوق ${selectedFund} فعال شد.`, 'success');
    });
}

function stopBot() {
    chrome.storage.sync.remove('activeFund', () => {
        fundSelector.value = '';
        updateStatus('ربات با موفقیت خاموش شد.', 'neutral');
    });
}

function resetFund() {
    chrome.storage.sync.get('activeFund', (data) => {
        if (!data.activeFund) {
            updateStatus('ابتدا یک صندوق را فعال کنید.', 'error');
            return;
        }
        // Clear all local storage related to this fund's setup
        const fundKey = `selectedSecurity_${data.activeFund}`;
        chrome.storage.local.remove([fundKey, 'listExpanded', 'needsExpertData', 'navCheckData'], () => {
            updateStatus(`تنظیمات صندوق ${data.activeFund} ریست شد. فرآیند راه‌اندازی دوباره شروع می‌شود.`, 'success');
            // Reload the active tab to trigger the setup process
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs[0]) {
                    chrome.tabs.reload(tabs[0].id);
                }
            });
        });
    });
}

function updateStatus(message, type) {
    const colors = {
        error: 'var(--error-color)',
        success: 'var(--success-color)',
        neutral: 'var(--secondary-color)'
    };
    const bgColors = {
        error: '#f8d7da',
        success: '#d4edda',
        neutral: '#e2e3e5'
    };
    statusDiv.textContent = message;
    statusDiv.style.color = colors[type] || 'black';
    statusDiv.style.backgroundColor = bgColors[type] || 'transparent';
}

document.addEventListener('DOMContentLoaded', fetchFunds);
startBtn.addEventListener('click', setActiveFund);
stopBtn.addEventListener('click', stopBot);
resetBtn.addEventListener('click', resetFund);
