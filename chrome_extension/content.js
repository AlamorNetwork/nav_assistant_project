const API_BASE_URL = 'https://respina.irplatforme.ir';
let monitoringInterval = null;

// --- تابع جدید برای ارسال لاگ به پاپ‌آپ ---
function log(message, type = 'info') {
    // برای راحتی، همچنان در کنسول صفحه هم لاگ می‌زنیم
    console.log(`[${type.toUpperCase()}] ${message}`);
    // پیام را برای پاپ‌آپ ارسال می‌کنیم
    chrome.runtime.sendMessage({
        type: 'LOG_MESSAGE',
        payload: { message, type }
    });
}

// --- توابع کمکی ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function readElementValue(selector, parentElement = document) {
    try {
        const element = parentElement.querySelector(selector);
        if (!element) { log(`Selector not found: ${selector}`, 'warn'); return null; }
        const value = element.value !== undefined ? element.value : element.innerText;
        return parseFloat(value.replace(/,/g, ''));
    } catch (e) { log(`Error reading selector ${selector}: ${e.message}`, 'error'); return null; }
}

function areUrlsMatching(currentUrl, configuredUrl) {
    if (!configuredUrl) return false;
    const currentBaseUrl = currentUrl.split('?')[0];
    const configuredBaseUrl = configuredUrl.split('?')[0];
    return currentBaseUrl === configuredBaseUrl;
}

