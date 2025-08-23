// تست پیشرفته سلکتورهای Expert
console.log('🔍 شروع تست پیشرفته سلکتورهای Expert...');

// سلکتورهای فعلی
const sellableSelector = "#adjustedIpList > tbody > tr > td:nth-child(3) > font";
const expertPriceSelector = "#adjustedIpList > tbody > tr > td:nth-child(12) > font";

// 1. تحلیل ساختار کلی جدول
console.log('\n📋 تحلیل ساختار جدول:');
const table = document.querySelector('#adjustedIpList');
if (table) {
    console.log('✅ جدول #adjustedIpList یافت شد');
    
    // بررسی thead
    const thead = table.querySelector('thead');
    if (thead) {
        const headerRows = thead.querySelectorAll('tr');
        console.log(`تعداد ردیف‌های header: ${headerRows.length}`);
        
        headerRows.forEach((row, rowIndex) => {
            const headers = row.querySelectorAll('th, td');
            console.log(`ردیف header ${rowIndex + 1}: ${headers.length} ستون`);
            
            headers.forEach((header, colIndex) => {
                const text = header.innerText || header.textContent || '';
                console.log(`  ستون ${colIndex + 1}: "${text.trim()}"`);
            });
        });
    } else {
        console.log('❌ thead یافت نشد');
    }
    
    // بررسی tbody
    const tbody = table.querySelector('tbody');
    if (tbody) {
        const rows = tbody.querySelectorAll('tr');
        console.log(`تعداد ردیف‌های tbody: ${rows.length}`);
        
        if (rows.length > 0) {
            // تحلیل ردیف اول
            const firstRow = rows[0];
            console.log('\n🔍 تحلیل ردیف اول:');
            
            // روش 1: مستقیم
            const directCells = firstRow.querySelectorAll('td');
            console.log(`سلول‌های مستقیم: ${directCells.length}`);
            
            // روش 2: با بررسی ساختار داخلی
            const allElements = firstRow.children;
            console.log(`تعداد فرزندان مستقیم: ${allElements.length}`);
            
            for (let i = 0; i < allElements.length; i++) {
                const child = allElements[i];
                console.log(`  فرزند ${i + 1}: ${child.tagName} - کلاس: "${child.className}"`);
                
                if (child.tagName === 'TD') {
                    const cellText = child.innerText || child.textContent || '';
                    console.log(`    محتوا: "${cellText.trim()}"`);
                    
                    // بررسی عناصر داخلی
                    const innerElements = child.querySelectorAll('*');
                    console.log(`    تعداد عناصر داخلی: ${innerElements.length}`);
                    
                    innerElements.forEach((el, idx) => {
                        const elText = el.innerText || el.textContent || '';
                        console.log(`      عنصر ${idx + 1}: ${el.tagName} - "${elText.trim()}"`);
                    });
                }
            }
        }
    } else {
        console.log('❌ tbody یافت نشد');
    }
} else {
    console.log('❌ جدول #adjustedIpList یافت نشد!');
}

// 2. تست سلکتورهای مختلف برای sellable_quantity
console.log('\n📊 تست سلکتورهای مختلف برای sellable_quantity:');
const sellableSelectors = [
    "#adjustedIpList > tbody > tr > td:nth-child(3) > font",
    "#adjustedIpList > tbody > tr > td:nth-child(3)",
    "#adjustedIpList tbody tr td:nth-child(3) > font",
    "#adjustedIpList tbody tr td:nth-child(3)",
    "#adjustedIpList tr td:nth-child(3) > font",
    "#adjustedIpList tr td:nth-child(3)"
];

sellableSelectors.forEach((selector, index) => {
    const elements = document.querySelectorAll(selector);
    console.log(`سلکتور ${index + 1} (${selector}): ${elements.length} عنصر`);
    
    if (elements.length > 0) {
        const firstElement = elements[0];
        const text = firstElement.innerText || firstElement.textContent || '';
        const number = parseFloat(text.replace(/[^\d.-]/g, ''));
        console.log(`  مقدار اول: "${text.trim()}" -> ${number}`);
    }
});

// 3. تست سلکتورهای مختلف برای expert_price
console.log('\n💰 تست سلکتورهای مختلف برای expert_price:');
const expertPriceSelectors = [
    "#adjustedIpList > tbody > tr > td:nth-child(12) > font",
    "#adjustedIpList > tbody > tr > td:nth-child(12)",
    "#adjustedIpList tbody tr td:nth-child(12) > font",
    "#adjustedIpList tbody tr td:nth-child(12)",
    "#adjustedIpList tr td:nth-child(12) > font",
    "#adjustedIpList tr td:nth-child(12)"
];

expertPriceSelectors.forEach((selector, index) => {
    const elements = document.querySelectorAll(selector);
    console.log(`سلکتور ${index + 1} (${selector}): ${elements.length} عنصر`);
    
    if (elements.length > 0) {
        const firstElement = elements[0];
        const text = firstElement.innerText || firstElement.textContent || '';
        const number = parseFloat(text.replace(/[^\d.-]/g, ''));
        console.log(`  مقدار اول: "${text.trim()}" -> ${number}`);
    }
});

// 4. جستجوی ستون‌ها بر اساس محتوا
console.log('\n🔍 جستجوی ستون‌ها بر اساس محتوا:');
const allRows = document.querySelectorAll('#adjustedIpList tbody tr');
if (allRows.length > 0) {
    const firstRow = allRows[0];
    const allCells = firstRow.querySelectorAll('td');
    
    console.log(`تعداد سلول‌ها در ردیف اول: ${allCells.length}`);
    
    allCells.forEach((cell, index) => {
        const cellText = cell.innerText || cell.textContent || '';
        const cleanText = cellText.trim();
        
        // بررسی اگر محتوا عددی است
        const number = parseFloat(cleanText.replace(/[^\d.-]/g, ''));
        const isNumeric = !isNaN(number) && cleanText.length > 0;
        
        console.log(`  ستون ${index + 1}: "${cleanText}" ${isNumeric ? `(عدد: ${number})` : '(متنی)'}`);
        
        // بررسی عناصر font داخل سلول
        const fontElements = cell.querySelectorAll('font');
        if (fontElements.length > 0) {
            fontElements.forEach((font, fontIndex) => {
                const fontText = font.innerText || font.textContent || '';
                const fontNumber = parseFloat(fontText.replace(/[^\d.-]/g, ''));
                console.log(`    font ${fontIndex + 1}: "${fontText.trim()}" ${!isNaN(fontNumber) ? `(عدد: ${fontNumber})` : ''}`);
            });
        }
    });
}

// 5. تست سلکتورهای جایگزین برای ستون‌های مختلف
console.log('\n🔧 تست سلکتورهای جایگزین برای ستون‌های مختلف:');
for (let col = 1; col <= 15; col++) {
    const selector = `#adjustedIpList > tbody > tr > td:nth-child(${col})`;
    const elements = document.querySelectorAll(selector);
    
    if (elements.length > 0) {
        const firstElement = elements[0];
        const text = firstElement.innerText || firstElement.textContent || '';
        const cleanText = text.trim();
        const number = parseFloat(cleanText.replace(/[^\d.-]/g, ''));
        
        console.log(`ستون ${col}: ${elements.length} عنصر - "${cleanText}" ${!isNaN(number) ? `(عدد: ${number})` : ''}`);
    }
}

console.log('\n✅ تست پیشرفته کامل شد!');
