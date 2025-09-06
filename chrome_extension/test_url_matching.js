// Test URL matching logic
// Run this in Chrome DevTools console

(function() {
console.log('🔗 تست URL Matching...');

function areUrlsMatching(url1, url2) {
    if (!url1 || !url2) return false;
    
    const cleanUrl = (url) => {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname + urlObj.pathname;
        } catch {
            return url.replace(/^https?:\/\//, '').split('?')[0].split('#')[0];
        }
    };
    
    const clean1 = cleanUrl(url1).toLowerCase();
    const clean2 = cleanUrl(url2).toLowerCase();
    
    return clean1 === clean2 || clean1.includes(clean2) || clean2.includes(clean1);
}

async function testUrlMatching() {
    console.log(`📍 صفحه فعلی: ${window.location.href}`);
    
    // Get auth token
    const stored = await chrome.storage.sync.get('authToken');
    const authToken = stored.authToken || '';
    
    if (!authToken) {
        console.log('❌ نیاز به login دارید');
        return;
    }
    
    // Get active fund
    const activeFundStored = await chrome.storage.sync.get('activeFund');
    const activeFund = activeFundStored.activeFund;
    
    console.log(`🎯 صندوق فعال: ${activeFund || 'تعریف نشده'}`);
    
    if (!activeFund) {
        console.log('❌ هیچ صندوق فعالی تعریف نشده');
        return;
    }
    
    // Test configuration fetch
    try {
        const API_BASE_URL = 'https://chabokan.irplatforme.ir';
        const headers = { 'token': authToken };
        
        console.log(`📡 در حال دریافت config از: ${API_BASE_URL}/configurations/${activeFund}`);
        
        const response = await fetch(`${API_BASE_URL}/configurations/${activeFund}`, {
            headers: headers,
            method: 'GET',
            mode: 'cors'
        });
        
        console.log(`📊 پاسخ سرور: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
            const config = await response.json();
            console.log('✅ Configuration دریافت شد:', config);
            
            const currentUrl = window.location.href;
            const navUrl = config.fund_nav_page_url || config.nav_page_url;
            const expertUrl = config.fund_expert_page_url || config.expert_price_page_url;
            
            console.log('\n🔍 مقایسه URL ها:');
            console.log(`فعلی: ${currentUrl}`);
            console.log(`NAV: ${navUrl || 'تعریف نشده'}`);
            console.log(`Expert: ${expertUrl || 'تعریف نشده'}`);
            
            if (navUrl) {
                const isNavMatch = areUrlsMatching(currentUrl, navUrl);
                console.log(`🎯 NAV Match: ${isNavMatch ? '✅ بله' : '❌ خیر'}`);
            }
            
            if (expertUrl) {
                const isExpertMatch = areUrlsMatching(currentUrl, expertUrl);
                console.log(`🎯 Expert Match: ${isExpertMatch ? '✅ بله' : '❌ خیر'}`);
            }
            
        } else {
            console.log('❌ نتوانستم configuration دریافت کنم');
            
            // Test fallback matching
            console.log('\n🔧 تست Fallback URL Matching...');
            const currentUrl = window.location.href.toLowerCase();
            const hasNavKeywords = currentUrl.includes('nav') || currentUrl.includes('صافی') || currentUrl.includes('ارزش');
            const hasExpertKeywords = currentUrl.includes('expert') || currentUrl.includes('price') || currentUrl.includes('کارشناسی');
            
            console.log(`📋 NAV Keywords: ${hasNavKeywords ? '✅ پیدا شد' : '❌ پیدا نشد'}`);
            console.log(`📋 Expert Keywords: ${hasExpertKeywords ? '✅ پیدا شد' : '❌ پیدا نشد'}`);
            
            if (hasNavKeywords || hasExpertKeywords) {
                console.log(`✅ Fallback match: ${hasNavKeywords ? 'NAV' : 'Expert'} صفحه شناسایی شد`);
            } else {
                console.log('❌ هیچ match پیدا نشد');
            }
        }
        
    } catch (error) {
        console.log(`❌ خطا در تست: ${error.message}`);
        console.log('Stack:', error.stack);
    }
}

// Run the test
testUrlMatching().catch(console.error);
})();
