const API_BASE_URL = 'https://respina.irplatforme.ir';
const TEST_MODE = true; // برای فعال/غیرفعال کردن حالت تست، این خط را تغییر دهید
let monitoringInterval = null;

// --- Helper Functions ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function log(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    chrome.runtime.sendMessage({ type: 'LOG_MESSAGE', payload: { message, type } });
}

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
    return currentUrl.split('?')[0] === configuredUrl.split('?')[0];
}

// --- UI Functions (askForSecurity, showNotification) ---
// These functions remain unchanged from the previous correct version.
function askForSecurity(securities, callback) {
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

function showNotification(options) {
    document.getElementById('nav-assistant-notification')?.remove();
    const box = document.createElement('div');
    box.id = 'nav-assistant-notification';
    let buttonsHTML = options.buttons ? `<div class="buttons">${options.buttons.map(btn => `<button id="${btn.id}" class="${btn.class || ''}">${btn.text}</button>`).join('')}</div>` : '';
    box.innerHTML = `<div class="header"><strong>🤖 دستیار هوشمند NAV</strong><button class="close-btn">&times;</button></div><div class="body"><p>${options.title}</p>${options.message ? `<p><strong>${options.message}</strong></p>` : ''}${buttonsHTML}</div>`;
    Object.assign(box.style, { position: 'fixed', top: '20px', right: '20px', width: '320px', backgroundColor: 'white', color: '#333', zIndex: '99999', borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.2)', fontFamily: 'Vazirmatn, sans-serif', direction: 'rtl', borderTop: `5px solid ${options.type === 'success' ? '#28a745' : '#ffc107'}` });
    box.querySelector('.header').style.cssText = 'padding: 10px 15px; background-color: #f7f7f7; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;';
    box.querySelector('.body').style.cssText = 'padding: 15px;';
    box.querySelector('.close-btn').style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer; color: #888;';
    if (options.buttons) {
        box.querySelector('.buttons').style.cssText = 'margin-top: 15px; display: flex; gap: 10px;';
        box.querySelectorAll('button').forEach(btn => {
            btn.style.cssText = 'flex-grow: 1; padding: 8px; border-radius: 6px; border: none; color: white; cursor: pointer;';
            if (btn.id === 'recheck-btn') btn.style.backgroundColor = 'var(--primary-color, #007BFF)'; else btn.style.backgroundColor = 'var(--secondary-color, #6c757d)';
        });
    }
    box.querySelector('.close-btn').onclick = () => box.remove();
    document.body.appendChild(box);
    if (options.buttons) { options.buttons.forEach(btn => { document.getElementById(btn.id).onclick = () => { box.remove(); btn.callback(); }; }); }
}


// --- Main Logic ---
async function performCheck() {
    log("--- شروع چرخه بررسی ---");
    const { activeFund } = await chrome.storage.sync.get('activeFund');
    if (!activeFund) { if (monitoringInterval) clearInterval(monitoringInterval); log("ربات خاموش است.", 'warn'); return; }
    log(`صندوق فعال: '${activeFund}'.`);

    let config;
    try {
        const response = await fetch(`${API_BASE_URL}/configurations/${activeFund}`);
        if (!response.ok) throw new Error('تنظیمات یافت نشد.');
        config = await response.json();
        log("تنظیمات با موفقیت دریافت شد.", 'success');
    } catch (error) { log(error.message, 'error'); return; }
    
    const localState = await chrome.storage.local.get([`selectedSecurityIndex_${activeFund}`, 'listExpanded', 'needsExpertData', 'navCheckData', 'navSearchClicked']);
    const selectedSecurityIndex = localState[`selectedSecurityIndex_${activeFund}`];
    
    // --- Initial Setup Logic ---
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
            } else { log("دکمه جستجوی صفحه قیمت کارشناسی یافت نشد.", 'error'); }
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

    // --- Main Monitoring Loop ---
    if (areUrlsMatching(window.location.href, config.nav_page_url)) {
        // *** NEW STATE MACHINE LOGIC FOR NAV PAGE ***
        if (!localState.navSearchClicked) {
            // State 1: We haven't clicked search yet.
            log("در صفحه NAV. وضعیت: کلیک روی دکمه جستجو.");
            const searchButton = document.querySelector(config.nav_search_button_selector);
            if (searchButton) {
                // Set the flag BEFORE clicking, then click.
                await chrome.storage.local.set({ navSearchClicked: true });
                searchButton.click();
            } else {
                log("دکمه جستجوی صفحه NAV یافت نشد.", 'error');
            }
        } else {
            // State 2: We have already clicked. Now we read the data.
            log("در صفحه NAV. وضعیت: خواندن داده‌ها پس از جستجو.");
            await chrome.storage.local.remove('navSearchClicked'); // Reset the flag for the next cycle
            
            let navOnPage = readElementValue(config.nav_price_selector);
            const totalUnits = readElementValue(config.total_units_selector);
            if (navOnPage === null || totalUnits === null) { log("خواندن NAV/واحدها ناموفق بود.", 'error'); return; }
            
            if (TEST_MODE) {
                log("حالت تست فعال است. در حال ایجاد مغایرت مصنوعی...", 'warn');
                navOnPage += 50; // اختلاف ساختگی را برای هر دو درخواست حفظ می‌کنیم
            }
            
            const response = await fetch(`${API_BASE_URL}/check-nav`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fund_name: activeFund, nav_on_page: navOnPage, total_units: totalUnits })
            });
            const result = await response.json();
            log(`پاسخ سرور (اولیه): ${result.status}`);
            
            if (result.status === 'adjustment_needed_more_data_required') {
                // در حالت تست، همان مقدار تغییر یافته را نگه می‌داریم تا مرحله دوم هم نیاز به تعدیل بدهد
                await chrome.storage.local.set({ navCheckData: { nav_on_page: navOnPage, total_units: totalUnits }, needsExpertData: true });
                log("نیاز به تعدیل. در حال انتقال...");
                window.location.href = config.expert_price_page_url;
            }
        }
    } 
    // --- Data Gathering Logic ---
    else if (areUrlsMatching(window.location.href, config.expert_price_page_url)) {
        if (localState.needsExpertData) {
            log("در صفحه قیمت کارشناسی برای جمع‌آوری داده نهایی.");
            await chrome.storage.local.set({ needsExpertData: false });

            // صبر برای لود شدن جدول و در صورت نیاز تلاش برای افزایش ردیف‌ها و جستجو
            let attempts = 0;
            let allSecurityElements = document.querySelectorAll(config.securities_list_selector);
            while (attempts < 20 && allSecurityElements.length === 0) {
                await sleep(500);
                allSecurityElements = document.querySelectorAll(config.securities_list_selector);
                attempts++;
            }
            if (allSecurityElements.length === 0) {
                const increaseRowsInput = document.querySelector(config.increase_rows_selector);
                const expertSearchButton = document.querySelector(config.expert_search_button_selector);
                if (increaseRowsInput) { increaseRowsInput.value = ''; increaseRowsInput.value = 1000; }
                if (expertSearchButton) { expertSearchButton.click(); }
                await sleep(1000);
                allSecurityElements = document.querySelectorAll(config.securities_list_selector);
            }

            log(`تعداد اوراق یافت‌شده: ${allSecurityElements.length}. ایندکس انتخابی: ${selectedSecurityIndex}`);
            const selectedElement = allSecurityElements[selectedSecurityIndex];
            if (!selectedElement) { log(`پیدا کردن اوراق در ردیف ${selectedSecurityIndex} ناموفق بود.`, 'error'); return; }
            const selectedRow = selectedElement.closest('tr');
            if (!selectedRow) { log("پیدا کردن ردیف والد ناموفق بود.", 'error'); return; }
            const sellableQuantity = readElementValue(config.sellable_quantity_selector, selectedRow);
            const expertPrice = readElementValue(config.expert_price_selector, selectedRow);
            log(`sellableQuantity=${sellableQuantity}, expertPrice=${expertPrice}`);
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

            showNotification({
                title: '🚨 نیاز به تعدیل NAV',
                message: `قیمت پیشنهادی جدید: ${finalResult.suggested_nav}`,
                type: 'error',
                buttons: [
                    {
                        id: 'recheck-btn',
                        text: 'تعدیل زدم، دوباره چک کن',
                        callback: () => {
                            log("کاربر تایید کرد. در حال بازگشت به صفحه NAV برای بررسی مجدد...");
                            window.location.href = config.nav_page_url;
                        }
                    }
                ]
            });
        }
    }
}

// --- Startup and Listeners ---
async function startMonitoring() {
    await sleep(2000);
    if (monitoringInterval) clearInterval(monitoringInterval);
    performCheck();
    monitoringInterval = setInterval(performCheck, 120000); // 2 minutes
    log("نظارت ربات شروع شد.", 'success');
}

startMonitoring();

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.activeFund) {
        log("صندوق فعال تغییر کرد. در حال ری‌استارت ربات...", 'warn');
        chrome.storage.local.clear(() => { startMonitoring(); });
    }
});