const API_BASE_URL = 'https://navapi.alamornetwork.ir';
const fundSelector = document.getElementById('fundSelector');
const statusDiv = document.getElementById('status');
const startBtn = document.getElementById('setActiveFundBtn');

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
        
        // Load the currently active fund
        chrome.storage.sync.get('activeFund', (data) => {
            if (data.activeFund) {
                fundSelector.value = data.activeFund;
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
        updateStatus(`صندوق فعال: ${selectedFund}`, 'success');
    });
}

function updateStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.style.color = type === 'error' ? 'var(--error-color)' : 'var(--success-color)';
    statusDiv.style.backgroundColor = type === 'error' ? '#f8d7da' : '#d4edda';
}

document.addEventListener('DOMContentLoaded', fetchFunds);
startBtn.addEventListener('click', setActiveFund);