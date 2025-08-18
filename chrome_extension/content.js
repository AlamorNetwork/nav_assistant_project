const API_BASE_URL = 'https://respina.irplatforme.ir'; // آدرس سرور جدید

console.log("NAV Assistant content script loaded.");
let monitoringInterval = null;

function displayResult(result) {
    let oldBox = document.getElementById('nav-assistant-notification');
    if (oldBox) oldBox.remove();
    if (result.status !== 'adjustment_needed') return;

    const box = document.createElement('div');
    box.id = 'nav-assistant-notification';
    box.innerHTML = `
        <div class="header"><strong>🤖 دستیار هوشمند NAV</strong><button class="close-btn">&times;</button></div>
        <div class="body"><p>⚠️ **نیاز به تعدیل NAV**</p><p>قیمت پیشنهادی جدید: <strong>${result.suggested_nav}</strong></p></div>
    `;
    
    Object.assign(box.style, {
        position: 'fixed', top: '20px', right: '20px', width: '300px',
        backgroundColor: 'white', color: '#333', zIndex: '99999',
        borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.2)',
        fontFamily: 'Vazirmatn, sans-serif', direction: 'rtl', borderTop: '5px solid #ffc107'
    });
    
    const header = box.querySelector('.header');
    Object.assign(header.style, {
        padding: '10px 15px', backgroundColor: '#f7f7f7',
        borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    });
    
    const body = box.querySelector('.body');
    Object.assign(body.style, { padding: '15px' });

    const closeBtn = box.querySelector('.close-btn');
    Object.assign(closeBtn.style, { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#888' });
    
    closeBtn.onclick = () => box.remove();
    document.body.appendChild(box);
}

async function performCheck() {
    console.log("Performing check...");
    const { activeFund } = await chrome.storage.sync.get('activeFund');
    if (!activeFund) {
        console.log("No active fund. Stopping monitor.");
        clearInterval(monitoringInterval);
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

    if (!window.location.href.startsWith(config.nav_page_url)) {
        console.log("Not on the correct page. Skipping check.");
        return;
    }
    
    try {
        const navOnPage = parseFloat(document.querySelector(config.nav_price_selector)?.innerText.replace(/,/g, ''));
        const totalUnits = parseFloat(document.querySelector(config.total_units_selector)?.innerText.replace(/,/g, ''));
        const sellableQuantity = parseFloat(document.querySelector(config.sellable_quantity_selector)?.innerText.replace(/,/g, ''));
        const expertPrice = parseFloat(document.querySelector(config.expert_price_selector)?.innerText.replace(/,/g, ''));

        if (isNaN(navOnPage) || isNaN(totalUnits)) return;

        const dataToSend = {
            fund_name: activeFund,
            nav_on_page: navOnPage,
            total_units: totalUnits,
            sellable_quantity: isNaN(sellableQuantity) ? null : sellableQuantity,
            expert_price: isNaN(expertPrice) ? null : expertPrice,
        };

        const response = await fetch(`${API_BASE_URL}/check-nav`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend)
        });
        const result = await response.json();
        console.log("Server response:", result);
        displayResult(result);
    } catch (e) {
        console.error("Error during check:", e);
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
        startMonitoring();
    }
});