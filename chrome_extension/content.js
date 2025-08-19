const API_BASE_URL = 'https://respina.irplatforme.ir'; // آدرس سرور شما
let monitoringInterval = null;

// --- Helper Functions ---

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function readElementValue(selector, parentElement = document) {
    try {
        const element = parentElement.querySelector(selector);
        if (!element) {
            console.warn(`Selector not found: ${selector} inside the specified parent.`);
            return null;
        }
        const value = element.value !== undefined ? element.value : element.innerText;
        return parseFloat(value.replace(/,/g, ''));
    } catch (e) {
        console.error(`Error reading selector ${selector}:`, e);
        return null;
    }
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
    Object.assign(modal.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.6)', zIndex: '10000', display: 'flex',
        alignItems: 'center', justifyContent: 'center', direction: 'rtl',
        fontFamily: 'Vazirmatn, sans-serif'
    });
    const content = modal.querySelector('.modal-content');
    Object.assign(content.style, {
        backgroundColor: 'white', padding: '30px', borderRadius: '12px',
        width: '400px', boxShadow: '0 5px 20px rgba(0,0,0,0.3)'
    });
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
    if (!activeFund) {
        if (monitoringInterval) clearInterval(monitoringInterval);
        console.log("NAV Assistant: Bot is turned off. Stopping monitor.");
        return;
    }

    let config;
    try {
        const response = await fetch(`${API_BASE_URL}/configurations/${activeFund}`);
        if (!response.ok) throw new Error('Configuration not found for active fund.');
        config = await response.json();
    } catch (error) {
        console.error(error.message);
        return;
    }
    
    const localState = await chrome.storage.local.get([`selectedSecurityIndex_${activeFund}`, 'listExpanded', 'needsExpertData', 'navCheckData']);
    const selectedSecurityIndex = localState[`selectedSecurityIndex_${activeFund}`];
    
    // --- LOGIC FOR INITIAL SETUP ---
    if (selectedSecurityIndex === undefined) {
        console.log("NAV Assistant: No security selected. Starting setup...");
        if (!areUrlsMatching(window.location.href, config.expert_price_page_url)) {
            window.location.href = config.expert_price_page_url;
            return;
        }

        if (!localState.listExpanded) {
            console.log("NAV Assistant: Expanding rows and searching...");
            const increaseRowsInput = document.querySelector(config.increase_rows_selector);
            if(increaseRowsInput) increaseRowsInput.value = 1000;
            const expertSearchButton = document.querySelector(config.expert_search_button_selector);
            if(expertSearchButton) expertSearchButton.click();
            await chrome.storage.local.set({ listExpanded: true });
        } else {
            console.log("NAV Assistant: List expanded, collecting securities...");
            const securityElements = document.querySelectorAll(config.securities_list_selector);
            if (securityElements.length === 0) {
                console.error("Securities list is empty after expanding. Check your selector.");
                return;
            }
            const securities = Array.from(securityElements).map(el => el.innerText.trim());
            
            askForSecurity(securities, async (chosenIndex) => {
                await chrome.storage.local.set({ 
                    [`selectedSecurityIndex_${activeFund}`]: parseInt(chosenIndex),
                    listExpanded: false 
                });
                console.log(`NAV Assistant: Security at index '${chosenIndex}' saved. Starting monitoring...`);
                window.location.href = config.nav_page_url;
            });
        }
        return;
    }


    // --- LOGIC FOR NAV PAGE (MAIN LOOP START) ---
    if (areUrlsMatching(window.location.href, config.nav_page_url)) {
        console.log("NAV Assistant: On NAV page. Performing TEST check.");
        
        const searchButton = document.querySelector(config.nav_search_button_selector);
        if (searchButton) searchButton.click();
        await sleep(3000);

        const navOnPage = readElementValue(config.nav_price_selector);
        const totalUnits = readElementValue(config.total_units_selector);

        if (navOnPage === null || totalUnits === null) {
            console.error("Could not read essential data (NAV or Total Units) from the page.");
            return;
        }
        
        // *** TEST LOGIC ***: Force a large difference to trigger adjustment
        const testNavOnPage = navOnPage + 50; // Add 50 to the real NAV
        console.log(`NAV Assistant: Sending FAKE NAV (${testNavOnPage}) to server for testing.`);

        const response = await fetch(`${API_BASE_URL}/check-nav`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fund_name: activeFund,
                nav_on_page: testNavOnPage, // Sending the fake value
                total_units: totalUnits,
            })
        });
        const result = await response.json();
        console.log("Server response (initial check):", result);

        if (result.status === 'adjustment_needed_more_data_required') {
            await chrome.storage.local.set({
                navCheckData: { navOnPage: navOnPage, total_units: totalUnits }, // Save the REAL data
                needsExpertData: true
            });
            window.location.href = config.expert_price_page_url;
        }
    }

    // --- LOGIC FOR EXPERT PRICE PAGE (DATA GATHERING) ---
    else if (areUrlsMatching(window.location.href, config.expert_price_page_url)) {
        if (localState.needsExpertData) {
            console.log("NAV Assistant: On Expert Price page. Gathering TEST data.");
            await chrome.storage.local.set({ needsExpertData: false });

            // *** TEST LOGIC ***: Use hardcoded values instead of reading from the page
            const sellableQuantity = 500000; // داده تستی
            const expertPrice = 10250;      // داده تستی
            console.log(`NAV Assistant: Using FAKE data for calculation: Sellable Qty=${sellableQuantity}, Expert Price=${expertPrice}`);

            const finalResponse = await fetch(`${API_BASE_URL}/check-nav`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fund_name: activeFund,
                    nav_on_page: localState.navCheckData.nav_on_page, // Use the real NAV saved earlier
                    total_units: localState.navCheckData.total_units,
                    sellable_quantity: sellableQuantity,
                    expert_price: expertPrice,
                })
            });
            const finalResult = await finalResponse.json();
            console.log("Server response (final check):", finalResult);
            
            alert(`تست موفق! قیمت پیشنهادی سرور: ${finalResult.suggested_nav}`);
            await sleep(5000);
            window.location.href = config.nav_page_url;
        }
    }
}

function startMonitoring() {
    if (monitoringInterval) clearInterval(monitoringInterval);
    performCheck();
    monitoringInterval = setInterval(performCheck, 120000);
    console.log("NAV Assistant monitoring started.");
}

startMonitoring();

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.activeFund) {
        console.log("Active fund changed. Restarting monitor.");
        chrome.storage.local.clear(() => {
            startMonitoring();
        });
    }
});