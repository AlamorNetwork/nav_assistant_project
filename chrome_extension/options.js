const API_BASE_URL = 'https://respina.irplatforme.ir';
const statusDiv = document.getElementById('status');
const fundSelector = document.getElementById('fundSelector');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const connectionStatusSpan = document.getElementById('connectionStatus');
const testModeToggle = document.getElementById('testModeToggle');
const newFundType = document.getElementById('newFundType');
const templateSelector = document.getElementById('templateSelector');
const applyTemplateBtn = document.getElementById('applyTemplateBtn');
const loginBtn = document.getElementById('loginBtn');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginStatus = document.getElementById('loginStatus');

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
        } else { throw new Error('پاسخ سرور معتبر نیست.'); }
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
        // بارگذاری تنظیم تست مود ذخیره‌شده (اختصاصی هر صندوق)
        const stored = await chrome.storage.sync.get('perFundTestMode');
        const perFundTestMode = stored.perFundTestMode || {};
        fundSelector.addEventListener('change', () => {
            const selected = fundSelector.value;
            testModeToggle.checked = !!perFundTestMode[selected];
        });
        testModeToggle.addEventListener('change', async () => {
            const selected = fundSelector.value;
            if (!selected) return;
            const updated = { ...(stored.perFundTestMode || {}), [selected]: testModeToggle.checked };
            await chrome.storage.sync.set({ perFundTestMode: updated });
            updateStatus(`حالت تست برای '${selected}' ${testModeToggle.checked ? 'فعال' : 'غیرفعال'} شد.`, 'success');
        });
    } catch (error) { updateStatus(error.message, 'error'); }
}

async function addFund() {
    const name = document.getElementById('newFundName').value;
    const symbol = document.getElementById('newFundSymbol').value;
    const type = newFundType.value || 'rayan';
    if (!name || !symbol) { updateStatus('نام و شناسه صندوق الزامی است.', 'error'); return; }
    try {
        const stored = await chrome.storage.sync.get('authToken');
        const token = stored.authToken || '';
        const response = await fetch(`${API_BASE_URL}/funds`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'token': token },
            body: JSON.stringify({ name: name, api_symbol: symbol, type }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail);
        updateStatus(`صندوق '${name}' با موفقیت اضافه شد.`, 'success');
        document.getElementById('newFundName').value = '';
        document.getElementById('newFundSymbol').value = '';
        newFundType.value = 'rayan';
        fetchFunds();
    } catch (error) { updateStatus(error.message, 'error'); }
}

async function saveConfiguration() {
    const selectedFund = fundSelector.value;
    if (!selectedFund) { updateStatus('لطفاً یک صندوق را انتخاب کنید.', 'error'); return; }
    const configData = {
        fund_name: selectedFund,
        tolerance: parseFloat(document.getElementById('tolerance').value) || 4.0,
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
        const stored = await chrome.storage.sync.get('authToken');
        const token = stored.authToken || '';
        const response = await fetch(`${API_BASE_URL}/configurations`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'token': token },
            body: JSON.stringify(configData),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail);
        updateStatus(`پیکربندی برای صندوق '${selectedFund}' ذخیره شد.`, 'success');
    } catch (error) { updateStatus(error.message, 'error'); }
}

async function loadConfigurationForSelectedFund() {
    const selectedFund = fundSelector.value;
    const fields = {
        tolerance: 'tolerance', navPageUrl: 'nav_page_url', expertPageUrl: 'expert_price_page_url',
        dateSelector: 'date_selector', timeSelector: 'time_selector', navPriceSelector: 'nav_price_selector',
        totalUnitsSelector: 'total_units_selector', navSearchBtnSelector: 'nav_search_button_selector',
        securitiesListSelector: 'securities_list_selector', sellableQtySelector: 'sellable_quantity_selector',
        expertPriceSelector: 'expert_price_selector', increaseRowsSelector: 'increase_rows_selector',
        expertSearchBtnSelector: 'expert_search_button_selector'
    };
    for (const fieldId in fields) { document.getElementById(fieldId).value = ''; }
    if (!selectedFund) return;
    try {
        const response = await fetch(`${API_BASE_URL}/configurations/${selectedFund}`);
        if (!response.ok) return;
        const config = await response.json();
        for (const fieldId in fields) {
            const apiKey = fields[fieldId];
            if (config[apiKey]) { document.getElementById(fieldId).value = config[apiKey]; }
        }
    } catch (error) { updateStatus(error.message, 'error'); }
}

async function fetchTemplates() {
    try {
        const response = await fetch(`${API_BASE_URL}/templates`);
        if (!response.ok) return;
        const data = await response.json();
        templateSelector.innerHTML = '<option value="">-- انتخاب کنید --</option>';
        data.templates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.name;
            opt.textContent = t.name;
            opt.dataset.fields = JSON.stringify(t.fields);
            opt.dataset.tolerance = t.tolerance;
            templateSelector.appendChild(opt);
        });
    } catch {}
}

function applySelectedTemplate() {
    const selected = templateSelector.value;
    if (!selected) return;
    const opt = templateSelector.selectedOptions[0];
    const fields = JSON.parse(opt.dataset.fields || '{}');
    const tol = parseFloat(opt.dataset.tolerance || '4');
    document.getElementById('tolerance').value = tol;
    const map = {
        date_selector: 'dateSelector', time_selector: 'timeSelector', nav_price_selector: 'navPriceSelector', total_units_selector: 'totalUnitsSelector', nav_search_button_selector: 'navSearchBtnSelector', securities_list_selector: 'securitiesListSelector', sellable_quantity_selector: 'sellableQtySelector', expert_price_selector: 'expertPriceSelector', increase_rows_selector: 'increaseRowsSelector', expert_search_button_selector: 'expertSearchBtnSelector'
    };
    Object.keys(map).forEach(apiKey => {
        if (fields[apiKey]) document.getElementById(map[apiKey]).value = fields[apiKey];
    });
    updateStatus('تمپلیت اعمال شد.', 'success');
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
document.addEventListener('DOMContentLoaded', fetchTemplates);
applyTemplateBtn.addEventListener('click', applySelectedTemplate);

async function login() {
    loginStatus.textContent = '⏳';
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: loginUsername.value, password: loginPassword.value })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Login failed');
        await chrome.storage.sync.set({ authToken: result.token, authUser: { username: result.username, role: result.role } });
        loginStatus.textContent = '✅ ورود موفق';
        loginStatus.style.color = 'var(--success-color)';
    } catch (e) {
        loginStatus.textContent = '❌';
        loginStatus.style.color = 'var(--error-color)';
        updateStatus(e.message, 'error');
    }
}

loginBtn.addEventListener('click', login);