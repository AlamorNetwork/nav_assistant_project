console.log("NAV Assistant content script loaded and waiting.");

const API_BASE_URL = 'https://navapi.alamornetwork.ir';
let monitoringInterval = null;

// Function to display results in a modern, non-intrusive way
function displayResult(result) {
    let oldBox = document.getElementById('nav-assistant-notification');
    if (oldBox) oldBox.remove();

    if (result.status !== 'adjustment_needed') return;

    const box = document.createElement('div');
    box.id = 'nav-assistant-notification';
    box.innerHTML = `
        <div class="header">
            <strong>🤖 دستیار هوشمند NAV</strong>
            <button class="close-btn">&times;</button>
        </div>
        <div class="body">
            <p>⚠️ **نیاز به تعدیل NAV**</p>
            <p>قیمت پیشنهادی جدید: <strong>${result.suggested_nav}</strong></p>
        </div>
    `;
    
    // Styling the notification box
    Object.assign(box.style, {
        position: 'fixed', top: '20px', right: '20px', width: '300px',
        backgroundColor: 'white', color: '#333', zIndex: '99999',
        borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.2)',
        fontFamily: 'Vazirmatn, sans-serif', direction: 'rtl',
        borderTop: '5px solid #ffc107'
    });
    
    const header = box.querySelector('.header');
    Object.assign(header.style, {
        padding: '10px 15px', backgroundColor: '#f7f7f7',
        borderBottom: '1px solid #eee', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center'
    });
    
    const body = box.querySelector('.body');
    Object.assign(body.style, { padding: '15px' });

    const closeBtn = box.querySelector('.close-btn');
    Object.assign(closeBtn.style, {
        background: 'none', border: 'none', fontSize: '24px',
        cursor: 'pointer', color: '#888'
    });
    
    closeBtn.onclick = () => box.remove();
    document.body.appendChild(box);
}

// The main function that performs the check
async function performCheck() {
    console.log("Performing check...");
    
    // 1. Get active fund from storage
    const { activeFund } = await chrome.storage.sync.get('activeFund');
    if (!activeFund) {
        console.log("No active fund selected. Stopping monitor.");
        clearInterval(monitoringInterval);
        return;
    }

    // 2. Get configuration for the active fund
    let config;
    try {
        const response = await fetch(`${API_BASE_URL}/configurations/${activeFund}`);
        if (!response.ok) throw new Error('Configuration not found for the active fund.');
        config = await response.json();
    } catch (error) {
        console.error(error.message);
        return;
    }

    // 3. Check if we are on the correct page (simple check)
    if (!window.location.href.startsWith(config.nav_page_url)) {
        console.log("Not on the correct page. Skipping check.");
        return;
    }
    
    // 4. Read all data from the page using selectors from config
    try {
        const navOnPage = parseFloat(document.querySelector(config.nav_selector)?.innerText.replace(/,/g, ''));
        const totalUnits = parseFloat(document.querySelector(config.total_units_selector)?.innerText.replace(/,/g, ''));
        const sellableQuantity = parseFloat(document.querySelector(config.sellable_quantity_selector)?.innerText.replace(/,/g, ''));
        const expertPrice = parseFloat(document.querySelector(config.expert_price_selector)?.innerText.replace(/,/g, ''));

        if (isNaN(navOnPage) || isNaN(totalUnits)) {
            console.error("Could not read essential data (NAV or Total Units) from the page.");
            return;
        }

        const dataToSend = {
            fund_name: activeFund,
            nav_on_page: navOnPage,
            total_units: totalUnits,
            sellable_quantity: isNaN(sellableQuantity) ? null : sellableQuantity,
            expert_price: isNaN(expertPrice) ? null : expertPrice,
        };

        // 5. Send data to the server for analysis
        const response = await fetch(`${API_BASE_URL}/check-nav`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend)
        });
        const result = await response.json();

        console.log("Server response:", result);

        // 6. Display the result to the user
        displayResult(result);

    } catch (e) {
        console.error("An error occurred while reading data or communicating with the server:", e);
    }
}

// Start the monitoring loop
function startMonitoring() {
    // Clear any existing interval to avoid duplicates
    if (monitoringInterval) clearInterval(monitoringInterval);
    
    // Run once immediately, then every 2 minutes
    performCheck();
    monitoringInterval = setInterval(performCheck, 120000); // 120000 ms = 2 minutes
    console.log("NAV Assistant monitoring started.");
}

startMonitoring();

// Listen for changes in active fund to restart the monitor if needed
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.activeFund) {
        console.log("Active fund changed. Restarting monitor.");
        startMonitoring();
    }
});