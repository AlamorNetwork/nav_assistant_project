const API_BASE_URL = 'https://respina.irplatforme.ir';
const TEST_MODE = true; // برای فعال/غیرفعال کردن حالت تست، این خط را تغییر دهید
const MAX_PERSISTED_LOGS = 500;
let monitoringInterval = null;
let monitoringIntervalMs = 120000; // 2m inside market hours

// --- Helper Functions ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function log(message, type = 'info') {
    const entry = { message, type, timestamp: Date.now(), url: window.location.href };
    console.log(`[${type.toUpperCase()}] ${message}`);
    try {
        chrome.runtime.sendMessage({ type: 'LOG_MESSAGE', payload: entry });
    } catch {}
    try {
        const stored = await chrome.storage.local.get('nav_logs');
        const logs = Array.isArray(stored.nav_logs) ? stored.nav_logs : [];
        logs.push(entry);
        if (logs.length > MAX_PERSISTED_LOGS) {
            logs.splice(0, logs.length - MAX_PERSISTED_LOGS);
        }
        await chrome.storage.local.set({ nav_logs: logs });
    } catch {}
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

function isMarketOpen(now = new Date()) {
    const hour = now.getHours();
    return hour >= 9 && hour < 15; // 9:00 <= t < 15:00 local time
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

async function showNotification(options) {
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
    if (options.persistent) {
        try { await chrome.storage.local.set({ last_notification: options }); } catch {}
    }
    if (options.buttons) {
        options.buttons.forEach(btn => {
            document.getElementById(btn.id).onclick = async () => {
                box.remove();
                try { await chrome.storage.local.remove('last_notification'); } catch {}
                btn.callback();
            };
        });
    }
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
            log(`در صفحه اشتباه. باز کردن تب جدید قیمت کارشناسی...`);
            try { window.open(config.expert_price_page_url, '_blank'); } catch {}
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

            // --- Staleness check: تاریخ/زمان NAV لحظه‌ای ---
            try {
                const dateEl = config.date_selector ? document.querySelector(config.date_selector) : null;
                const timeEl = config.time_selector ? document.querySelector(config.time_selector) : null;
                const dateText = dateEl ? (dateEl.innerText || dateEl.textContent || '').trim() : '';
                const timeText = timeEl ? (timeEl.innerText || timeEl.textContent || '').trim() : '';
                if (dateText || timeText) {
                    const now = new Date();
                    // تلاش برای پارس زمان به صورت HH:mm یا HH:mm:ss
                    const timeMatch = timeText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
                    let last = new Date(now);
                    if (timeMatch) {
                        const h = parseInt(timeMatch[1]);
                        const m = parseInt(timeMatch[2]);
                        const s = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
                        last.setHours(h, m, s, 0);
                    }
                    // اگر تاریخ به‌صورت امروز/شمسی یا متن دیگر است، حداقل زمان را می‌سنجیم
                    const ageSeconds = Math.max(0, Math.floor((now.getTime() - last.getTime()) / 1000));
                    const marketOpen = isMarketOpen(now);
                    if (!marketOpen) {
                        log('خارج از ساعات بازار هستیم. چک لحظه‌ای غیرفعال است.', 'warn');
                    }
                    if (marketOpen && ageSeconds >= 120) {
                        log(`NAV لحظه‌ای به‌روزرسانی نشده. تاخیر: ${ageSeconds} ثانیه.`, 'warn');
                        // جلوگیری از اسپم: هر 5 دقیقه یک‌بار هشدار ارسال شود
                        const { last_stale_alert_ts } = await chrome.storage.local.get('last_stale_alert_ts');
                        const nowTs = Date.now();
                        const shouldAlert = !last_stale_alert_ts || (nowTs - last_stale_alert_ts) > 5 * 60 * 1000;
                        if (shouldAlert) {
                            try { await fetch(`${API_BASE_URL}/alerts/stale`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fund_name: activeFund, last_nav_time: `${dateText} ${timeText}`.trim(), age_seconds: ageSeconds }) }); } catch {}
                            await chrome.storage.local.set({ last_stale_alert_ts: nowTs });
                        }
                        await showNotification({
                            title: '🚨 تاخیر در NAV لحظه‌ای',
                            message: `بروزرسانی NAV بیش از 2 دقیقه تاخیر دارد (${ageSeconds}s).`,
                            type: 'error',
                            persistent: true,
                            buttons: [
                                { id: 'recheck-btn', text: 'رفرش و چک مجدد', callback: () => { location.reload(); } }
                            ]
                        });
                    }
                }
            } catch (e) { log(`Stale check error: ${e.message}`, 'warn'); }
            
            if (result.status === 'adjustment_needed_more_data_required') {
                // در حالت تست، همان مقدار تغییر یافته را نگه می‌داریم تا مرحله دوم هم نیاز به تعدیل بدهد
                await chrome.storage.local.set({ navCheckData: { nav_on_page: navOnPage, total_units: totalUnits }, needsExpertData: true });
                log("نیاز به تعدیل. در حال انتقال...");
                // صفحه NAV را باز نگه می‌داریم و صفحه قیمت کارشناسی را در تب جدید باز می‌کنیم
                try { window.open(config.expert_price_page_url, '_blank'); } catch {}
            }

            // اگر کاربر «تعدیل زدم» زده باشد، بعد از موعد 2 دقیقه‌ای باید صحت اختلاف با تابلو را تایید کنیم
            try {
                const { postAdjustmentActive, postAdjustmentCheckDueAt } = await chrome.storage.local.get(['postAdjustmentActive', 'postAdjustmentCheckDueAt']);
                if (postAdjustmentActive && typeof postAdjustmentCheckDueAt === 'number' && Date.now() >= postAdjustmentCheckDueAt) {
                    log('شروع بررسی پس از تعدیل (post-adjustment)...', 'warn');
                    // درخواست دوباره به سرور: انتظار داریم diff <= tolerance باشد
                    const verifyResp = await fetch(`${API_BASE_URL}/check-nav`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fund_name: activeFund, nav_on_page: navOnPage, total_units: totalUnits })
                    });
                    const verify = await verifyResp.json();
                    if (verify.status === 'ok') {
                        await chrome.storage.local.set({ postAdjustmentActive: false, postAdjustmentCheckDueAt: 0 });
                        await showNotification({ title: '✅ بررسی پس از تعدیل موفق بود', message: `مغایرت در تلورانس (${verify.diff})`, type: 'success', persistent: true });
                        log('بررسی پس از تعدیل موفق بود.', 'success');
                    } else {
                        await showNotification({ title: '⚠️ مغایرت پس از تعدیل باقی است', message: `وضعیت: ${verify.status}`, type: 'error', persistent: true });
                        log('مغایرت پس از تعدیل باقی است.', 'error');
                    }
                }
            } catch (e) { log(`Post-adjustment check error: ${e.message}`, 'warn'); }
        }
    } 
    // --- Data Gathering Logic ---
    else if (areUrlsMatching(window.location.href, config.expert_price_page_url)) {
        if (localState.needsExpertData) {
            log("در صفحه قیمت کارشناسی برای جمع‌آوری داده نهایی.");

            // 1) همیشه قبل از خواندن، تعداد ردیف‌ها را زیاد و جستجو را کلیک کن
            const increaseRowsInput = document.querySelector(config.increase_rows_selector);
            const expertSearchButton = document.querySelector(config.expert_search_button_selector);
            if (increaseRowsInput) {
                increaseRowsInput.value = '';
                increaseRowsInput.value = 1000;
                try { increaseRowsInput.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
                try { increaseRowsInput.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
                log("افزایش تعداد ردیف‌ها به 1000.");
            }
            if (expertSearchButton) {
                log("کلیک روی دکمه جستجوی قیمت کارشناسی.");
                try { expertSearchButton.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
                try { expertSearchButton.click(); } catch {}
                try {
                    const form = expertSearchButton.closest('form');
                    if (form && form.requestSubmit) { form.requestSubmit(); }
                } catch {}
                try {
                    const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                    expertSearchButton.dispatchEvent(evt);
                } catch {}
            } else {
                log("دکمه جستجوی قیمت کارشناسی پیدا نشد.", 'warn');
            }

            // 2) صبر و تلاش برای بارگذاری لیست
            let attempts = 0;
            let allSecurityElements = document.querySelectorAll(config.securities_list_selector);
            while (attempts < 40 && allSecurityElements.length === 0) {
                await sleep(500);
                allSecurityElements = document.querySelectorAll(config.securities_list_selector);
                attempts++;
            }
            log(`تعداد اوراق یافت‌شده: ${allSecurityElements.length}. ایندکس انتخابی: ${selectedSecurityIndex}`);
            if (allSecurityElements.length === 0) {
                log("لیست اوراق پس از تلاش اول خالی ماند. تلاش مجدد برای کلیک/سابمیت...", 'warn');
                if (expertSearchButton) {
                    try { expertSearchButton.click(); } catch {}
                    try { const form = expertSearchButton.closest('form'); if (form && form.requestSubmit) { form.requestSubmit(); } } catch {}
                }
                let retry = 0;
                while (retry < 20 && allSecurityElements.length === 0) {
                    await sleep(500);
                    allSecurityElements = document.querySelectorAll(config.securities_list_selector);
                    retry++;
                }
                if (allSecurityElements.length === 0) { log("لیست اوراق پس از تلاش مجدد هم خالی است.", 'error'); return; }
            }

            // 3) خواندن از ردیف انتخابی
            const selectedElement = allSecurityElements[selectedSecurityIndex];
            if (!selectedElement) { log(`پیدا کردن اوراق در ردیف ${selectedSecurityIndex} ناموفق بود.`, 'error'); return; }
            const selectedRow = selectedElement.closest('tr');
            if (!selectedRow) { log("پیدا کردن ردیف والد ناموفق بود.", 'error'); return; }
            const sellableQuantity = readElementValue(config.sellable_quantity_selector, selectedRow);
            const expertPrice = readElementValue(config.expert_price_selector, selectedRow);
            log(`sellableQuantity=${sellableQuantity}, expertPrice=${expertPrice}`);
            if (sellableQuantity === null || expertPrice === null) { log("خواندن داده از ردیف انتخابی ناموفق بود.", 'error'); return; }

            // 4) ارسال به سرور
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

            // 5) پس از موفقیت، فلگ را خاموش کن تا در رفرش‌های بعدی دوباره اجرا نشود
            await chrome.storage.local.set({ needsExpertData: false });

            showNotification({
                title: '🚨 نیاز به تعدیل NAV',
                message: `قیمت پیشنهادی جدید: ${finalResult.suggested_nav}`,
                type: 'error',
                persistent: true,
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
    // بازیابی نوتیف ذخیره‌شده (اگر قبلاً کاربر ندیده باشد)
    try {
        const stored = await chrome.storage.local.get('last_notification');
        if (stored.last_notification) {
            await showNotification(stored.last_notification);
        }
    } catch {}
    // نرخ پایش تابع ساعات بازار است
    const now = new Date();
    monitoringIntervalMs = isMarketOpen(now) ? 120000 : 600000; // 2m داخل بازار، 10m خارج بازار
    performCheck();
    monitoringInterval = setInterval(() => {
        const t = new Date();
        const desired = isMarketOpen(t) ? 120000 : 600000;
        if (desired !== monitoringIntervalMs) {
            monitoringIntervalMs = desired;
            clearInterval(monitoringInterval);
            monitoringInterval = setInterval(performCheck, monitoringIntervalMs);
        }
        performCheck();
    }, monitoringIntervalMs);
    log("نظارت ربات شروع شد.", 'success');
}

startMonitoring();

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.activeFund) {
        log("صندوق فعال تغییر کرد. در حال ری‌استارت ربات...", 'warn');
        chrome.storage.local.clear(() => { startMonitoring(); });
    }
});

// شنونده برای نمایش مجدد اعلان ذخیره‌شده از پاپ‌آپ
window.addEventListener('NAV_ASSISTANT_SHOW_NOTIFICATION', async (e) => {
    const opts = e.detail || {};
    await showNotification({ ...(opts || {}), persistent: true });
});