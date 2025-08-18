const API_BASE_URL = 'https://navapi.alamornetwork.ir';
const statusDiv = document.getElementById('status');
const fundSelector = document.getElementById('fundSelector');

// --- Functions for API communication ---

async function fetchFunds() {
    try {
        const response = await fetch(`${API_BASE_URL}/funds`);
        if (!response.ok) throw new Error('Error fetching funds list');
        const funds = await response.json();
        
        fundSelector.innerHTML = '<option value="">-- Select a fund --</option>'; // Reset
        funds.forEach(fund => {
            const option = document.createElement('option');
            option.value = fund.name;
            option.textContent = fund.name;
            fundSelector.appendChild(option);
        });
    } catch (error) {
        updateStatus(error.message, 'error');
    }
}

async function addFund() {
    const name = document.getElementById('newFundName').value;
    const symbol = document.getElementById('newFundSymbol').value;
    if (!name || !symbol) {
        updateStatus('Fund name and symbol are required.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/funds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, api_symbol: symbol }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail);

        updateStatus(`Fund '${name}' added successfully.`, 'success');
        document.getElementById('newFundName').value = '';
        document.getElementById('newFundSymbol').value = '';
        fetchFunds(); // Refresh the dropdown list
    } catch (error) {
        updateStatus(error.message, 'error');
    }
}

async function saveConfiguration() {
    const selectedFund = fundSelector.value;
    if (!selectedFund) {
        updateStatus('Please select a fund first.', 'error');
        return;
    }

    const configData = {
        fund_name: selectedFund,
        nav_page_url: document.getElementById('navPageUrl').value,
        expert_price_page_url: document.getElementById('expertPageUrl').value,
        nav_selector: document.getElementById('navSelector').value,
        total_units_selector: document.getElementById('totalUnitsSelector').value,
        sellable_quantity_selector: document.getElementById('sellableQtySelector').value,
        expert_price_selector: document.getElementById('expertPriceSelector').value,
    };

    try {
        const response = await fetch(`${API_BASE_URL}/configurations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configData),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail);
        
        updateStatus(`Configuration for '${selectedFund}' saved successfully.`, 'success');
    } catch (error) {
        updateStatus(error.message, 'error');
    }
}


async function loadConfigurationForSelectedFund() {
    const selectedFund = fundSelector.value;
    if (!selectedFund) {
        // Clear all fields if no fund is selected
        document.getElementById('navPageUrl').value = '';
        document.getElementById('expertPageUrl').value = '';
        document.getElementById('navSelector').value = '';
        document.getElementById('totalUnitsSelector').value = '';
        document.getElementById('sellableQtySelector').value = '';
        document.getElementById('expertPriceSelector').value = '';
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/configurations/${selectedFund}`);
        if (!response.ok) {
           // This is not an error, it just means no config is saved yet.
           // You can clear the fields as a visual cue.
           console.log(`No configuration found for ${selectedFund}. Ready to create a new one.`);
           return;
        }
        const config = await response.json();
        
        // Populate the fields with existing data
        document.getElementById('navPageUrl').value = config.nav_page_url || '';
        document.getElementById('expertPageUrl').value = config.expert_price_page_url || '';
        document.getElementById('navSelector').value = config.nav_selector || '';
        document.getElementById('totalUnitsSelector').value = config.total_units_selector || '';
        document.getElementById('sellableQtySelector').value = config.sellable_quantity_selector || '';
        document.getElementById('expertPriceSelector').value = config.expert_price_selector || '';

    } catch (error) {
        updateStatus(error.message, 'error');
    }
}

function updateStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.style.color = type === 'error' ? 'var(--error-color)' : 'var(--success-color)';
    statusDiv.style.backgroundColor = type === 'error' ? '#f8d7da' : '#d4edda';
    
    setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.style.backgroundColor = 'transparent';
    }, 5000);
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', fetchFunds);
document.getElementById('addFundBtn').addEventListener('click', addFund);
document.getElementById('saveConfigBtn').addEventListener('click', saveConfiguration);
fundSelector.addEventListener('change', loadConfigurationForSelectedFund);


// options.js

// این دو خط را به بالای فایل، کنار بقیه متغیرها اضافه کنید
const testConnectionBtn = document.getElementById('testConnectionBtn');
const connectionStatusSpan = document.getElementById('connectionStatus');

// این تابع جدید را به بخش توابع ارتباط با API اضافه کنید
async function testServerConnection() {
    connectionStatusSpan.textContent = '⏳ در حال تست...';
    connectionStatusSpan.style.color = 'var(--secondary-color)';
    try {
        const response = await fetch(`${API_BASE_URL}/`);
        if (!response.ok) throw new Error('پاسخ سرور ناموفق بود.');
        const result = await response.json();
        
        if (result.status === 'ok') {
            connectionStatusSpan.textContent = '✅ متصل';
            connectionStatusSpan.style.color = 'var(--success-color)';
            updateStatus('اتصال با سرور با موفقیت برقرار شد.', 'success');
        } else {
            throw new Error('پاسخ سرور معتبر نیست.');
        }
    } catch (error) {
        connectionStatusSpan.textContent = '❌ قطع';
        connectionStatusSpan.style.color = 'var(--error-color)';
        updateStatus('اتصال به سرور برقرار نیست. آیا سرور پایتون فعال است؟', 'error');
    }
}

// این خط را به انتهای فایل، کنار بقیه Event Listener ها اضافه کنید
testConnectionBtn.addEventListener('click', testServerConnection);