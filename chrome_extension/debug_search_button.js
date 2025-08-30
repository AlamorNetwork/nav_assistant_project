// Debug script to help find the correct search button selector
// Run this in Chrome DevTools console on the NAV page

console.log('🔍 دبگ کردن دکمه‌های جستجو...');

// Find all possible search buttons
const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], a[role="button"]');
const searchButtons = [];

buttons.forEach((btn, index) => {
    const text = (btn.innerText || btn.value || btn.textContent || '').trim();
    const id = btn.id || '';
    const className = btn.className || '';
    const onclick = btn.onclick ? btn.onclick.toString() : '';
    const form = btn.closest('form');
    
    // Check if it looks like a search button
    const isSearchButton = (
        text.includes('جستجو') || 
        text.includes('search') || 
        text.includes('Search') || 
        id.includes('search') || 
        className.includes('search') ||
        onclick.includes('search')
    );
    
    if (isSearchButton || text.length > 0) {
        const buttonInfo = {
            index: index + 1,
            element: btn,
            text: text,
            id: id,
            className: className,
            tagName: btn.tagName.toLowerCase(),
            type: btn.type || '',
            onclick: onclick ? 'yes' : 'no',
            inForm: form ? 'yes' : 'no',
            selector: generateSelector(btn),
            isSearchCandidate: isSearchButton
        };
        
        if (isSearchButton) {
            searchButtons.push(buttonInfo);
        }
        
        console.log(`${isSearchButton ? '🟢' : '⚪'} دکمه ${buttonInfo.index}:`, buttonInfo);
    }
});

console.log('\n🎯 کاندیدهای احتمالی برای دکمه جستجو:');
searchButtons.forEach(btn => {
    console.log(`✅ Selector: "${btn.selector}"`);
    console.log(`   Text: "${btn.text}"`);
    console.log(`   ID: "${btn.id}"`);
    console.log(`   Class: "${btn.className}"`);
    console.log('   ---');
});

if (searchButtons.length === 0) {
    console.log('❌ هیچ دکمه جستجویی پیدا نشد!');
    console.log('💡 تمام دکمه‌ها:');
    buttons.forEach((btn, i) => {
        const text = (btn.innerText || btn.value || '').trim();
        if (text) {
            console.log(`   ${i+1}. "${text}" - Selector: "${generateSelector(btn)}"`);
        }
    });
}

function generateSelector(element) {
    // Generate a unique selector for the element
    if (element.id) {
        return `#${element.id}`;
    }
    
    if (element.className) {
        const classes = element.className.split(' ').filter(c => c.length > 0);
        if (classes.length > 0) {
            return `.${classes.join('.')}`;
        }
    }
    
    // Try to find a unique attribute
    const attrs = element.attributes;
    for (let attr of attrs) {
        if (attr.name === 'name' && attr.value) {
            return `[name="${attr.value}"]`;
        }
        if (attr.name === 'value' && attr.value && attr.value.includes('جستجو')) {
            return `[value="${attr.value}"]`;
        }
    }
    
    // Fallback to tag name with text content
    const text = (element.innerText || element.value || '').trim();
    if (text) {
        return `${element.tagName.toLowerCase()}[contains(text(), "${text}")]`;
    }
    
    return element.tagName.toLowerCase();
}

console.log('\n🧪 برای تست کردن یکی از selector ها:');
console.log('document.querySelector("SELECTOR_HERE").click()');

// Auto-highlight search candidates
searchButtons.forEach(btn => {
    btn.element.style.border = '3px solid red';
    btn.element.style.backgroundColor = 'yellow';
});

console.log(`\n🔴 ${searchButtons.length} دکمه با border قرمز مشخص شدند.`);
