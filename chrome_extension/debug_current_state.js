// Debug current state and search button
// Run this in Chrome DevTools console

(function() {
console.log('🔍 Debug Current State...');

async function debugCurrentState() {
    console.log(`\n📍 Current URL: ${window.location.href}`);
    
    // Check if we're on the correct pages
    const navKeywords = ['fund.do', 'navList', 'irbroker'];
    const expertKeywords = ['adjustedIp.do', 'irbroker'];
    
    const currentUrl = window.location.href.toLowerCase();
    const isNavPage = navKeywords.some(keyword => currentUrl.includes(keyword.toLowerCase()));
    const isExpertPage = expertKeywords.some(keyword => currentUrl.includes(keyword.toLowerCase()));
    
    console.log(`\n📊 Page Type Analysis:`);
    console.log(`- NAV Page: ${isNavPage ? '✅' : '❌'}`);
    console.log(`- Expert Page: ${isExpertPage ? '✅' : '❌'}`);
    
    // Get expected selectors from database
    try {
        const stored = await chrome.storage.sync.get('authToken');
        const authToken = stored.authToken || '';
        
        if (authToken) {
            const API_BASE_URL = 'https://chabokan.irplatforme.ir';
            const headers = { 'token': authToken };
            
            const fundsResponse = await fetch(`${API_BASE_URL}/funds`, {
                headers: headers,
                method: 'GET',
                mode: 'cors'
            });
            
            if (fundsResponse.ok) {
                const funds = await fundsResponse.json();
                if (funds.length > 0) {
                    const fund = funds[0];
                    console.log(`\n🎯 Fund: ${fund.name}`);
                    
                    const configResponse = await fetch(`${API_BASE_URL}/configurations/${fund.name}`, {
                        headers: headers,
                        method: 'GET',
                        mode: 'cors'
                    });
                    
                    if (configResponse.ok) {
                        const config = await configResponse.json();
                        console.log('\n📋 Expected Selectors:');
                        console.log(`NAV Search Button: ${config.nav_search_button_selector}`);
                        console.log(`Expert Search Button: ${config.expert_search_button_selector}`);
                        
                        // Test selectors on current page
                        console.log('\n🧪 Testing Selectors on Current Page:');
                        
                        if (isNavPage) {
                            const navSearchBtn = document.querySelector(config.nav_search_button_selector);
                            console.log(`NAV Search Button Found: ${navSearchBtn ? '✅' : '❌'}`);
                            if (navSearchBtn) {
                                console.log('NAV Button element:', navSearchBtn);
                                console.log('NAV Button text:', navSearchBtn.value || navSearchBtn.innerText || navSearchBtn.textContent);
                            }
                        }
                        
                        if (isExpertPage) {
                            const expertSearchBtn = document.querySelector(config.expert_search_button_selector);
                            console.log(`Expert Search Button Found: ${expertSearchBtn ? '✅' : '❌'}`);
                            if (expertSearchBtn) {
                                console.log('Expert Button element:', expertSearchBtn);
                                console.log('Expert Button text:', expertSearchBtn.value || expertSearchBtn.innerText || expertSearchBtn.textContent);
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.log(`❌ Error getting config: ${error.message}`);
    }
    
    // Find all buttons on page
    console.log('\n🔍 All Buttons on Page:');
    const allButtons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
    console.log(`Total buttons found: ${allButtons.length}`);
    
    allButtons.forEach((btn, i) => {
        const text = (btn.value || btn.innerText || btn.textContent || '').trim();
        const id = btn.id || '';
        const className = btn.className || '';
        const type = btn.type || '';
        
        if (text.includes('جستجو') || text.includes('search') || 
            text.includes('یافت') || text.includes('find') ||
            text.includes('Search') || text.includes('جست')) {
            console.log(`🎯 SEARCH BUTTON ${i+1}:`);
            console.log(`  Text: "${text}"`);
            console.log(`  ID: "${id}"`);
            console.log(`  Class: "${className}"`);
            console.log(`  Type: "${type}"`);
            console.log(`  Element:`, btn);
            
            // Generate selector for this button
            let selector = '';
            if (id) {
                selector = `#${id}`;
            } else if (className) {
                selector = `.${className.split(' ')[0]}`;
            } else if (type === 'submit') {
                selector = `input[type="submit"]`;
                if (text) {
                    selector += `[value="${text}"]`;
                }
            }
            
            if (selector) {
                console.log(`  Suggested Selector: "${selector}"`);
                
                // Test the selector
                const testElement = document.querySelector(selector);
                console.log(`  Selector Test: ${testElement ? '✅' : '❌'}`);
            }
            
            console.log('  ---');
        }
    });
    
    // Check bot state
    console.log('\n🤖 Bot State:');
    try {
        const botState = await chrome.storage.local.get([
            'botActive', 'activeFund', 'botManagedTabs'
        ]);
        console.log('Bot Active:', botState.botActive);
        console.log('Active Fund:', botState.activeFund);
        console.log('Managed Tabs:', botState.botManagedTabs);
    } catch (error) {
        console.log(`❌ Error getting bot state: ${error.message}`);
    }
}

// Run the debug
debugCurrentState();
})();
