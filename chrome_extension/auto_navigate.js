// Auto navigate to correct page and test bot
// Run this in popup console to auto-navigate

(function() {
console.log('🚀 Auto Navigation Script...');

async function autoNavigate() {
    console.log('📍 Current URL:', window.location.href);
    
    // Check if we're in popup
    if (window.location.href.includes('chrome-extension')) {
        console.log('✅ در popup هستیم. انتقال به صفحه NAV...');
        
        // Navigate to NAV page
        const navUrl = 'https://krzetf5.irbroker.com/fund.do?method=navList&new_search=true';
        
        // Open in new tab
        window.open(navUrl, '_blank');
        
        console.log(`✅ صفحه NAV در تب جدید باز شد: ${navUrl}`);
        console.log('💡 حالا روی تب جدید برو و F12 بزن و این script رو اجرا کن:');
        console.log(`
// Test bot on irbroker page
console.log('🔍 Testing bot on irbroker page...');
console.log('Current URL:', window.location.href);

// Check if bot should work here
const isIrbroker = window.location.href.toLowerCase().includes('irbroker.com');
console.log('Is irbroker page:', isIrbroker);

if (isIrbroker) {
    // Look for submit buttons
    const submitButtons = document.querySelectorAll('input[type="submit"]');
    console.log('Submit buttons found:', submitButtons.length);
    
    submitButtons.forEach((btn, i) => {
        console.log(\`\${i+1}. \${btn.value}\`);
    });
    
    if (submitButtons.length > 0) {
        console.log('🎯 Testing click on first submit button...');
        try {
            submitButtons[0].click();
            console.log('✅ Click successful!');
        } catch (e) {
            console.log('❌ Click failed:', e.message);
        }
    }
} else {
    console.log('❌ Not on irbroker page');
}
        `);
        
    } else {
        console.log('✅ Already on external page');
        
        // Test if this is irbroker
        const isIrbroker = window.location.href.toLowerCase().includes('irbroker.com');
        console.log('Is irbroker page:', isIrbroker);
        
        if (isIrbroker) {
            console.log('🎯 Perfect! Running bot test...');
            
            // Look for submit buttons
            const submitButtons = document.querySelectorAll('input[type="submit"]');
            console.log('Submit buttons found:', submitButtons.length);
            
            submitButtons.forEach((btn, i) => {
                const value = btn.value || '';
                console.log(`${i+1}. "${value}"`);
            });
            
            if (submitButtons.length > 0) {
                console.log('🎯 Testing click on first submit button...');
                try {
                    submitButtons[0].click();
                    console.log('✅ Click successful!');
                } catch (e) {
                    console.log('❌ Click failed:', e.message);
                }
            }
        } else {
            console.log('❌ Not on irbroker page. Navigate to:');
            console.log('https://krzetf5.irbroker.com/fund.do?method=navList&new_search=true');
        }
    }
}

autoNavigate();
})();
