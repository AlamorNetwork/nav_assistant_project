// Quick Navigate and Test
// Copy/paste this in Console

(function() {
console.log('🚀 Quick Navigate and Test...');

async function quickTest() {
    console.log(`Current URL: ${window.location.href}`);
    
    // Check if we need to navigate
    const currentUrl = window.location.href.toLowerCase();
    const isOnNavPage = currentUrl.includes('fund.do') && currentUrl.includes('navlist');
    
    console.log(`On NAV page: ${isOnNavPage}`);
    
    if (!isOnNavPage) {
        console.log('❌ نیاز به انتقال به صفحه NAV داریم');
        
        // Navigate to NAV page
        const navUrl = 'https://krzetf5.irbroker.com/fund.do?method=navList&new_search=true';
        console.log(`🚀 انتقال به: ${navUrl}`);
        window.location.href = navUrl;
        return;
    }
    
    console.log('✅ روی صفحه NAV هستیم');
    
    // Test search button detection
    console.log('\n🔍 جستجوی دکمه submit...');
    
    const allSubmitButtons = document.querySelectorAll('input[type="submit"]');
    console.log(`تعداد دکمه‌های submit: ${allSubmitButtons.length}`);
    
    allSubmitButtons.forEach((btn, i) => {
        const value = btn.value || '';
        const id = btn.id || '';
        const className = btn.className || '';
        console.log(`${i+1}. value="${value}" id="${id}" class="${className}"`);
        
        // If this looks like a search button, try clicking it
        if (value.includes('جستجو') || value.toLowerCase().includes('search') || 
            value === 'Submit' || i === 0) {
            console.log(`🎯 این دکمه مناسب به نظر می‌رسد!`);
            
            // Test if we can find it with various selectors
            const selectors = [
                `input[value="${value}"]`,
                `#${id}`,
                `.${className.split(' ')[0]}`,
                `input[type="submit"]:nth-child(${i+1})`,
                'input[type="submit"]'
            ];
            
            selectors.forEach(sel => {
                if (sel && sel !== '#' && sel !== '.') {
                    try {
                        const found = document.querySelector(sel);
                        console.log(`Selector "${sel}": ${found ? '✅' : '❌'}`);
                    } catch (e) {
                        console.log(`Selector "${sel}": ❌ (error)`);
                    }
                }
            });
            
            console.log('دکمه‌:', btn);
        }
    });
    
    // Try the most likely selector
    const likelySelectors = [
        'input[type="submit"]',
        'input[value*="جستجو"]',
        'form input[type="submit"]'
    ];
    
    console.log('\n🧪 تست selector های محتمل:');
    likelySelectors.forEach(sel => {
        try {
            const found = document.querySelector(sel);
            if (found) {
                console.log(`✅ "${sel}" -> پیدا شد: ${found.value || found.innerText}`);
                
                // Test click
                console.log('🖱️ تست کلیک...');
                try {
                    found.click();
                    console.log('✅ کلیک موفق!');
                } catch (e) {
                    console.log(`❌ خطا در کلیک: ${e.message}`);
                }
            } else {
                console.log(`❌ "${sel}" -> پیدا نشد`);
            }
        } catch (e) {
            console.log(`❌ "${sel}" -> خطا: ${e.message}`);
        }
    });
}

quickTest();
})();
