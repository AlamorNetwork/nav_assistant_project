// Debug popup activation process
// Run this in popup console

(function() {
console.log('🔍 Popup Debug...');

async function debugPopupActivation() {
    console.log('\n=== Bot Activation Debug ===');
    
    // Check current state
    const localStorage = await chrome.storage.local.get();
    const syncStorage = await chrome.storage.sync.get();
    
    console.log('Current state:');
    console.log('- Bot Active:', localStorage.botActive);
    console.log('- Active Fund:', syncStorage.activeFund);
    console.log('- Bot Managed Tabs:', localStorage.botManagedTabs);
    console.log('- NAV Tab ID:', localStorage[`navTabId_${syncStorage.activeFund}`]);
    console.log('- Expert Tab ID:', localStorage[`expertTabId_${syncStorage.activeFund}`]);
    
    // Test message sending
    console.log('\n=== Testing Message Sending ===');
    
    const navTabId = localStorage[`navTabId_${syncStorage.activeFund}`];
    const expertTabId = localStorage[`expertTabId_${syncStorage.activeFund}`];
    
    if (navTabId) {
        console.log(`📤 Sending test message to NAV tab ${navTabId}...`);
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'SEND_MESSAGE_TO_TAB',
                tabId: navTabId,
                message: {
                    type: 'INITIALIZE_NAV_TAB',
                    fundName: syncStorage.activeFund,
                    isMainTab: true
                }
            });
            console.log('✅ NAV message response:', response);
        } catch (error) {
            console.log('❌ NAV message failed:', error.message);
        }
    } else {
        console.log('❌ No NAV tab ID found');
    }
    
    if (expertTabId) {
        console.log(`📤 Sending test message to Expert tab ${expertTabId}...`);
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'SEND_MESSAGE_TO_TAB',
                tabId: expertTabId,
                message: {
                    type: 'INITIALIZE_EXPERT_TAB',
                    fundName: syncStorage.activeFund,
                    isMainTab: false
                }
            });
            console.log('✅ Expert message response:', response);
        } catch (error) {
            console.log('❌ Expert message failed:', error.message);
        }
    } else {
        console.log('❌ No Expert tab ID found');
    }
    
    // Test direct tab communication
    console.log('\n=== Testing Direct Tab Access ===');
    
    if (navTabId) {
        try {
            await chrome.tabs.sendMessage(navTabId, {
                type: 'PING_TEST',
                message: 'Hello from popup'
            });
            console.log('✅ Direct NAV tab communication OK');
        } catch (error) {
            console.log('❌ Direct NAV tab communication failed:', error.message);
        }
    }
    
    if (expertTabId) {
        try {
            await chrome.tabs.sendMessage(expertTabId, {
                type: 'PING_TEST',
                message: 'Hello from popup'
            });
            console.log('✅ Direct Expert tab communication OK');
        } catch (error) {
            console.log('❌ Direct Expert tab communication failed:', error.message);
        }
    }
}

debugPopupActivation();
})();