function askForSecurity(securities, callback) {
    // (این تابع بدون تغییر باقی می‌ماند)
    document.getElementById('nav-assistant-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'nav-assistant-modal';
    let optionsHTML = securities.map((s, index) => `<option value="${index}">${s}</option>`).join('');
    modal.innerHTML = `
        <div class="modal-content">
            <h3>انتخاب اوراق</h3>
            <p>لطفاً اوراق مورد نظر برای محاسبه تعدیل را انتخاب کنید:</p>
            <select id="security-selector">${optionsHTML}</select>
            <button id="confirm-security-btn">تایید و ادامه</button>
        </div>
    `;
    Object.assign(modal.style, { position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: '10000', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl', fontFamily: 'Vazirmatn, sans-serif' });
    const content = modal.querySelector('.modal-content');
    Object.assign(content.style, { backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 5px 20px rgba(0,0,0,0.3)' });
    modal.querySelector('select').style.width = '100%';
    modal.querySelector('button').style.width = '100%';
    document.body.appendChild(modal);
    document.getElementById('confirm-security-btn').onclick = () => {
        const selectedIndex = document.getElementById('security-selector').value;
        modal.remove();
        callback(selectedIndex);
    };
}

// --- تابع منطق اصلی ---
async function performCheck() {
    log("--- شروع چرخه بررسی ---");
    const { activeFund } = await chrome.storage.sync.get('activeFund');
    if (!activeFund) {
        if (monitoringInterval) clearInterval(monitoringInterval);
        log("ربات خاموش است.", 'warn');
        return;
    }
    log(`صندوق فعال: '${activeFund}'.`);

    let config;
    try {
        const response = await fetch(`${API_BASE_URL}/configurations/${activeFund}`);
        if (!response.ok) throw new Error('تنظیمات یافت نشد.');
        config = await response.json();
        log("تنظیمات با موفقیت دریافت شد.", 'success');
    } catch (error) {
        log(error.message, 'error');
        return;
    }
    
    const localState = await chrome.storage.local.get([`selectedSecurityIndex_${activeFund}`, 'listExpanded', 'needsExpertData', 'navCheckData', 'navSearchClicked']);
    const selectedSecurityIndex = localState[`selectedSecurityIndex_${activeFund}`];
    
    if (selectedSecurityIndex === undefined) {
        log("وضعیت: راه‌اندازی اولیه.");
        if (!areUrlsMatching(window.location.href, config.expert_price_page_url)) {
            log(`در صفحه اشتباه. در حال انتقال به صفحه قیمت کارشناسی...`);
            window.location.href = config.expert_price_page_url;
            return;
        }
        if (!localState.listExpanded) {
            log("در حال افزایش ردیف‌ها و جستجو...");
            const increaseRowsInput = document.querySelector(config.increase_rows_selector);
            if(increaseRowsInput) { increaseRowsInput.value = ''; increaseRowsInput.value = 1000; }
            const expertSearchButton = document.querySelector(config.expert_search_button_selector);
            if(expertSearchButton) {
                await chrome.storage.local.set({ listExpanded: true });
                expertSearchButton.click();
            }
        } else {
            log("در حال جمع‌آوری لیست اوراق...");
            const securityElements = document.querySelectorAll(config.securities_list_selector);
            if (securityElements.length === 0) { log("لیست اوراق خالی است. سلکتور را چک کنید.", 'error'); return; }
            log(`تعداد ${securityElements.length} اوراق یافت شد.`, 'success');
            const securities = Array.from(securityElements).map(el => el.innerText.trim());
            askForSecurity(securities, async (chosenIndex) => {
                await chrome.storage.local.set({ [`selectedSecurityIndex_${activeFund}`]: parseInt(chosenIndex), listExpanded: false });
                log(`اوراق در ردیف ${chosenIndex} انتخاب شد. در حال انتقال به صفحه NAV...`);
                window.location.href = config.nav_page_url;
            });
        }
        return;
    }

    if (areUrlsMatching(window.location.href, config.nav_page_url)) {
        if (!localState.navSearchClicked) {
            log("در صفحه NAV. وضعیت: کلیک روی دکمه جستجو.");
            const searchButton = document.querySelector(config.nav_search_button_selector);
            if (searchButton) {
                await chrome.storage.local.set({ navSearchClicked: true });
                searchButton.click();
            } else {
                log("دکمه جستجوی صفحه NAV یافت نشد.", 'error');
            }
        } else {
            log("در صفحه NAV. وضعیت: خواندن داده‌ها پس از جستجو.");
            await chrome.storage.local.remove('navSearchClicked');
            const navOnPage = readElementValue(config.nav_price_selector);
            const totalUnits = readElementValue(config.total_units_selector);
            if (navOnPage === null || totalUnits === null) { log("خواندن NAV یا تعداد واحدها ناموفق بود.", 'error'); return; }
            const response = await fetch(`${API_BASE_URL}/check-nav`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fund_name: activeFund, nav_on_page: navOnPage, total_units: totalUnits })
            });
            const result = await response.json();
            log(`پاسخ سرور (بررسی اولیه): ${result.status}`);
            if (result.status === 'adjustment_needed_more_data_required') {
                await chrome.storage.local.set({ navCheckData: { nav_on_page: navOnPage, total_units: totalUnits }, needsExpertData: true });
                log("نیاز به تعدیل. در حال انتقال به صفحه قیمت کارشناسی...");
                window.location.href = config.expert_price_page_url;
            }
        }
    } else if (areUrlsMatching(window.location.href, config.expert_price_page_url)) {
        if (localState.needsExpertData) {
            log("در صفحه قیمت کارشناسی برای جمع‌آوری داده نهایی.");
            await chrome.storage.local.set({ needsExpertData: false });
            const allSecurityElements = document.querySelectorAll(config.securities_list_selector);
            const selectedElement = allSecurityElements[selectedSecurityIndex];
            if (!selectedElement) { log(`پیدا کردن اوراق در ردیف ${selectedSecurityIndex} ناموفق بود.`, 'error'); return; }
            const selectedRow = selectedElement.closest('tr');
            if (!selectedRow) { log("پیدا کردن ردیف والد ناموفق بود.", 'error'); return; }
            const sellableQuantity = readElementValue(config.sellable_quantity_selector, selectedRow);
            const expertPrice = readElementValue(config.expert_price_selector, selectedRow);
            if (sellableQuantity === null || expertPrice === null) { log("خواندن داده از ردیف انتخابی ناموفق بود.", 'error'); return; }
            const finalResponse = await fetch(`${API_BASE_URL}/check-nav`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fund_name: activeFund, nav_on_page: localState.navCheckData.nav_on_page,
                    total_units: localState.navCheckData.total_units,
                    sellable_quantity: sellableQuantity, expert_price: expertPrice
                })
            });
            const finalResult = await finalResponse.json();
            log(`پاسخ نهایی سرور: ${finalResult.suggested_nav}`, 'success');
            alert(`محاسبه انجام شد! قیمت پیشنهادی سرور: ${finalResult.suggested_nav}`);
            await sleep(5000);
            log("در حال بازگشت به صفحه NAV...");
            window.location.href = config.nav_page_url;
        }
    }
}

async function startMonitoring() {
    await sleep(2000);
    if (monitoringInterval) clearInterval(monitoringInterval);
    performCheck();
    monitoringInterval = setInterval(performCheck, 120000);
    log("نظارت ربات شروع شد.", 'success');
}

startMonitoring();

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.activeFund) {
        log("صندوق فعال تغییر کرد. در حال ری‌استارت ربات...", 'warn');
        chrome.storage.local.clear(() => { startMonitoring(); });
    }
});