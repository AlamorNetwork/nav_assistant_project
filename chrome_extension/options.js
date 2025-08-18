const API_BASE_URL = 'https://respina.irplatforme.ir'; // آدرس سرور جدید
const statusDiv = document.getElementById('status');
const fundSelector = document.getElementById('fundSelector');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const connectionStatusSpan = document.getElementById('connectionStatus');

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
        } else {
            throw new Error('پاسخ سرور معتبر نیست.');
        }
    } catch (error) {
        connectionStatusSpan.textContent = '❌ قطع';
        connectionStatusSpan.style.color = 'var(--error-color)';
        updateStatus('اتصال به سرور برقرار نیست.', 'error');
    }
}

async function fetchFunds() {
    try {
        const response = await fetch(`${API_BASE_URL}/funds`);
        if (!response.ok) throw new Error('Error fetching funds list');
        const funds = await response.json();
        
        fundSelector.innerHTML = '<option value="">-- یک صندوق انتخاب کنید --</option>';
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
        updateStatus('نام و شناسه صندوق الزامی است.', 'error');
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
        updateStatus(`صندوق '${name}' با موفقیت اضافه شد.`, 'success');
        document.getElementById('newFundName').value = '';
        document.getElementById('newFundSymbol').value = '';
        fetchFunds();
    } catch (error) {
        updateStatus(error.message, 'error');
    }
}

async function saveConfiguration() {
    const selectedFund = fundSelector.value;
    if (!selectedFund) {
        updateStatus('لطفاً یک صندوق را انتخاب کنید.', 'error');
        return;
    }
    const configData = {
        fund_name: selectedFund,
        nav_page_url: document.getElementById('navPageUrl').value,
        expert_price_page_url: document.getElementById('expertPageUrl').value,
        date_selector: document.getElementById('dateSelector').value,
        time_selector: document.getElementById('timeSelector').value,
        nav_price_selector: document.getElementById('navPriceSelector').value,
        total_units_selector: document.getElementById('totalUnitsSelector').value,
        nav_search_button_selector: document.getElementById('navSearchBtnSelector').value,
        securities_list_selector: document.getElementById('securitiesListSelector').value,
        sellable_quantity_selector: document.getElementById('sellableQtySelector').value,
        expert_price_selector: document.getElementById('expertPriceSelector').value,
        increase_rows_selector: document.getElementById('increaseRowsSelector').value,
        expert_search_button_selector: document.getElementById('expertSearchBtnSelector').value,
    };
    try {
        const response = await fetch(`${API_BASE_URL}/configurations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configData),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail);
        updateStatus(`پیکربندی برای صندوق '${selectedFund}' ذخیره شد.`, 'success');
    } catch (error) {
        updateStatus(error.message, 'error');
    }
}

async function loadConfigurationForSelectedFund() {
    const selectedFund = fundSelector.value;
    const fields = {
        navPageUrl: 'nav_page_url', expertPageUrl: 'expert_price_page_url',
        dateSelector: 'date_selector', timeSelector: 'time_selector',
        navPriceSelector: 'nav_price_selector', totalUnitsSelector: 'total_units_selector',
        navSearchBtnSelector: 'nav_search_button_selector', securitiesListSelector: 'securities_list_selector',
        sellableQtySelector: 'sellable_quantity_selector', expertPriceSelector: 'expert_price_selector',
        increaseRowsSelector: 'increase_rows_selector', expertSearchBtnSelector: 'expert_search_button_selector'
    };

    // Clear fields first
    for (const fieldId in fields) {
        document.getElementById(fieldId).value = '';
    }

    if (!selectedFund) return;

    try {
        const response = await fetch(`${API_BASE_URL}/configurations/${selectedFund}`);
        if (!response.ok) return;
        const config = await response.json();
        
        for (const fieldId in fields) {
            const apiKey = fields[fieldId];
            if (config[apiKey]) {
                document.getElementById(fieldId).value = config[apiKey];
            }
        }
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

document.addEventListener('DOMContentLoaded', fetchFunds);
testConnectionBtn.addEventListener('click', testServerConnection);
document.getElementById('addFundBtn').addEventListener('click', addFund);
document.getElementById('saveConfigBtn').addEventListener('click', saveConfiguration);
fundSelector.addEventListener('change', loadConfigurationForSelectedFund);