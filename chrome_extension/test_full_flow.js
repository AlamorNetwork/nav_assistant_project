// Complete test flow for NAV Checker
// Run this in Chrome DevTools console on any page

(function() {
console.log('🚀 تست کامل فلوی NAV Checker...');

const API_BASE_URL = 'https://chabokan.irplatforme.ir';

async function testFullFlow() {
    console.log('\n1️⃣ بررسی Auth Token...');
    let authToken = '';
    try {
        const stored = await chrome.storage.sync.get('authToken');
        authToken = stored.authToken || '';
        console.log(`✅ Auth token: ${authToken ? '✓ موجود' : '❌ ناموجود'}`);
    } catch (error) {
        console.log(`❌ خطا در دریافت token: ${error.message}`);
    }
    
    if (!authToken) {
        console.log('⚠️ ابتدا باید در popup وارد شوید');
        return;
    }
    
    console.log('\n2️⃣ تست endpoint های اصلی...');
    
    // Test health
    try {
        const healthResponse = await fetch(`${API_BASE_URL}/health`);
        console.log(`✅ Health: ${healthResponse.status} ${healthResponse.statusText}`);
    } catch (error) {
        console.log(`❌ Health failed: ${error.message}`);
    }
    
    // Test funds
    try {
        const headers = { 'token': authToken };
        const fundsResponse = await fetch(`${API_BASE_URL}/funds`, {
            headers: headers,
            method: 'GET',
            mode: 'cors'
        });
        
        console.log(`✅ Funds: ${fundsResponse.status} ${fundsResponse.statusText}`);
        
        if (fundsResponse.ok) {
            const funds = await fundsResponse.json();
            console.log(`📊 تعداد صندوق‌ها: ${funds.length}`);
            
            if (funds.length > 0) {
                const testFund = funds[0];
                console.log(`🎯 تست با صندوق: ${testFund.name}`);
                
                // Test configuration
                console.log('\n3️⃣ تست Configuration...');
                try {
                    const configResponse = await fetch(`${API_BASE_URL}/configurations/${testFund.name}`, {
                        headers: headers,
                        method: 'GET',
                        mode: 'cors'
                    });
                    
                    console.log(`✅ Config: ${configResponse.status} ${configResponse.statusText}`);
                    
                    if (configResponse.ok) {
                        const config = await configResponse.json();
                        console.log('📋 Configuration موجود:', config);
                        
                        // Check selectors
                        console.log('\n4️⃣ بررسی Selectors...');
                        const selectors = [
                            'nav_search_button_selector',
                            'expert_search_button_selector',
                            'nav_price_selector',
                            'total_units_selector'
                        ];
                        
                        selectors.forEach(sel => {
                            if (config[sel]) {
                                console.log(`✅ ${sel}: ${config[sel]}`);
                            } else {
                                console.log(`❌ ${sel}: تعریف نشده`);
                            }
                        });
                        
                        // Test if selectors exist on current page
                        console.log('\n5️⃣ تست Selectors در صفحه فعلی...');
                        selectors.forEach(sel => {
                            if (config[sel]) {
                                try {
                                    const element = document.querySelector(config[sel]);
                                    if (element) {
                                        console.log(`✅ ${sel}: عنصر پیدا شد`);
                                    } else {
                                        console.log(`❌ ${sel}: عنصر پیدا نشد`);
                                    }
                                } catch (e) {
                                    console.log(`❌ ${sel}: خطا در selector - ${e.message}`);
                                }
                            }
                        });
                        
                    } else {
                        console.log('❌ Configuration یافت نشد');
                    }
                } catch (error) {
                    console.log(`❌ Configuration test failed: ${error.message}`);
                }
            }
        }
    } catch (error) {
        console.log(`❌ Funds test failed: ${error.message}`);
    }
    
    console.log('\n6️⃣ تست Auto-detect دکمه جستجو...');
    
    // Find search buttons automatically
    const allButtons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
    console.log(`🔍 تعداد کل دکمه‌ها: ${allButtons.length}`);
    
    const searchButtons = Array.from(allButtons).filter(btn => {
        const text = (btn.innerText || btn.value || btn.getAttribute('title') || '').toLowerCase();
        return text.includes('جستجو') || text.includes('search') || 
               text.includes('یافت') || text.includes('find');
    });
    
    console.log(`🎯 دکمه‌های جستجوی پیدا شده: ${searchButtons.length}`);
    searchButtons.forEach((btn, i) => {
        const text = (btn.innerText || btn.value || btn.getAttribute('title') || '').trim();
        const id = btn.id || '';
        const className = btn.className || '';
        console.log(`  ${i+1}. "${text}" id="${id}" class="${className}"`);
    });
    
    console.log('\n✅ تست کامل شد!');
    
    // Return summary
    return {
        authToken: !!authToken,
        serverAvailable: true,
        searchButtonsFound: searchButtons.length
    };
}

// Run the test
testFullFlow().catch(console.error);
})();
