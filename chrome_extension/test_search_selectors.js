// Test script for search button selectors
// Run this in Chrome DevTools console on NAV or Expert pages

console.log('🔍 تست کردن selector های دکمه جستجو...');

// Function to find search buttons
function findAllSearchButtons() {
    const searchButtons = [];
    
    // All possible button elements
    const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"]');
    
    buttons.forEach((btn, index) => {
        const text = (btn.innerText || btn.value || btn.textContent || '').trim();
        const id = btn.id || '';
        const className = btn.className || '';
        const name = btn.name || '';
        const title = btn.title || '';
        const onclick = btn.onclick ? 'yes' : 'no';
        
        // Check if it looks like a search button
        const isSearchButton = (
            text.includes('جستجو') || 
            text.toLowerCase().includes('search') ||
            id.toLowerCase().includes('search') ||
            className.toLowerCase().includes('search') ||
            name.toLowerCase().includes('search') ||
            title.includes('جستجو') ||
            title.toLowerCase().includes('search')
        );
        
        const buttonInfo = {
            index: index + 1,
            element: btn,
            text: text,
            id: id,
            className: className,
            name: name,
            title: title,
            tagName: btn.tagName.toLowerCase(),
            type: btn.type || '',
            onclick: onclick,
            selector: generateSelector(btn),
            isCandidate: isSearchButton
        };
        
        if (isSearchButton || text.length > 0) {
            searchButtons.push(buttonInfo);
        }
    });
    
    return searchButtons;
}

function generateSelector(element) {
    if (element.id) {
        return `#${element.id}`;
    }
    
    if (element.name) {
        return `[name="${element.name}"]`;
    }
    
    if (element.className) {
        const classes = element.className.split(' ').filter(c => c.length > 0 && !c.includes(' '));
        if (classes.length > 0) {
            return `.${classes[0]}`;
        }
    }
    
    if (element.value && element.tagName.toLowerCase() === 'input') {
        return `input[value="${element.value}"]`;
    }
    
    if (element.innerText && element.tagName.toLowerCase() === 'button') {
        return `button[contains(text(), "${element.innerText.trim()}")]`;
    }
    
    return element.tagName.toLowerCase();
}

// Test current selectors from config
async function testCurrentConfig() {
    try {
        const stored = await chrome.storage.sync.get('authToken');
        const token = stored.authToken || '';
        
        if (!token) {
            console.log('❌ No auth token found. Please login first.');
            return;
        }
        
        // Try to get config from API
        const response = await fetch('http://localhost:8001/configurations', {
            headers: { 'token': token }
        });
        
        if (response.ok) {
            const configs = await response.json();
            console.log('📋 Current configurations:', configs);
            
            if (configs.length > 0) {
                const config = configs[0];
                
                console.log('\n🧪 Testing NAV search button selector:');
                const navBtn = document.querySelector(config.nav_search_button_selector);
                if (navBtn) {
                    console.log('✅ NAV search button found:', config.nav_search_button_selector);
                    navBtn.style.border = '3px solid green';
                } else {
                    console.log('❌ NAV search button NOT found:', config.nav_search_button_selector);
                }
                
                console.log('\n🧪 Testing Expert search button selector:');
                const expertBtn = document.querySelector(config.expert_search_button_selector);
                if (expertBtn) {
                    console.log('✅ Expert search button found:', config.expert_search_button_selector);
                    expertBtn.style.border = '3px solid blue';
                } else {
                    console.log('❌ Expert search button NOT found:', config.expert_search_button_selector);
                }
            }
        }
    } catch (error) {
        console.log('❌ Error testing config:', error);
    }
}

// Main execution
const allButtons = findAllSearchButtons();

console.log(`\n📊 Found ${allButtons.length} buttons on this page:`);

allButtons.forEach(btn => {
    const status = btn.isCandidate ? '🟢 CANDIDATE' : '⚪ Regular';
    console.log(`${status} Button ${btn.index}:`, {
        text: btn.text,
        selector: btn.selector,
        id: btn.id,
        className: btn.className,
        type: btn.type
    });
});

// Highlight candidates
console.log('\n🎯 Search button candidates:');
const candidates = allButtons.filter(btn => btn.isCandidate);
candidates.forEach(btn => {
    console.log(`✅ "${btn.text}" -> Selector: "${btn.selector}"`);
    btn.element.style.border = '3px solid red';
    btn.element.style.backgroundColor = 'yellow';
});

if (candidates.length === 0) {
    console.log('❌ No search button candidates found!');
    console.log('💡 All buttons on page:');
    allButtons.forEach(btn => {
        if (btn.text) {
            console.log(`   "${btn.text}" -> ${btn.selector}`);
        }
    });
}

// Test current configuration
testCurrentConfig();

console.log('\n🧪 To test a selector manually:');
console.log('document.querySelector("YOUR_SELECTOR_HERE").click()');

console.log(`\n🔴 ${candidates.length} candidates highlighted with red border.`);
console.log('🟢 Green border = Current NAV selector working');
console.log('🔵 Blue border = Current Expert selector working');
