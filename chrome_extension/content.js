const API_BASE_URL = 'https://chabokan.irplatforme.ir';
let TEST_MODE = true; // حالت پیش‌فرض؛ می‌تواند بر اساس صندوق غیرفعال/فعال شود
const MAX_PERSISTED_LOGS = 500;
let monitoringInterval = null;
let monitoringIntervalMs = 120000; // 2m inside market hours
let activeFunds = []; // Array of active funds for this user

// --- Helper Functions ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Desktop notification helper
async function showDesktopNotification(options) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'SHOW_DESKTOP_NOTIFICATION',
            options: options
        });
        
        if (response && response.ok) {
            log(`نوتیفیکیشن دسکتاپ نمایش داده شد: ${response.notificationId}`, 'success');
            return response.notificationId;
        } else {
            log(`خطا در نمایش نوتیفیکیشن دسکتاپ: ${response?.error || 'نامشخص'}`, 'warn');
            return null;
        }
    } catch (error) {
        log(`خطا در ارسال درخواست نوتیفیکیشن: ${error.message}`, 'error');
        return null;
    }
}

// Wait until the number of matched elements stabilizes (no change for a few cycles)
async function waitForListStabilize(selector, { stableCycles = 3, intervalMs = 400, maxTries = 40 } = {}) {
	try {
		let lastCount = -1;
		let stable = 0;
		let tries = 0;
		while (tries < maxTries && stable < stableCycles) {
			await sleep(intervalMs);
			const count = document.querySelectorAll(selector).length;
			if (count === lastCount) {
				stable++;
			} else {
				stable = 0;
				lastCount = count;
			}
			tries++;
		}
		log(`پایداری لیست بررسی شد (${selector}). تعداد نهایی ردیف‌ها: ${document.querySelectorAll(selector).length}`);
	} catch (e) {
		log(`خطا در انتظار پایداری لیست: ${e.message}`, 'warn');
	}
}

// Wait until a numeric value becomes available for a given selector inside parent
async function waitForNumericValue(selector, parentElement = document, { intervalMs = 300, maxTries = 20 } = {}) {
    let tries = 0;
    while (tries < maxTries) {
        try {
            const el = parentElement.querySelector(selector);
            const raw = el ? (el.value !== undefined ? el.value : (el.innerText || el.textContent || '')) : '';
            const parsed = parseNumberLoose(raw);
            if (parsed !== null) return parsed;
        } catch {}
        await sleep(intervalMs);
        tries++;
    }
    return null;
}

// Function to process expert data and send to server
async function processExpertData(fund, config, sellableQuantity, expertPrice, localState) {
    try {
        // 4) ارسال به سرور
        const finalResponse = await fetch(`${API_BASE_URL}/check-nav`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fund_name: fund.name, nav_on_page: localState[`navCheckData_${fund.name}`].nav_on_page,
                total_units: localState[`navCheckData_${fund.name}`].total_units,
                sellable_quantity: sellableQuantity, expert_price: expertPrice
            })
        });
        const finalResult = await finalResponse.json();
        const suggested = (finalResult && (finalResult.suggested_nav ?? finalResult.suggested ?? finalResult.new_nav)) ?? null;
        log(`پاسخ نهایی سرور برای ${fund.name}: ${suggested}`, 'success');
        
        // 5) پس از موفقیت، فلگ را خاموش کن تا در رفرش‌های بعدی دوباره اجرا نشود
        await chrome.storage.local.set({ [`needsExpertData_${fund.name}`]: false });
        
                 // 6) ذخیره اطلاعات اوراق برای نمایش در popup
         await chrome.storage.local.set({
             [`sellableQuantity_${fund.name}`]: sellableQuantity,
             [`expertPrice_${fund.name}`]: expertPrice
         });
         
         // Note: Row number comparison moved to after values are read
        
        // 7) ارسال پیام به popup برای بروزرسانی اطلاعات
        try {
            const stored = await chrome.storage.local.get(`selectedSecurityName_${fund.name}`);
            const securityName = stored[`selectedSecurityName_${fund.name}`];
            
            await chrome.runtime.sendMessage({
                type: 'SECURITY_DATA_UPDATED',
                data: {
                    securityName: securityName,
                    sellableQuantity: sellableQuantity,
                    expertPrice: expertPrice
                }
            });
        } catch (e) {
            // Ignore errors if popup is not open
        }
        
        // Show in-page notification
        await showNotification({
            title: `🚨 نیاز به تعدیل NAV - ${fund.name}`,
            message: suggested !== null ? `قیمت پیشنهادی جدید: ${suggested}` : (finalResult?.message || ''),
            type: 'error',
            persistent: true,
            buttons: [
                {
                    id: 'recheck-btn',
                    text: 'تعدیل زدم، دوباره چک کن',
                    callback: async () => {
                        log(`کاربر تایید کرد برای ${fund.name}. ارسال فرمان جستجو به تب NAV...`);
                        const ids = await chrome.storage.local.get([`navTabId_${fund.name}`]);
                        const navTabId = ids[`navTabId_${fund.name}`];
                        if (!navTabId) { log('تب NAV ثبت نشده است. از پاپ‌آپ تب‌ها را باز کنید.', 'error'); return; }
                        await chrome.runtime.sendMessage({ type: 'SEND_MESSAGE_TO_TAB', tabId: navTabId, message: { type: 'RUN_NAV_RECHECK', config: { nav_search_button_selector: config.nav_search_button_selector } } });
                        await chrome.runtime.sendMessage({ type: 'ACTIVATE_TAB', tabId: navTabId });
                    }
                }
            ]
        });
        
        // Also show desktop notification
        await showDesktopNotification({
            id: `nav_adjustment_${fund.name}_${Date.now()}`,
            title: '🚨 نیاز به تعدیل NAV!',
            message: `صندوق ${fund.name}: ${suggested !== null ? `قیمت پیشنهادی ${suggested}` : 'نیاز به بررسی'}`,
            priority: 2,
            requireInteraction: true,
            buttons: [
                { text: 'تعدیل زدم، دوباره چک کن' },
                { text: 'بستن' }
            ]
        });
    } catch (e) {
        log(`خطا در پردازش داده‌های کارشناسی: ${e.message}`, 'error');
    }
}

// Function to manage only 2 tabs (NAV and Expert)
async function manageTabLimit() {
    try {
        const stored = await chrome.storage.local.get('botManagedTabs');
        const botManagedTabs = stored.botManagedTabs || [];
        
        // If we have more than 2 tabs, close the oldest ones
        if (botManagedTabs.length > 2) {
            const tabsToClose = botManagedTabs.slice(0, botManagedTabs.length - 2);
            const remainingTabs = botManagedTabs.slice(-2);
            
            // Close excess tabs
            if (tabsToClose.length > 0) {
                await chrome.runtime.sendMessage({ 
                    type: 'CLOSE_TABS', 
                    tabIds: tabsToClose 
                });
                log(`${tabsToClose.length} تب اضافی بسته شد. فقط 2 تب باقی ماند.`);
            }
            
            // Update stored tabs
            await chrome.storage.local.set({ botManagedTabs: remainingTabs });
        }
    } catch (e) {
        log(`خطا در مدیریت تعداد تب‌ها: ${e.message}`, 'warn');
    }
}

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

function toEnglishDigits(input) {
    if (input == null) return '';
    let s = String(input);
    const persian = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
    const arabic  = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    for (let i = 0; i < 10; i++) {
        s = s.replace(new RegExp(persian[i], 'g'), String(i));
        s = s.replace(new RegExp(arabic[i], 'g'), String(i));
    }
    // Arabic decimal separator '٫' → '.' and thousands separator '٬' → ''
    s = s.replace(/[٫]/g, '.').replace(/[٬]/g, '');
    return s;
}

function parseNumberLoose(text) {
    const normalized = toEnglishDigits(text).trim();
    // keep digits, dot, minus; drop everything else
    const cleaned = normalized.replace(/[^0-9.\-]/g, '');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
}

