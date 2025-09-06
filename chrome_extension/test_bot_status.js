// Test bot status and configuration
// Run this in Console

(function() {
console.log('🔍 Testing Bot Status...');

async function testBotStatus() {
    console.log('\n1️⃣ بررسی وضعیت ربات...');
    
    // Check bot status
    const botData = await chrome.storage.local.get(['botActive', 'botManagedTabs']);
    const syncData = await chrome.storage.sync.get(['activeFund', 'authToken']);
    
    console.log(`Bot Active: ${botData.botActive ? '✅' : '❌'}`);
    console.log(`Active Fund: ${syncData.activeFund || 'تعریف نشده'}`);
    console.log(`Auth Token: ${syncData.authToken ? '✅ موجود' : '❌ ناموجود'}`);
    console.log(`Bot Managed Tabs: ${(botData.botManagedTabs || []).join(', ') || 'هیچکدام'}`);
    
    console.log('\n2️⃣ بررسی URL فعلی...');
    const currentUrl = window.location.href;
    console.log(`Current URL: ${currentUrl}`);
    
    const isRelevantPage = currentUrl.toLowerCase().includes('irbroker.com') || 
                          currentUrl.toLowerCase().includes('fund.do') || 
                          currentUrl.toLowerCase().includes('adjustedip') ||
                          currentUrl.toLowerCase().includes('navlist');
                          
    console.log(`Relevant Page: ${isRelevantPage ? '✅' : '❌'}`);
    
    console.log('\n3️⃣ تست shouldRunOnThisTab logic...');
    
    if (!botData.botActive) {
        console.log('❌ ربات غیرفعال است');
    } else if (!syncData.activeFund) {
        console.log('❌ هیچ صندوق فعالی تعریف نشده');
    } else if (!isRelevantPage) {
        console.log('❌ صفحه مرتبط نیست');
    } else {
        console.log('✅ همه شرایط برای اجرای ربات فراهم است');
        
        // Test search button finding
        console.log('\n4️⃣ تست پیدا کردن دکمه جستجو...');
        
        const allSubmitButtons = document.querySelectorAll('input[type="submit"]');
        console.log(`تعداد دکمه‌های submit: ${allSubmitButtons.length}`);
        
        if (allSubmitButtons.length > 0) {
            allSubmitButtons.forEach((btn, i) => {
                const value = btn.value || '';
                console.log(`${i+1}. "${value}"`);
            });
            
            // Test clicking the first submit button
            console.log('\n5️⃣ تست کلیک دکمه اول...');
            try {
                const firstBtn = allSubmitButtons[0];
                console.log('Clicking button:', firstBtn);
                firstBtn.click();
                console.log('✅ کلیک موفق!');
            } catch (e) {
                console.log(`❌ خطا در کلیک: ${e.message}`);
            }
        } else {
            console.log('❌ هیچ دکمه submit یافت نشد');
        }
    }
    
    console.log('\n6️⃣ راهنمای عیب‌یابی:');
    if (!botData.botActive) {
        console.log('💡 ربات را از popup فعال کنید');
    }
    if (!syncData.activeFund) {
        console.log('💡 یک صندوق را از popup انتخاب کنید');
    }
    if (!isRelevantPage) {
        console.log('💡 به صفحه irbroker.com بروید');
    }
    if (!syncData.authToken) {
        console.log('💡 در popup login کنید');
    }
}

testBotStatus();
})();
