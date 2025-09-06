// Manual navigation script for NAV Checker
// Run this in Chrome DevTools console to manually navigate to correct pages

(function() {
console.log('🧭 Manual Navigation for NAV Checker...');

const API_BASE_URL = 'https://chabokan.irplatforme.ir';

async function manualNavigate() {
    console.log('\n1️⃣ دریافت auth token...');
    
    // Get auth token
    const stored = await chrome.storage.sync.get('authToken');
    const authToken = stored.authToken || '';
    
    if (!authToken) {
        console.log('❌ نیاز به login دارید');
        return;
    }
    
    console.log('✅ Auth token موجود');
    
    console.log('\n2️⃣ دریافت لیست صندوق‌ها...');
    
    // Get funds
    try {
        const headers = { 'token': authToken };
        const fundsResponse = await fetch(`${API_BASE_URL}/funds`, {
            headers: headers,
            method: 'GET',
            mode: 'cors'
        });
        
        if (!fundsResponse.ok) {
            console.log('❌ نتوانستم صندوق‌ها را دریافت کنم');
            return;
        }
        
        const funds = await fundsResponse.json();
        console.log(`✅ ${funds.length} صندوق پیدا شد`);
        
        if (funds.length === 0) {
            console.log('❌ هیچ صندوقی یافت نشد');
            return;
        }
        
        const fund = funds[0]; // Use first fund
        console.log(`🎯 استفاده از صندوق: ${fund.name}`);
        
        console.log('\n3️⃣ دریافت configuration...');
        
        // Get configuration
        const configResponse = await fetch(`${API_BASE_URL}/configurations/${fund.name}`, {
            headers: headers,
            method: 'GET',
            mode: 'cors'
        });
        
        if (!configResponse.ok) {
            console.log('❌ نتوانستم configuration دریافت کنم');
            return;
        }
        
        const config = await configResponse.json();
        console.log('✅ Configuration دریافت شد');
        
        const navUrl = config.nav_page_url;
        const expertUrl = config.expert_price_page_url;
        
        console.log(`\n📍 URL های موجود:`);
        console.log(`NAV: ${navUrl}`);
        console.log(`Expert: ${expertUrl}`);
        console.log(`فعلی: ${window.location.href}`);
        
        console.log('\n4️⃣ انتخاب مقصد...');
        
        // Ask user where to go
        const choice = prompt('کدام صفحه؟\n1 = NAV\n2 = Expert\n3 = هر دو (در تب‌های جداگانه)', '1');
        
        if (choice === '1' && navUrl) {
            console.log('🚀 انتقال به صفحه NAV...');
            window.location.href = navUrl;
        } else if (choice === '2' && expertUrl) {
            console.log('🚀 انتقال به صفحه Expert...');
            window.location.href = expertUrl;
        } else if (choice === '3') {
            console.log('🚀 باز کردن هر دو صفحه...');
            
            if (navUrl) {
                window.open(navUrl, '_blank');
                console.log('✅ صفحه NAV در تب جدید باز شد');
            }
            
            if (expertUrl) {
                window.open(expertUrl, '_blank');
                console.log('✅ صفحه Expert در تب جدید باز شد');
            }
        } else {
            console.log('❌ انتخاب نامعتبر');
        }
        
    } catch (error) {
        console.log(`❌ خطا: ${error.message}`);
    }
}

// Run the navigation
manualNavigate();
})();