function readElementValue(selector, parentElement = document) {
    try {
        const element = parentElement.querySelector(selector);
        if (!element) { log(`Selector not found: ${selector}`, 'warn'); return null; }
        const raw = element.value !== undefined ? element.value : (element.innerText || element.textContent || '');
        const parsed = parseNumberLoose(raw);
        if (parsed === null) {
            log(`Failed to parse number for selector ${selector}. Raw="${(raw||'').toString().slice(0,80)}"`, 'warn');
        }
        return parsed;
    } catch (e) { log(`Error reading selector ${selector}: ${e.message}`, 'error'); return null; }
}



// ستون‌های ثابت (بر اساس تجربه)
const FIXED_COLUMNS = {
    name: 1,      // ستون نام
    sellable: 3,  // ستون مانده قابل فروش
    expert: 12    // ستون قیمت کارشناسی
};

// تابع خواندن مقادیر از ستون‌های ثابت
function readValuesFromFixedColumns(rowElement, targetRowNumber = null) {
    const values = {
        name: null,
        sellable: null,
        expert: null,
        rowNumber: null
    };
    
    if (!rowElement) return values;
    
    // پیدا کردن شماره ردیف
    const table = rowElement.closest('table');
    if (table) {
        // ابتدا تمام ردیف‌های جدول رو بگیریم (شامل header هم)
        const allRows = table.querySelectorAll('tr');
        const tbodyRows = table.querySelectorAll('tbody tr');
        
        // شماره ردیف در tbody
        let tbodyRowNumber = null;
        for (let i = 0; i < tbodyRows.length; i++) {
            if (tbodyRows[i] === rowElement) {
                tbodyRowNumber = i + 1;
                break;
            }
        }
        
        // شماره ردیف در کل جدول
        let totalRowNumber = null;
        for (let i = 0; i < allRows.length; i++) {
            if (allRows[i] === rowElement) {
                totalRowNumber = i + 1;
                break;
            }
        }
        
        // اگر شماره ردیف هدف مشخص شده، از اون استفاده کن
        if (targetRowNumber && targetRowNumber > 0 && targetRowNumber <= tbodyRows.length) {
            values.rowNumber = targetRowNumber;
            // از ردیف هدف داده بخون
            const targetRow = tbodyRows[targetRowNumber - 1];
            if (targetRow) {
                // خواندن نام از ستون 1
                const nameCell = targetRow.querySelector(`td:nth-child(${FIXED_COLUMNS.name})`);
                if (nameCell) {
                    values.name = nameCell.innerText.trim();
                }
                
                // خواندن مانده قابل فروش از ستون 3
                const sellableCell = targetRow.querySelector(`td:nth-child(${FIXED_COLUMNS.sellable})`);
                if (sellableCell) {
                    // ابتدا از محتوای اصلی سلول
                    let val = parseNumberLoose(sellableCell.innerText || sellableCell.textContent || '');
                    if (val !== null) {
                        values.sellable = val;
                        log(`مانده قابل فروش از ردیف ${targetRowNumber} ستون ${FIXED_COLUMNS.sellable}: ${val}`, 'success');
                    } else {
                        // اگر عدد نبود، از font elements
                        const fonts = sellableCell.querySelectorAll('font');
                        for (const font of fonts) {
                            val = parseNumberLoose(font.innerText || font.textContent || '');
                            if (val !== null) {
                                values.sellable = val;
                                log(`مانده قابل فروش از font در ردیف ${targetRowNumber} ستون ${FIXED_COLUMNS.sellable}: ${val}`, 'success');
                                break;
                            }
                        }
                    }
                }
                
                // خواندن قیمت کارشناسی از ستون 12
                const expertCell = targetRow.querySelector(`td:nth-child(${FIXED_COLUMNS.expert})`);
                if (expertCell) {
                    // ابتدا از محتوای اصلی سلول
                    let val = parseNumberLoose(expertCell.innerText || expertCell.textContent || '');
                    if (val !== null) {
                        values.expert = val;
                        log(`قیمت کارشناسی از ردیف ${targetRowNumber} ستون ${FIXED_COLUMNS.expert}: ${val}`, 'success');
                    } else {
                        // اگر عدد نبود، از font elements
                        const fonts = expertCell.querySelectorAll('font');
                        for (const font of fonts) {
                            val = parseNumberLoose(font.innerText || font.textContent || '');
                            if (val !== null) {
                                values.expert = val;
                                log(`قیمت کارشناسی از font در ردیف ${targetRowNumber} ستون ${FIXED_COLUMNS.expert}: ${val}`, 'success');
                                break;
                            }
                        }
                    }
                }
            }
        } else {
            // استفاده از شماره ردیف tbody (که معمولاً درست‌تر است)
            values.rowNumber = tbodyRowNumber;
            
            // لاگ برای دیباگ
            if (values.name) {
                log(`🔍 دیباگ شماره ردیف: tbody=${tbodyRowNumber}, total=${totalRowNumber}, نام="${values.name}"`, 'info');
            }
        }
    }
    

    
    return values;
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
            <div id="selected-row-info" style="margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 5px; display: none;">
                <strong>اطلاعات ردیف انتخابی:</strong><br>
                <span id="row-number-display">-</span>
            </div>
            <button id="confirm-security-btn">تایید و ادامه</button>
        </div>
    `;
    Object.assign(modal.style, { position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: '10000', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl', fontFamily: 'Vazirmatn, sans-serif' });
    const content = modal.querySelector('.modal-content');
    Object.assign(content.style, { backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 5px 20px rgba(0,0,0,0.3)' });
    modal.querySelector('select').style.width = '100%';
    modal.querySelector('button').style.width = '100%';
    document.body.appendChild(modal);
    
    // Event listener برای نمایش شماره ردیف
    const selector = document.getElementById('security-selector');
    const rowInfo = document.getElementById('selected-row-info');
    const rowDisplay = document.getElementById('row-number-display');
    
    selector.addEventListener('change', () => {
        const selectedIndex = parseInt(selector.value);
        const selectedName = securities[selectedIndex];
        
        // پیدا کردن ردیف واقعی در جدول
        const table = document.querySelector('#adjustedIpList');
        if (table) {
            const tbodyRows = table.querySelectorAll('tbody tr');
            let foundRowNumber = -1;
            
            for (let i = 0; i < tbodyRows.length; i++) {
                const nameCell = tbodyRows[i].querySelector('td:nth-child(1)');
                if (nameCell && nameCell.innerText.trim() === selectedName) {
                    foundRowNumber = i + 1;
                    break;
                }
            }
            
            if (foundRowNumber > 0) {
                rowDisplay.textContent = `نام: "${selectedName}" - شماره ردیف واقعی: ${foundRowNumber}`;
                rowInfo.style.display = 'block';
                log(`🔍 دیباگ انتخاب: نام="${selectedName}", ردیف=${foundRowNumber}`, 'info');
            } else {
                rowDisplay.textContent = `نام: "${selectedName}" - ردیف یافت نشد`;
                rowInfo.style.display = 'block';
            }
        }
    });
    
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
    
    // Get user's active funds
    const { authToken, authUser } = await chrome.storage.sync.get(['authToken', 'authUser']);
    if (!authToken || !authUser) {
        log("کاربر وارد نشده است.", 'warn');
        return;
    }
    
    // Fetch user's funds
    try {
        const headers = authToken ? { 'token': authToken } : {};
        const response = await fetch(`${API_BASE_URL}/funds`, {
            headers: headers
        });
        if (!response.ok) {
            log("خطا در دریافت لیست صندوق‌ها", 'error');
            return;
        }
        const funds = await response.json();
        activeFunds = funds; // All user's funds are potentially active
        log(`تعداد صندوق‌های کاربر: ${funds.length}`);
    } catch (error) {
        log(`خطا در دریافت صندوق‌ها: ${error.message}`, 'error');
        return;
    }
    
    if (activeFunds.length === 0) {
        log("هیچ صندوقی برای کاربر تعریف نشده است.", 'warn');
        return;
    }
    
    // Check each fund
    for (const fund of activeFunds) {
        await checkSingleFund(fund);
    }
}

async function checkSingleFund(fund) {
    log(`بررسی صندوق: ${fund.name}`);
    
    // Get fund configuration
    let config;
    try {
        const { authToken } = await chrome.storage.sync.get('authToken');
        const headers = authToken ? { 'token': authToken } : {};
        const response = await fetch(`${API_BASE_URL}/configurations/${fund.name}`, {
            headers: headers
        });
        if (!response.ok) {
            log(`تنظیمات صندوق ${fund.name} یافت نشد.`, 'warn');
            return;
        }
        config = await response.json();
        log(`تنظیمات صندوق ${fund.name} دریافت شد.`, 'success');
    } catch (error) {
        log(`خطا در دریافت تنظیمات ${fund.name}: ${error.message}`, 'error');
        return;
    }
    
    // Check if we're on the right page for this fund
    const isOnNavPage = areUrlsMatching(window.location.href, config.nav_page_url);
    const isOnExpertPage = areUrlsMatching(window.location.href, config.expert_price_page_url);
    
    log(`URL Check - Current: ${window.location.href}`);
    log(`URL Check - Nav URL: ${config.nav_page_url}`);
    log(`URL Check - Expert URL: ${config.expert_price_page_url}`);
    log(`URL Check - isOnNavPage: ${isOnNavPage}, isOnExpertPage: ${isOnExpertPage}`);
    
    if (!isOnNavPage && !isOnExpertPage) {
        log(`صفحه فعلی برای صندوق ${fund.name} مناسب نیست.`, 'info');
        return; // Skip this fund if we're not on its pages
    }
    
    // Get fund-specific state
    const localState = await chrome.storage.local.get([
        `selectedSecurityIndex_${fund.name}`, 
        `listExpanded_${fund.name}`, 
        `needsExpertData_${fund.name}`, 
        `navCheckData_${fund.name}`, 
        `navSearchClicked_${fund.name}`,
        `navTabId_${fund.name}`,
        `expertTabId_${fund.name}`,
        `expertSuppressPrompt_${fund.name}`
    ]);
    
    const selectedSecurityIndex = localState[`selectedSecurityIndex_${fund.name}`];
    
    // --- Initial Setup Logic ---
    // Skip prompting when we're on Expert page for adjustment flow or while suppress flag is set
    if (selectedSecurityIndex === undefined && !(isOnExpertPage && (localState[`needsExpertData_${fund.name}`] || localState[`expertSuppressPrompt_${fund.name}`]))) {
        log(`وضعیت: راه‌اندازی اولیه برای صندوق ${fund.name}.`);
        if (!isOnExpertPage) { log('برای انتخاب اولیه باید روی تب Expert بماند. منتظر تب Expert می‌مانیم.', 'info'); return; }
        if (!localState[`listExpanded_${fund.name}`]) {
            log(`در حال افزایش ردیف‌ها و جستجو برای ${fund.name}...`);
            log(`Selector for increase rows: ${config.increase_rows_selector}`);
            log(`Selector for expert search button: ${config.expert_search_button_selector}`);
            
            const increaseRowsInput = document.querySelector(config.increase_rows_selector);
            if(increaseRowsInput) { 
                increaseRowsInput.value = ''; 
                increaseRowsInput.value = 1000; 
                log(`تعداد ردیف‌ها به 1000 تغییر یافت.`);
            } else {
                log(`سلکتور افزایش ردیف‌ها یافت نشد: ${config.increase_rows_selector}`, 'error');
            }
            
            const expertSearchButton = document.querySelector(config.expert_search_button_selector);
            if(expertSearchButton) {
                log(`دکمه جستجو یافت شد. کلیک...`);
                await chrome.storage.local.set({ [`listExpanded_${fund.name}`]: true });
                expertSearchButton.click();
                // wait for list load and exit; selection prompt will happen next cycle
                await waitForListStabilize(config.securities_list_selector, { stableCycles: 2, intervalMs: 400, maxTries: 30 });
                return;
            } else { 
                log(`دکمه جستجوی صفحه قیمت کارشناسی برای ${fund.name} یافت نشد.`, 'error');
                log(`تمام دکمه‌های موجود در صفحه:`);
                document.querySelectorAll('button').forEach((btn, i) => {
                    log(`Button ${i}: ${btn.textContent?.trim() || 'no text'} - ${btn.className || 'no class'}`);
                });
            }
        } else {
            // If we are in expert adjustment flow, do NOT prompt again here
            if (isOnExpertPage && localState[`needsExpertData_${fund.name}`]) {
                log(`در جریان تعدیل هستیم؛ از انتخاب قبلی استفاده می‌شود.`, 'info');
            } else {
                log(`در حال جمع‌آوری لیست اوراق برای ${fund.name}...`);
            const securityElements = document.querySelectorAll(config.securities_list_selector);
                if (securityElements.length === 0) { log(`لیست اوراق برای ${fund.name} خالی است. سلکتور را چک کنید.`, 'error'); return; }
                log(`تعداد ${securityElements.length} اوراق برای ${fund.name} یافت شد.`, 'success');
            const securities = Array.from(securityElements).map(el => el.innerText.trim());
            askForSecurity(securities, async (chosenIndex) => {
                                         const selectedSecurityName = securities[parseInt(chosenIndex)];
                     
                     // پیدا کردن شماره ردیف واقعی برای دیباگ
                     const table = document.querySelector('#adjustedIpList');
                     let actualRowNumber = -1;
                     if (table) {
                         const tbodyRows = table.querySelectorAll('tbody tr');
                         for (let i = 0; i < tbodyRows.length; i++) {
                             const nameCell = tbodyRows[i].querySelector('td:nth-child(1)');
                             if (nameCell && nameCell.innerText.trim() === selectedSecurityName) {
                                 actualRowNumber = i + 1;
                                 break;
                             }
                         }
                     }
                     
                     await chrome.storage.local.set({ 
                         [`selectedSecurityIndex_${fund.name}`]: parseInt(chosenIndex), 
                         [`selectedSecurityName_${fund.name}`]: selectedSecurityName,
                         [`listExpanded_${fund.name}`]: false,
                         [`actualRowNumber_${fund.name}`]: actualRowNumber // ذخیره شماره ردیف واقعی
                     });
                     
                     log(`🔍 انتخاب اوراق: نام="${selectedSecurityName}", ردیف واقعی=${actualRowNumber}`, 'info');
                    
                    // ارسال پیام به popup برای نمایش اطلاعات اوراق
                    try {
                        await chrome.runtime.sendMessage({
                            type: 'SECURITY_DATA_UPDATED',
                            data: {
                                securityName: selectedSecurityName,
                                sellableQuantity: null,
                                expertPrice: null
                            }
                        });
                    } catch (e) {
                        // Ignore errors if popup is not open
                    }
                    log(`اوراق "${selectedSecurityName}" در ردیف ${chosenIndex} برای ${fund.name} انتخاب شد. ارسال فرمان جستجو به تب NAV...`);
                    // Send recheck command to NAV tab instead of navigation
                    const ids = await chrome.storage.local.get([`navTabId_${fund.name}`]);
                    const navTabId = ids[`navTabId_${fund.name}`];
                    if (!navTabId) { log('تب NAV ثبت نشده است. از پاپ‌آپ تب‌ها را باز کنید.', 'error'); return; }
                    await chrome.runtime.sendMessage({ type: 'SEND_MESSAGE_TO_TAB', tabId: navTabId, message: { type: 'RUN_NAV_RECHECK', config: { nav_search_button_selector: config.nav_search_button_selector } } });
                    // Optionally bring NAV tab to front
                    await chrome.runtime.sendMessage({ type: 'ACTIVATE_TAB', tabId: navTabId });
                });
            }
        }
        return;
    }

    // --- Main Monitoring Loop ---
    if (isOnNavPage) {
        // Persist this tab as NAV tab
        try {
            await chrome.storage.local.set({ [`navTabId_${fund.name}`]: tabId });
        } catch {}
        if (!localState[`navSearchClicked_${fund.name}`]) {
            log(`در صفحه NAV برای ${fund.name}. وضعیت: کلیک روی دکمه جستجو.`);
            
            // Check if selector is defined
            if (!config.nav_search_button_selector) {
                log(`nav_search_button_selector برای ${fund.name} تعریف نشده است. لطفاً کانفیگ را بررسی کنید.`, 'error');
                return;
            }
            
            const searchButton = document.querySelector(config.nav_search_button_selector);
            if (searchButton) {
                log(`دکمه جستجو یافت شد، کلیک می‌کنم: ${config.nav_search_button_selector}`);
                await chrome.storage.local.set({ [`navSearchClicked_${fund.name}`]: true });
                
                // Try multiple click methods
                try {
                    searchButton.click();
                    log(`کلیک اول انجام شد`);
                } catch (e) {
                    log(`خطا در کلیک اول: ${e.message}`, 'warn');
                }
                
                // Backup click methods
                try {
                    searchButton.dispatchEvent(new MouseEvent('click', { 
                        bubbles: true, 
                        cancelable: true, 
                        view: window 
                    }));
                    log(`کلیک دوم (MouseEvent) انجام شد`);
                } catch (e) {
                    log(`خطا در کلیک دوم: ${e.message}`, 'warn');
                }
                
                // Try form submission if button is in a form
                try {
                    const form = searchButton.closest('form');
                    if (form && form.requestSubmit) {
                        form.requestSubmit();
                        log(`فرم submit شد`);
                    }
                } catch (e) {
                    log(`خطا در submit فرم: ${e.message}`, 'warn');
                }
                
            } else {
                log(`دکمه جستجوی صفحه NAV برای ${fund.name} با selector "${config.nav_search_button_selector}" یافت نشد.`, 'error');
                log(`لطفاً selector را در admin panel بررسی کنید.`, 'error');
                
                // Debug: Show all buttons on page
                const allButtons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
                log(`دکمه‌های موجود در صفحه (${allButtons.length}):`);
                allButtons.forEach((btn, i) => {
                    const text = (btn.innerText || btn.value || btn.getAttribute('title') || '').trim();
                    const id = btn.id || '';
                    const className = btn.className || '';
                    log(`  ${i+1}. text="${text}" id="${id}" class="${className}"`);
                });
            }
        } else {
            log(`در صفحه NAV برای ${fund.name}. وضعیت: خواندن داده‌ها پس از جستجو.`);
            await chrome.storage.local.remove(`navSearchClicked_${fund.name}`);
            
            let navOnPage = readElementValue(config.nav_price_selector);
            const totalUnits = readElementValue(config.total_units_selector);
            if (navOnPage === null || totalUnits === null) { log(`خواندن NAV/واحدها برای ${fund.name} ناموفق بود.`, 'error'); return; }
            
            // Get test mode for this specific fund
            try {
                const stored = await chrome.storage.sync.get('perFundTestMode');
                const perFundTestMode = stored.perFundTestMode || {};
                TEST_MODE = !!perFundTestMode[fund.name];
            } catch {}
            
            if (TEST_MODE) {
                log(`حالت تست فعال است برای ${fund.name}. در حال ایجاد مغایرت مصنوعی...`, 'warn');
                navOnPage += 50;
            }
            
            const { authToken } = await chrome.storage.sync.get('authToken');
            const response = await fetch(`${API_BASE_URL}/check-nav`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fund_name: fund.name, nav_on_page: navOnPage, total_units: totalUnits })
            });
            const result = await response.json();
            log(`پاسخ سرور برای ${fund.name} (اولیه): ${result.status}`);
            
            if (result.status === 'adjustment_needed_more_data_required') {
                await chrome.storage.local.set({ 
                    [`navCheckData_${fund.name}`]: { nav_on_page: navOnPage, total_units: totalUnits }, 
                    [`needsExpertData_${fund.name}`]: true 
                });
                log(`نیاز به تعدیل برای ${fund.name}. ارسال فرمان به تب قیمت کارشناسی...`);
                try { 
                    {
                        // Use existing expert tab only
                        const ids = await chrome.storage.local.get([`expertTabId_${fund.name}`]);
                        let expertTabId = ids[`expertTabId_${fund.name}`];
                        if (!expertTabId) { log('تب Expert ثبت نشده است. ابتدا از پاپ‌آپ هر دو تب را باز کنید.', 'error'); return; }
                        // Send message to expert tab to refresh and read
                        const msg = {
                            type: 'RUN_EXPERT_REFRESH_AND_READ',
                            fund_name: fund.name,
                            config: {
                                increase_rows_selector: config.increase_rows_selector,
                                expert_search_button_selector: config.expert_search_button_selector,
                                securities_list_selector: config.securities_list_selector,
                                sellable_quantity_selector: config.sellable_quantity_selector,
                                expert_price_selector: config.expert_price_selector
                            }
                        };
                        const sendResp = await chrome.runtime.sendMessage({ type: 'SEND_MESSAGE_TO_TAB', tabId: expertTabId, message: msg });
                        if (!sendResp || !sendResp.ok) {
                            log(`ارسال فرمان به تب Expert ناموفق بود: ${sendResp?.error || 'unknown'}`, 'warn');
                        } else {
                            log('فرمان Expert ارسال شد.', 'info');
                        }
                    }
                } catch (e) {
                    log(`خطا در فرمان‌دادن به تب قیمت کارشناسی: ${e.message}`, 'error');
                }
            }
            
            // --- Staleness check: تاریخ/زمان NAV لحظه‌ای ---
            try {
                const dateEl = config.date_selector ? document.querySelector(config.date_selector) : null;
                const timeEl = config.time_selector ? document.querySelector(config.time_selector) : null;
                const dateText = dateEl ? (dateEl.innerText || dateEl.textContent || '').trim() : '';
                const timeText = timeEl ? (timeEl.innerText || timeEl.textContent || '').trim() : '';
                if (dateText || timeText) {
                    const now = new Date();
                    const timeMatch = timeText.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
                    let last = new Date(now);
                    if (timeMatch) {
                        const h = parseInt(timeMatch[1]);
                        const m = parseInt(timeMatch[2]);
                        const s = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
                        last.setHours(h, m, s, 0);
                    }
                    const ageSeconds = Math.max(0, Math.floor((now.getTime() - last.getTime()) / 1000));
                    const marketOpen = isMarketOpen(now);
                    if (!marketOpen) {
                        log('خارج از ساعات بازار هستیم. چک لحظه‌ای غیرفعال است.', 'warn');
                    }
                    if (marketOpen && ageSeconds >= 120) {
                        log(`NAV لحظه‌ای برای ${fund.name} به‌روزرسانی نشده. تاخیر: ${ageSeconds} ثانیه.`, 'warn');
                        const { last_stale_alert_ts } = await chrome.storage.local.get('last_stale_alert_ts');
                        const nowTs = Date.now();
                        const shouldAlert = !last_stale_alert_ts || (nowTs - last_stale_alert_ts) > 5 * 60 * 1000;
                        if (shouldAlert) {
                            try { await fetch(`${API_BASE_URL}/alerts/stale`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fund_name: fund.name, last_nav_time: `${dateText} ${timeText}`.trim(), age_seconds: ageSeconds }) }); } catch {}
                            await chrome.storage.local.set({ last_stale_alert_ts: nowTs });
                        }
                        // Show in-page notification
                        await showNotification({
                            title: `🚨 تاخیر در NAV لحظه‌ای - ${fund.name}`,
                            message: `بروزرسانی NAV بیش از 2 دقیقه تاخیر دارد (${ageSeconds}s).`,
                            type: 'error',
                            persistent: true,
                            buttons: [
                                { id: 'recheck-btn', text: 'رفرش و چک مجدد', callback: () => { location.reload(); } }
                            ]
                        });
                        
                        // Also show desktop notification for stale NAV
                        await showDesktopNotification({
                            id: `nav_stale_${fund.name}_${Date.now()}`,
                            title: '⏰ تاخیر در بروزرسانی NAV',
                            message: `صندوق ${fund.name}: آخرین بروزرسانی ${Math.floor(ageSeconds/60)} دقیقه پیش`,
                            priority: 1, // Lower priority than adjustment notifications
                            requireInteraction: false,
                            buttons: [
                                { text: 'رفرش صفحه' },
                                { text: 'بستن' }
                            ]
                        });
                    }
                }
            } catch (e) { log(`Stale check error for ${fund.name}: ${e.message}`, 'warn'); }
            
            // اگر کاربر «تعدیل زدم» زده باشد، بعد از موعد 2 دقیقه‌ای باید صحت اختلاف با تابلو را تایید کنیم
            try {
                const { postAdjustmentActive, postAdjustmentCheckDueAt } = await chrome.storage.local.get(['postAdjustmentActive', 'postAdjustmentCheckDueAt']);
                if (postAdjustmentActive && typeof postAdjustmentCheckDueAt === 'number' && Date.now() >= postAdjustmentCheckDueAt) {
                    log(`شروع بررسی پس از تعدیل برای ${fund.name} (post-adjustment)...`, 'warn');
                    const verifyResp = await fetch(`${API_BASE_URL}/check-nav`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fund_name: fund.name, nav_on_page: navOnPage, total_units: totalUnits })
                    });
                    const verify = await verifyResp.json();
                    if (verify.status === 'ok') {
                        await chrome.storage.local.set({ postAdjustmentActive: false, postAdjustmentCheckDueAt: 0 });
                        await showNotification({ title: `✅ بررسی پس از تعدیل موفق بود - ${fund.name}`, message: `مغایرت در تلورانس (${verify.diff})`, type: 'success', persistent: true });
                        log(`بررسی پس از تعدیل برای ${fund.name} موفق بود.`, 'success');
                    } else {
                        await showNotification({ title: `⚠️ مغایرت پس از تعدیل باقی است - ${fund.name}`, message: `وضعیت: ${verify.status}`, type: 'error', persistent: true });
                        log(`مغایرت پس از تعدیل برای ${fund.name} باقی است.`, 'error');
                    }
                }
            } catch (e) { log(`Post-adjustment check error for ${fund.name}: ${e.message}`, 'warn'); }
        }
    } 
    // --- Data Gathering Logic ---
    else if (isOnExpertPage) {
        // Persist this tab as Expert tab
        try {
            await chrome.storage.local.set({ [`expertTabId_${fund.name}`]: tabId });
        } catch {}
        if (localState[`needsExpertData_${fund.name}`]) {
            log(`در صفحه قیمت کارشناسی برای جمع‌آوری داده نهایی ${fund.name}.`);
            await chrome.storage.local.set({ [`needsExpertData_${fund.name}`]: false });
            
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
                // Mark search clicked so we don't prompt immediately
                await chrome.storage.local.set({ [`expertSearchClicked_${fund.name}`]: true, [`expertSuppressPrompt_${fund.name}`]: true });
            } else {
                log("دکمه جستجوی قیمت کارشناسی پیدا نشد.", 'warn');
            }
            
            // 2) صبر و تلاش برای بارگذاری و پایداری لیست پس از تنظیم ردیف‌ها و کلیک جستجو
            let attempts = 0;
            let allSecurityElements = document.querySelectorAll(config.securities_list_selector);
            while (attempts < 20 && allSecurityElements.length === 0) {
                await sleep(300);
                allSecurityElements = document.querySelectorAll(config.securities_list_selector);
                attempts++;
            }

            // پس از نمایان شدن اولیه، منتظر پایداری تعداد ردیف‌ها بمان
            await waitForListStabilize(config.securities_list_selector, { stableCycles: 3, intervalMs: 400, maxTries: 40 });
            allSecurityElements = document.querySelectorAll(config.securities_list_selector);
            log(`تعداد اوراق یافت‌شده: ${allSecurityElements.length}. ایندکس انتخابی: ${selectedSecurityIndex}`);
            if (allSecurityElements.length === 0) {
                log("لیست اوراق خالی است؛ کلیک مجدد روی جستجو و انتظار برای پایداری...", 'warn');
                if (expertSearchButton) {
                    try { expertSearchButton.click(); } catch {}
                    try { const form = expertSearchButton.closest('form'); if (form && form.requestSubmit) { form.requestSubmit(); } } catch {}
                }

                await waitForListStabilize(config.securities_list_selector, { stableCycles: 4, intervalMs: 500, maxTries: 50 });
                allSecurityElements = document.querySelectorAll(config.securities_list_selector);
                if (allSecurityElements.length === 0) { log("لیست اوراق پس از تلاش مجدد هم خالی است.", 'error'); return; }
            }
            
            // 3) خواندن از ردیف انتخابی - همیشه از جستجو بر اساس نام استفاده کن
            let selectedElement = null;
            let selectedRow = null;
            
            // ابتدا سعی کن از نام پیدا کنی (با استفاده از ستون‌های ثابت)
            const securityName = await chrome.storage.local.get(`selectedSecurityName_${fund.name}`);
            if (securityName[`selectedSecurityName_${fund.name}`]) {
                const targetName = securityName[`selectedSecurityName_${fund.name}`];
                log(`تلاش برای یافتن اوراق با نام: "${targetName}"`, 'info');
                
                // جستجو در تمام ردیف‌ها (مثل xpath)
                let foundRow = null;
                let foundIndex = -1;
                let bestMatch = null;
                let bestMatchScore = 0;
                
                for (let i = 0; i < allSecurityElements.length; i++) {
                    const element = allSecurityElements[i];
                    const row = element.closest('tr');
                    
                    if (row) {
                        // خواندن نام از ستون ثابت (ستون 1)
                        const nameCell = row.querySelector(`td:nth-child(${FIXED_COLUMNS.name})`);
                        if (nameCell) {
                            const rowName = nameCell.innerText.trim();
                            
                            // تطبیق دقیق
                            if (rowName === targetName) {
                                foundRow = row;
                                foundIndex = i;
                                log(`اوراق با تطبیق دقیق در ردیف ${i + 1}: "${rowName}"`, 'success');
                                break;
                            }
                            
                            // تطبیق جزئی
                            if (rowName.includes(targetName) || targetName.includes(rowName)) {
                                const matchScore = Math.min(rowName.length, targetName.length) / Math.max(rowName.length, targetName.length);
                                if (matchScore > bestMatchScore) {
                                    bestMatchScore = matchScore;
                                    bestMatch = { row: row, index: i, name: rowName };
                                }
                            }
                        }
                    }
                }
                
                // استفاده از بهترین تطبیق اگر تطبیق دقیق پیدا نشد
                if (!foundRow && bestMatch && bestMatchScore > 0.5) {
                    foundRow = bestMatch.row;
                    foundIndex = bestMatch.index;
                    log(`اوراق با بهترین تطبیق (${Math.round(bestMatchScore * 100)}%) در ردیف ${foundIndex + 1}: "${bestMatch.name}"`, 'success');
                }
                
                                 if (foundRow) {
                     selectedElement = allSecurityElements[foundIndex];
                     selectedRow = foundRow;
                     
                     // Log the found row details for debugging
                     const rowText = selectedRow.innerText.trim();
                     log(`ردیف یافت شده: "${rowText.substring(0, 100)}..."`, 'info');
                     
                     // دیباگ: نمایش شماره ردیف واقعی
                     const table = selectedRow.closest('table');
                     if (table) {
                         const allRows = table.querySelectorAll('tr');
                         const tbodyRows = table.querySelectorAll('tbody tr');
                         
                         let tbodyIndex = -1;
                         let totalIndex = -1;
                         
                         for (let i = 0; i < tbodyRows.length; i++) {
                             if (tbodyRows[i] === selectedRow) {
                                 tbodyIndex = i + 1;
                                 break;
                             }
                         }
                         
                         for (let i = 0; i < allRows.length; i++) {
                             if (allRows[i] === selectedRow) {
                                 totalIndex = i + 1;
                                 break;
                             }
                         }
                         
                         log(`🔍 دیباگ انتخاب ردیف: tbody=${tbodyIndex}, total=${totalIndex}, target="${targetName}"`, 'info');
                     }
                 } else {
                     log(`اوراق "${targetName}" در جدول یافت نشد.`, 'warn');
                     log(`اوراق‌های موجود: ${allSecurityElements.map(el => `"${el.innerText.trim()}"`).join(', ')}`, 'info');
                 }
            }
            
            // اگر از نام پیدا نشد، از ایندکس استفاده کن
            if (!selectedElement) {
                log(`تلاش برای یافتن اوراق با ایندکس: ${selectedSecurityIndex}`, 'info');
                const normalizedIndex = Math.max(0, parseInt(selectedSecurityIndex || 0) - 1);
                selectedElement = allSecurityElements[normalizedIndex] || allSecurityElements[selectedSecurityIndex];
                
                if (selectedElement) {
                    selectedRow = selectedElement.closest('tr');
                    log(`اوراق با ایندکس ${normalizedIndex} یافت شد.`, 'success');
                } else {
                    log(`پیدا کردن اوراق در ردیف ${selectedSecurityIndex} ناموفق بود. تعداد کل: ${allSecurityElements.length}`, 'error');
                }
            }
            
            if (!selectedElement || !selectedRow) {
                
                // If we still can't find the security, ask user to select again
                log("اوراق انتخابی یافت نشد. درخواست انتخاب مجدد...", 'warn');
                await chrome.storage.local.remove([`selectedSecurityIndex_${fund.name}`, `selectedSecurityName_${fund.name}`]);
                
                // Re-expand the list and ask for selection
                const securityElements = document.querySelectorAll(config.securities_list_selector);
                if (securityElements.length > 0) {
                    const securities = Array.from(securityElements).map(el => el.innerText.trim());
                    askForSecurity(securities, async (chosenIndex) => {
                        const selectedSecurityName = securities[parseInt(chosenIndex)];
                        await chrome.storage.local.set({ 
                            [`selectedSecurityIndex_${fund.name}`]: parseInt(chosenIndex), 
                            [`selectedSecurityName_${fund.name}`]: selectedSecurityName
                        });
                        log(`اوراق "${selectedSecurityName}" در ردیف ${chosenIndex} برای ${fund.name} انتخاب شد. در حال ادامه...`);
                        // Continue with the new selection
                        const selectedElement = securityElements[parseInt(chosenIndex)];
                        const selectedRow = selectedElement.closest('tr');
                        
                        // خواندن مقادیر از ستون‌های ثابت
                        const values = readValuesFromFixedColumns(selectedRow);
                        let sellableQuantity = values.sellable;
                        let expertPrice = values.expert;
                        
                        if (sellableQuantity !== null && expertPrice !== null) {
                            await processExpertData(fund, config, sellableQuantity, expertPrice, localState);
                        }
                    });
                }
                return; 
            }
            selectedRow = selectedElement.closest('tr');
            if (!selectedRow) { log("پیدا کردن ردیف والد ناموفق بود.", 'error'); return; }
            
                                                     // استفاده از ستون‌های ثابت برای خواندن مقادیر
               log('استفاده از ستون‌های ثابت برای خواندن مقادیر', 'info');
               
               // دریافت شماره ردیف واقعی
               const actualRowNumberData = await chrome.storage.local.get(`actualRowNumber_${fund.name}`);
               const targetRowNumber = actualRowNumberData[`actualRowNumber_${fund.name}`] || null;
               
               const values = readValuesFromFixedColumns(selectedRow, targetRowNumber);
               let sellableQuantity = values.sellable;
               let expertPrice = values.expert;
             
             log(`sellableQuantity=${sellableQuantity}, expertPrice=${expertPrice}`);
             
             // دیباگ: نمایش داده‌های ردیف‌های اطراف
             const table = selectedRow.closest('table');
             if (table) {
                 const tbodyRows = table.querySelectorAll('tbody tr');
                 const currentIndex = Array.from(tbodyRows).indexOf(selectedRow);
                 
                 log(`🔍 دیباگ داده‌های ردیف‌های اطراف:`, 'info');
                 
                 // نمایش ردیف‌های قبل و بعد
                 for (let i = Math.max(0, currentIndex - 2); i <= Math.min(tbodyRows.length - 1, currentIndex + 2); i++) {
                     const row = tbodyRows[i];
                     const nameCell = row.querySelector(`td:nth-child(${FIXED_COLUMNS.name})`);
                     const sellableCell = row.querySelector(`td:nth-child(${FIXED_COLUMNS.sellable})`);
                     const expertCell = row.querySelector(`td:nth-child(${FIXED_COLUMNS.expert})`);
                     
                     const name = nameCell ? nameCell.innerText.trim() : '';
                     const sellable = sellableCell ? parseNumberLoose(sellableCell.innerText || sellableCell.textContent || '') : null;
                     const expert = expertCell ? parseNumberLoose(expertCell.innerText || expertCell.textContent || '') : null;
                     
                     const marker = i === currentIndex ? '👉' : '  ';
                     log(`${marker} ردیف ${i + 1}: نام="${name}", مانده=${sellable}, قیمت=${expert}`, 'info');
                 }
             }
            if (sellableQuantity === null || expertPrice === null) { 
                log("خواندن داده از ردیف انتخابی ناموفق بود.", 'error'); 
                log("تلاش برای نمایش اطلاعات جدول برای دیباگ...", 'info');
                
                // نمایش اطلاعات جدول برای دیباگ
                if (table) {
                    const thead = table.querySelector('thead');
                    if (thead) {
                        const headers = thead.querySelectorAll('th, td');
                        log(`ستون‌های موجود: ${Array.from(headers).map((h, i) => `${i + 1}: "${h.innerText.trim()}"`).join(', ')}`, 'info');
                    }
                }
                
                const rowCells = selectedRow.querySelectorAll('td');
                log(`محتویات ردیف انتخابی: ${Array.from(rowCells).map((c, i) => `${i + 1}: "${c.innerText.trim()}"`).join(', ')}`, 'info');
                return; 
            }

            // Continue with the found data
            await processExpertData(fund, config, sellableQuantity, expertPrice, localState);
            // Allow prompting again in future expert sessions
            await chrome.storage.local.set({ [`expertSuppressPrompt_${fund.name}`]: false });
        }
    }
}

// --- Tab Management ---
let isActiveTab = false;
let tabId = null;
let isBotManagedTab = false;

async function checkIfActiveTab() {
    try {
        const resp = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB' });
        if (resp && resp.ok && resp.tab) {
            tabId = resp.tab.id;
            isActiveTab = true;
            log(`تب فعال شناسایی شد: ${tabId}`, 'info');
        } else {
            isActiveTab = false;
        }
    } catch (e) {
        log(`خطا در بررسی تب فعال: ${e.message}`, 'error');
        isActiveTab = false;
    }
}

async function checkIfBotManagedTab() {
    try {
        // Check if this tab was opened by the bot
        const stored = await chrome.storage.local.get('botManagedTabs');
        const botManagedTabs = stored.botManagedTabs || [];
        
        if (tabId && botManagedTabs.includes(tabId)) {
            isBotManagedTab = true;
            log(`تب ${tabId} توسط ربات مدیریت می‌شود.`, 'info');
        } else {
            isBotManagedTab = false;
            log(`تب ${tabId} توسط کاربر باز شده است.`, 'warn');
        }
    } catch (e) {
        log(`خطا در بررسی تب مدیریت شده: ${e.message}`, 'error');
        isBotManagedTab = false;
    }
}

async function shouldRunOnThisTab() {
    // Check if this tab is active
    await checkIfActiveTab();
    
    // Check if this tab is managed by the bot
    await checkIfBotManagedTab();
    
    // Only run on bot-managed tabs
    if (!isBotManagedTab) {
        log("این تب توسط کاربر باز شده است. ربات روی آن کار نمی‌کند.", 'info');
        return false;
    }
    
    // Get active fund from storage
    const stored = await chrome.storage.sync.get('activeFund');
    const activeFund = stored.activeFund;
    
    if (!activeFund) {
        log("هیچ صندوق فعالی یافت نشد.", 'warn');
        return false;
    }
    
    // Get fund configuration to check URLs
    try {
        const authStored = await chrome.storage.sync.get('authToken');
        const token = authStored.authToken || '';
        const headers = token ? { 'token': token } : {};
        const response = await fetch(`${API_BASE_URL}/configurations/${activeFund}`, {
            headers: headers
        });
        
        if (!response.ok) {
            log(`خطا در دریافت تنظیمات صندوق ${activeFund}`, 'error');
            return false;
        }
        
        const config = await response.json();
        const currentUrl = window.location.href;
        
        // Check if current URL matches any of the fund's configured URLs
        const navUrl = config.fund_nav_page_url || config.nav_page_url;
        const expertUrl = config.fund_expert_page_url || config.expert_price_page_url;
        
        const isNavPage = navUrl && areUrlsMatching(currentUrl, navUrl);
        const isExpertPage = expertUrl && areUrlsMatching(currentUrl, expertUrl);
        
        if (isNavPage || isExpertPage) {
            log(`صفحه مطابق با صندوق ${activeFund} یافت شد: ${isNavPage ? 'NAV' : 'Expert'}`, 'info');
            return true;
        } else {
            log(`صفحه فعلی با صندوق ${activeFund} مطابقت ندارد.`, 'warn');
            return false;
        }
        
    } catch (e) {
        log(`خطا در بررسی URL: ${e.message}`, 'error');
        return false;
    }
}

// --- Startup and Listeners ---
async function startMonitoring() {
    await sleep(2000);
    
    // Check if we should run on this tab
    const shouldRun = await shouldRunOnThisTab();
    if (!shouldRun) {
        log("ربات در این تب اجرا نمی‌شود.", 'info');
        return;
    }
    
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
    monitoringInterval = setInterval(async () => {
        // Check again if we should still run on this tab
        const shouldStillRun = await shouldRunOnThisTab();
        if (!shouldStillRun) {
            log("ربات متوقف شد - تب دیگر فعال نیست یا URL تغییر کرده.", 'warn');
            clearInterval(monitoringInterval);
            return;
        }
        
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



// Only start monitoring if this is a relevant tab
shouldRunOnThisTab().then(shouldRun => {
    if (shouldRun) {
startMonitoring();
    }
});

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

// Background-driven orchestration for persistent tabs
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	(async () => {
		try {
			if (!request || !request.type) {
				if (sendResponse) sendResponse({ ok: false, error: 'Invalid request' });
				return;
			}
			if (request.type === 'RUN_EXPERT_REFRESH_AND_READ') {
				const fundName = request.fund_name;
				const cfg = request.config || {};
				// Ensure we are on Expert page by selectors existing
				const increaseRowsInput = document.querySelector(cfg.increase_rows_selector);
				const expertSearchButton = document.querySelector(cfg.expert_search_button_selector);
				if (increaseRowsInput) {
					increaseRowsInput.value = '';
					increaseRowsInput.value = 1000;
					try { increaseRowsInput.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
					try { increaseRowsInput.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
				}
				if (expertSearchButton) {
					try { expertSearchButton.click(); } catch {}
					try { const form = expertSearchButton.closest('form'); if (form && form.requestSubmit) form.requestSubmit(); } catch {}
					try { expertSearchButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })); } catch {}
				}
				await waitForListStabilize(cfg.securities_list_selector, { stableCycles: 3, intervalMs: 400, maxTries: 50 });
				const state = await chrome.storage.local.get([
					`selectedSecurityIndex_${fundName}`,
					`selectedSecurityName_${fundName}`,
					`navCheckData_${fundName}`
				]);
				const selectedSecurityIndex = state[`selectedSecurityIndex_${fundName}`];
				let rows = document.querySelectorAll(cfg.securities_list_selector);
				const normalizedIndex = Math.max(0, parseInt(selectedSecurityIndex || 0) - 1);
				let selectedElement = rows[normalizedIndex] || rows[selectedSecurityIndex];
				if (!selectedElement) {
					const needle = state[`selectedSecurityName_${fundName}`];
					if (needle) {
						for (let i = 0; i < rows.length; i++) { if ((rows[i].innerText || '').includes(needle)) { selectedElement = rows[i]; break; } }
					}
				}
				if (!selectedElement) { return sendResponse && sendResponse({ ok: false, error: 'not_found' }); }
				const row = selectedElement.closest('tr');
				const values = readValuesFromFixedColumns(row);
				let sellableQuantity = values.sellable;
				let expertPrice = values.expert;
				if (sellableQuantity == null || expertPrice == null) { return sendResponse && sendResponse({ ok: false, error: 'read_error' }); }
				const resp = await fetch(`${API_BASE_URL}/check-nav`, {
					method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						fund_name: fundName,
						nav_on_page: state[`navCheckData_${fundName}`]?.nav_on_page,
						total_units: state[`navCheckData_${fundName}`]?.total_units,
						sellable_quantity: sellableQuantity,
						expert_price: expertPrice
					})
				});
				const data = await resp.json();
				const suggested = (data && (data.suggested_nav ?? data.suggested ?? data.new_nav)) ?? null;
				log(`Expert message-run: suggested_nav=${suggested}`, 'success');
				try { await chrome.storage.local.set({ [`needsExpertData_${fundName}`]: false }); } catch {}
				// Show persistent notification so it appears in popup's last notifications
				await showNotification({
					title: `🚨 نیاز به تعدیل NAV - ${fundName}`,
					message: suggested !== null ? `قیمت پیشنهادی جدید: ${suggested}` : (data?.message || 'نتیجه دریافت شد.'),
					type: 'error',
					persistent: true,
					buttons: [
						{
							id: 'recheck-btn',
							text: 'تعدیل زدم، دوباره چک کن',
							callback: async () => {
								const ids = await chrome.storage.local.get([`navTabId_${fundName}`]);
								const navTabId = ids[`navTabId_${fundName}`];
								if (navTabId) {
									await chrome.runtime.sendMessage({ type: 'SEND_MESSAGE_TO_TAB', tabId: navTabId, message: { type: 'RUN_NAV_RECHECK', config: { nav_search_button_selector: cfg.nav_search_button_selector } } });
									await chrome.runtime.sendMessage({ type: 'ACTIVATE_TAB', tabId: navTabId });
								}
							}
						}
					]
				});
				
				// Also show desktop notification
				await showDesktopNotification({
					id: `nav_adjustment_${fundName}_${Date.now()}`,
					title: '🚨 نیاز به تعدیل NAV!',
					message: `صندوق ${fundName}: ${suggested !== null ? `قیمت پیشنهادی ${suggested}` : 'نیاز به بررسی'}`,
					priority: 2,
					requireInteraction: true,
					buttons: [
						{ text: 'تعدیل زدم، دوباره چک کن' },
						{ text: 'بستن' }
					]
				});
				return sendResponse && sendResponse({ ok: true, data });
			}
			if (request.type === 'RUN_NAV_RECHECK') {
				const cfg = request.config || {};
				const btn = document.querySelector(cfg.nav_search_button_selector);
				if (btn) { try { btn.click(); } catch {} }
				return sendResponse && sendResponse({ ok: true });
			}
			if (request.type === 'REFRESH_SECURITY_DATA') {
				const fundName = request.fundName;
				try {
					// Get fund configuration
					const authStored = await chrome.storage.sync.get('authToken');
					const token = authStored.authToken || '';
					const response = await fetch(`${API_BASE_URL}/configurations/${fundName}`, {
						headers: { 'token': token }
					});
					
					if (!response.ok) {
						log('خطا در دریافت تنظیمات صندوق', 'error');
						return sendResponse && sendResponse({ ok: false, error: 'config_error' });
					}
					
					const config = await response.json();
					
					// Get current selected security
					const state = await chrome.storage.local.get([
						`selectedSecurityIndex_${fundName}`,
						`selectedSecurityName_${fundName}`
					]);
					
					const selectedSecurityIndex = state[`selectedSecurityIndex_${fundName}`];
					const selectedSecurityName = state[`selectedSecurityName_${fundName}`];
					
					if (!selectedSecurityName) {
						log('هیچ اوراقی انتخاب نشده است', 'warn');
						return sendResponse && sendResponse({ ok: false, error: 'no_security_selected' });
					}
					
					// Find the selected row
					let rows = document.querySelectorAll(config.securities_list_selector);
					const normalizedIndex = Math.max(0, parseInt(selectedSecurityIndex || 0) - 1);
					let selectedElement = rows[normalizedIndex] || rows[selectedSecurityIndex];
					
					if (!selectedElement) {
						// Try to find by name with improved logic
						log(`تلاش برای یافتن اوراق با نام: "${selectedSecurityName}"`, 'info');
						
						let bestMatch = -1;
						let bestMatchScore = 0;
						
						for (let i = 0; i < rows.length; i++) {
							const elementText = rows[i].innerText.trim();
							
							// Exact match
							if (elementText === selectedSecurityName) {
								selectedElement = rows[i];
								log(`اوراق با تطبیق دقیق در ردیف ${i} یافت شد.`, 'success');
								break;
							}
							
							// Partial match with scoring
							if (elementText.includes(selectedSecurityName) || selectedSecurityName.includes(elementText)) {
								const matchScore = Math.min(elementText.length, selectedSecurityName.length) / Math.max(elementText.length, selectedSecurityName.length);
								if (matchScore > bestMatchScore) {
									bestMatchScore = matchScore;
									bestMatch = i;
								}
							}
						}
						
						// Use best match if no exact match found
						if (!selectedElement && bestMatch >= 0 && bestMatchScore > 0.5) {
							selectedElement = rows[bestMatch];
							log(`اوراق با بهترین تطبیق (${Math.round(bestMatchScore * 100)}%) در ردیف ${bestMatch} یافت شد.`, 'success');
						}
					}
					
					if (!selectedElement) {
						log('اوراق انتخاب شده یافت نشد', 'error');
						return sendResponse && sendResponse({ ok: false, error: 'security_not_found' });
					}
					
					const row = selectedElement.closest('tr');
					
					// Read values using fixed columns
					// دریافت شماره ردیف واقعی
					const actualRowNumber = await chrome.storage.local.get(`actualRowNumber_${fundName}`);
					const targetRowNumber = actualRowNumber[`actualRowNumber_${fundName}`];
					
					const values = readValuesFromFixedColumns(row, targetRowNumber);
					let sellableQuantity = values.sellable;
					let expertPrice = values.expert;
					
					                    // Store the values
                    await chrome.storage.local.set({
                        [`sellableQuantity_${fundName}`]: sellableQuantity,
                        [`expertPrice_${fundName}`]: expertPrice,
                        [`rowNumber_${fundName}`]: values.rowNumber
                    });
                    
                                         // مقایسه با شماره ردیف واقعی
                     const storedActualRowNumber = await chrome.storage.local.get(`actualRowNumber_${fundName}`);
                     if (storedActualRowNumber[`actualRowNumber_${fundName}`] && storedActualRowNumber[`actualRowNumber_${fundName}`] !== values.rowNumber) {
                         log(`⚠️ شماره ردیف متفاوت در REFRESH! استفاده از شماره ردیف واقعی: ${storedActualRowNumber[`actualRowNumber_${fundName}`]}`, 'warn');
                         values.rowNumber = storedActualRowNumber[`actualRowNumber_${fundName}`];
                         
                         // بروزرسانی storage با شماره ردیف درست
                         await chrome.storage.local.set({
                             [`rowNumber_${fundName}`]: values.rowNumber
                         });
                     }
					
					log(`اطلاعات بروزرسانی شد: ردیف ${values.rowNumber}, مانده=${sellableQuantity}, قیمت=${expertPrice}`, 'success');
					
					// ارسال نتایج به popup
					try {
						await chrome.runtime.sendMessage({
							type: 'SECURITY_DATA_UPDATED',
							data: {
								securityName: selectedSecurityName,
								sellableQuantity: sellableQuantity,
								expertPrice: expertPrice,
								rowNumber: values.rowNumber
							}
						});
					} catch (e) {
						// Ignore errors if popup is not open
					}
					
					return sendResponse && sendResponse({ 
						ok: true, 
						data: { 
							securityName: selectedSecurityName,
							sellableQuantity: sellableQuantity,
							expertPrice: expertPrice,
							rowNumber: values.rowNumber
						}
					});
					
				} catch (error) {
					log(`خطا در بروزرسانی اطلاعات: ${error.message}`, 'error');
					return sendResponse && sendResponse({ ok: false, error: error.message });
				}
			}
			if (request.type === 'TEST_SELECTORS') {
				const fundName = request.fundName;
				try {
					// Test fixed columns instead of selectors
					const table = document.querySelector('#adjustedIpList');
					if (!table) {
						log('جدول یافت نشد', 'error');
						return sendResponse && sendResponse({ ok: false, error: 'table_not_found' });
					}
					
					const rows = table.querySelectorAll('tbody tr');
					log(`تست ستون‌های ثابت: ${rows.length} ردیف یافت شد`, 'info');
					
					const results = {
						sellable_quantity: {
							selector: `td:nth-child(${FIXED_COLUMNS.sellable})`,
							count: rows.length,
							sampleValues: []
						},
						expert_price: {
							selector: `td:nth-child(${FIXED_COLUMNS.expert})`,
							count: rows.length,
							sampleValues: []
						}
					};
					
					// Get sample values from first 5 rows
					for (let i = 0; i < Math.min(5, rows.length); i++) {
						const row = rows[i];
						
						// Test sellable quantity column
						const sellableCell = row.querySelector(`td:nth-child(${FIXED_COLUMNS.sellable})`);
						if (sellableCell) {
							const text = sellableCell.innerText || sellableCell.textContent || '';
							const number = parseNumberLoose(text);
							results.sellable_quantity.sampleValues.push({
								text: text.trim(),
								number: number
							});
						}
						
						// Test expert price column
						const expertCell = row.querySelector(`td:nth-child(${FIXED_COLUMNS.expert})`);
						if (expertCell) {
							const text = expertCell.innerText || expertCell.textContent || '';
							const number = parseNumberLoose(text);
							results.expert_price.sampleValues.push({
								text: text.trim(),
								number: number
							});
						}
					}
					
					log(`تست ستون‌های ثابت: ستون ${FIXED_COLUMNS.sellable} و ${FIXED_COLUMNS.expert}`, 'info');
					
					// ارسال نتایج به popup
					try {
						await chrome.runtime.sendMessage({
							type: 'SELECTOR_TEST_RESULTS',
							data: results
						});
					} catch (e) {
						// Ignore errors if popup is not open
					}
					
					return sendResponse && sendResponse({ ok: true, data: results });
					
				} catch (error) {
					log(`خطا در تست ستون‌های ثابت: ${error.message}`, 'error');
					return sendResponse && sendResponse({ ok: false, error: error.message });
				}
			}
		} catch (e) {
			log(`Message handler error: ${e.message}`, 'error');
			if (sendResponse) {
				try {
					sendResponse({ ok: false, error: e.message });
				} catch (responseError) {
					console.error('Error sending response:', responseError);
				}
			}
		}
	})();
	return true; // keep channel open for async sendResponse
});

