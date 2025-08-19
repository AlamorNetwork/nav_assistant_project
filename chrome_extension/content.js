const API_BASE_URL = 'https://respina.irplatforme.ir';
let monitoringInterval = null;

// --- Helper Functions ---

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function readElementValue(selector, parentElement = document) {
    try {
        const element = parentElement.querySelector(selector);
        if (!element) { console.warn(`Selector not found: ${selector}`); return null; }
        const value = element.value !== undefined ? element.value : element.innerText;
        return parseFloat(value.replace(/,/g, ''));
    } catch (e) { console.error(`Error reading selector ${selector}:`, e); return null; }
}

function areUrlsMatching(currentUrl, configuredUrl) {
    if (!configuredUrl) return false;
    const currentBaseUrl = currentUrl.split('?')[0];
    const configuredBaseUrl = configuredUrl.split('?')[0];
    return currentBaseUrl === configuredBaseUrl;
}

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

async function performCheck() {
    console.log("NAV Assistant: Starting check cycle...");
    const { activeFund } = await chrome.storage.sync.get('activeFund');
    if (!activeFund) { if (monitoringInterval) clearInterval(monitoringInterval); console.log("NAV Assistant: Bot is off."); return; }

    let config;
    try {
        const response = await fetch(`${API_BASE_URL}/configurations/${activeFund}`);
        if (!response.ok) throw new Error('Config not found.');
        config = await response.json();
    } catch (error) {
        // If context is invalidated here, it's okay, the next page load will try again.
        if (error.message.includes("Extension context invalidated")) {
            console.warn("Context was invalidated during config fetch. This is likely due to a page redirect. The script will retry on the new page.");
        } else {
            console.error(error.message);
        }
        return;
    }
    
    const localState = await chrome.storage.local.get([`selectedSecurityIndex_${activeFund}`, 'listExpanded', 'needsExpertData', 'navCheckData']);
    const selectedSecurityIndex = localState[`selectedSecurityIndex_${activeFund}`];
    
    if (selectedSecurityIndex === undefined) {
        console.log("NAV Assistant: Setup required.");
        if (!areUrlsMatching(window.location.href, config.expert_price_page_url)) { window.location.href = config.expert_price_page_url; return; }
        if (!localState.listExpanded) {
            console.log("NAV Assistant: Expanding rows...");
            const increaseRowsInput = document.querySelector(config.increase_rows_selector);
            if(increaseRowsInput) increaseRowsInput.value = 1000;
            const expertSearchButton = document.querySelector(config.expert_search_button_selector);
            if(expertSearchButton) expertSearchButton.click();
            await chrome.storage.local.set({ listExpanded: true });
        } else {
            console.log("NAV Assistant: Collecting securities...");
            const securityElements = document.querySelectorAll(config.securities_list_selector);
            if (securityElements.length === 0) { console.error("Securities list empty."); return; }
            const securities = Array.from(securityElements).map(el => el.innerText.trim());
            askForSecurity(securities, async (chosenIndex) => {
                await chrome.storage.local.set({ [`selectedSecurityIndex_${activeFund}`]: parseInt(chosenIndex), listExpanded: false });
                console.log(`NAV Assistant: Security at index '${chosenIndex}' saved.`);
                window.location.href = config.nav_page_url;
            });
        }
        return;
    }

    if (areUrlsMatching(window.location.href, config.nav_page_url)) {
        console.log("NAV Assistant: On NAV page.");
        const searchButton = document.querySelector(config.nav_search_button_selector);
        if (searchButton) searchButton.click();
        await sleep(3000);
        const navOnPage = readElementValue(config.nav_price_selector);
        const totalUnits = readElementValue(config.total_units_selector);
        if (navOnPage === null || totalUnits === null) { console.error("Could not read NAV/Total Units."); return; }
        const response = await fetch(`${API_BASE_URL}/check-nav`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fund_name: activeFund, nav_on_page: navOnPage, total_units: totalUnits })
        });
        const result = await response.json();
        console.log("Server response (initial):", result);
        if (result.status === 'adjustment_needed_more_data_required') {
            await chrome.storage.local.set({ navCheckData: { nav_on_page: navOnPage, total_units: totalUnits }, needsExpertData: true });
            window.location.href = config.expert_price_page_url;
        }
    } else if (areUrlsMatching(window.location.href, config.expert_price_page_url)) {
        if (localState.needsExpertData) {
            console.log("NAV Assistant: On Expert Price page for data gathering.");
            await chrome.storage.local.set({ needsExpertData: false });
            const allSecurityElements = document.querySelectorAll(config.securities_list_selector);
            const selectedElement = allSecurityElements[selectedSecurityIndex];
            if (!selectedElement) { console.error(`Could not find security at index: ${selectedSecurityIndex}.`); return; }
            const selectedRow = selectedElement.closest('tr');
            if (!selectedRow) { console.error(`Could not find parent row.`); return; }
            const sellableQuantity = readElementValue(config.sellable_quantity_selector, selectedRow);
            const expertPrice = readElementValue(config.expert_price_selector, selectedRow);
            if (sellableQuantity === null || expertPrice === null) { console.error("Could not read data from selected row."); return; }
            const finalResponse = await fetch(`${API_BASE_URL}/check-nav`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fund_name: activeFund, nav_on_page: localState.navCheckData.nav_on_page,
                    total_units: localState.navCheckData.total_units,
                    sellable_quantity: sellableQuantity, expert_price: expertPrice
                })
            });
            const finalResult = await finalResponse.json();
            console.log("Server response (final):", finalResult);
            alert(`محاسبه انجام شد! قیمت پیشنهادی سرور: ${finalResult.suggested_nav}`);
            await sleep(5000);
            window.location.href = config.nav_page_url;
        }
    }
}

async function startMonitoring() {
    // *** NEW: Add a delay before starting the first check ***
    await sleep(2000); // Wait 2 seconds for the page to stabilize

    if (monitoringInterval) clearInterval(monitoringInterval);
    performCheck();
    monitoringInterval = setInterval(performCheck, 120000);
    console.log("NAV Assistant monitoring started.");
}

startMonitoring();

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.activeFund) {
        console.log("Active fund changed. Restarting monitor.");
        chrome.storage.local.clear(() => { startMonitoring(); });
    }
});