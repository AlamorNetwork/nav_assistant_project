// Complete Debug - Find out why bot still doesn't work
// Run this step by step in Console

(function() {
console.log('🔧 Complete Debug Session...');

async function completeDebug() {
    console.log('\n=== STEP 1: Extension State ===');
    
    // Check storage
    const localStorage = await chrome.storage.local.get();
    const syncStorage = await chrome.storage.sync.get();
    
    console.log('📊 Local Storage:', localStorage);
    console.log('📊 Sync Storage:', syncStorage);
    
    const botActive = localStorage.botActive;
    const activeFund = syncStorage.activeFund;
    const authToken = syncStorage.authToken;
    
    console.log(`\n🤖 Bot Status:`);
    console.log(`- Bot Active: ${botActive ? '✅ YES' : '❌ NO'}`);
    console.log(`- Active Fund: ${activeFund || '❌ NOT SET'}`);
    console.log(`- Auth Token: ${authToken ? '✅ EXISTS' : '❌ MISSING'}`);
    
    if (!botActive) {
        console.log('\n❌ PROBLEM: Bot is not active!');
        console.log('💡 SOLUTION: Go to popup and click "فعال کردن صندوق"');
        return;
    }
    
    if (!activeFund) {
        console.log('\n❌ PROBLEM: No active fund!');
        console.log('💡 SOLUTION: Select a fund in popup and activate');
        return;
    }
    
    if (!authToken) {
        console.log('\n❌ PROBLEM: No auth token!');
        console.log('💡 SOLUTION: Login in popup first');
        return;
    }
    
    console.log('\n✅ All basic requirements are met');
    
    console.log('\n=== STEP 2: Page Analysis ===');
    
    const currentUrl = window.location.href;
    console.log(`Current URL: ${currentUrl}`);
    
    // Check if this is a relevant page
    const urlLower = currentUrl.toLowerCase();
    const isIrbroker = urlLower.includes('irbroker.com');
    const isFundDo = urlLower.includes('fund.do');
    const isNavList = urlLower.includes('navlist');
    const isAdjustedIp = urlLower.includes('adjustedip');
    
    console.log(`\n📍 Page Type Analysis:`);
    console.log(`- irbroker.com: ${isIrbroker ? '✅' : '❌'}`);
    console.log(`- fund.do: ${isFundDo ? '✅' : '❌'}`);
    console.log(`- navList: ${isNavList ? '✅' : '❌'}`);
    console.log(`- adjustedIp: ${isAdjustedIp ? '✅' : '❌'}`);
    
    const isRelevantPage = isIrbroker && (isFundDo || isAdjustedIp);
    console.log(`\n🎯 Is Relevant Page: ${isRelevantPage ? '✅ YES' : '❌ NO'}`);
    
    if (!isRelevantPage) {
        console.log('\n❌ PROBLEM: Not on relevant page!');
        console.log('💡 SOLUTION: Navigate to:');
        console.log('   NAV: https://krzetf5.irbroker.com/fund.do?method=navList&new_search=true');
        console.log('   Expert: https://krzetf5.irbroker.com/adjustedIp.do?new_search=true');
        return;
    }
    
    console.log('\n✅ On relevant page');
    
    console.log('\n=== STEP 3: Content Script Check ===');
    
    // Check if content script is loaded
    try {
        // Try to access a function that should exist in content.js
        if (typeof window.startMonitoring !== 'undefined') {
            console.log('✅ Content script functions accessible');
        } else {
            console.log('❌ Content script functions not accessible');
        }
    } catch (e) {
        console.log('❌ Content script check failed:', e.message);
    }
    
    // Check for monitoring interval
    const hasMonitoringInterval = localStorage.hasOwnProperty('monitoringActive') || 
                                  window.monitoringInterval !== undefined;
    console.log(`Monitoring Active: ${hasMonitoringInterval ? '✅' : '❌'}`);
    
    console.log('\n=== STEP 4: Search Button Analysis ===');
    
    // Find all possible button elements
    const allInputs = document.querySelectorAll('input');
    const allButtons = document.querySelectorAll('button');
    const submitInputs = document.querySelectorAll('input[type="submit"]');
    const buttonInputs = document.querySelectorAll('input[type="button"]');
    
    console.log(`\n📊 Element Count:`);
    console.log(`- All inputs: ${allInputs.length}`);
    console.log(`- All buttons: ${allButtons.length}`);
    console.log(`- Submit inputs: ${submitInputs.length}`);
    console.log(`- Button inputs: ${buttonInputs.length}`);
    
    console.log('\n🔍 Submit Buttons Analysis:');
    submitInputs.forEach((btn, i) => {
        const value = btn.value || '';
        const id = btn.id || '';
        const className = btn.className || '';
        const onclick = btn.onclick ? btn.onclick.toString().substring(0, 50) + '...' : '';
        
        console.log(`${i+1}. VALUE="${value}" ID="${id}" CLASS="${className}"`);
        if (onclick) console.log(`   ONCLICK: ${onclick}`);
        
        // Test if this looks like a search button
        const isSearchLike = value.includes('جستجو') || 
                           value.toLowerCase().includes('search') ||
                           value === 'Submit' ||
                           value === 'GO';
        
        if (isSearchLike) {
            console.log(`   🎯 THIS LOOKS LIKE A SEARCH BUTTON!`);
        }
    });
    
    console.log('\n=== STEP 5: Manual Button Click Test ===');
    
    if (submitInputs.length > 0) {
        const firstSubmit = submitInputs[0];
        console.log(`Testing click on first submit button: "${firstSubmit.value}"`);
        
        try {
            // Test click
            firstSubmit.click();
            console.log('✅ Click successful!');
            
            // Wait and check if page changed
            setTimeout(() => {
                console.log(`Page URL after click: ${window.location.href}`);
            }, 2000);
            
        } catch (e) {
            console.log(`❌ Click failed: ${e.message}`);
        }
    } else {
        console.log('❌ No submit buttons found to test');
    }
    
    console.log('\n=== STEP 6: Force Bot Activation ===');
    
    // Force set all required values
    console.log('🔧 Force setting bot activation values...');
    
    await chrome.storage.local.set({ 
        botActive: true,
        botManagedTabs: [chrome.devtools ? 'devtools' : 'unknown']
    });
    
    await chrome.storage.sync.set({
        activeFund: activeFund || 'کارا'
    });
    
    console.log('✅ Values force-set. Extension should work now.');
    console.log('\n💡 Try refreshing the page and check console for bot messages');
}

completeDebug();
})();
