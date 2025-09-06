// Debug script to find correct selectors for the adjustedIpList table
console.log("🔍 Debugging adjustedIpList table selectors...");

// First, check if we're on the right page
const adjustedIpList = document.querySelector("#adjustedIpList");
if (!adjustedIpList) {
    console.log("❌ #adjustedIpList table not found. Are you on the Expert page?");
    return;
}

console.log("✅ #adjustedIpList table found!");

// Get all rows in the table
const rows = adjustedIpList.querySelectorAll("tbody tr");
console.log(`📊 Found ${rows.length} rows in the table`);

if (rows.length === 0) {
    console.log("❌ No rows found in the table. Table might be empty or still loading.");
    return;
}

// Test the first few rows to see their structure
for (let i = 0; i < Math.min(3, rows.length); i++) {
    console.log(`\n🔍 Row ${i + 1}:`);
    const cells = rows[i].querySelectorAll("td");
    console.log(`   Found ${cells.length} cells`);
    
    cells.forEach((cell, cellIndex) => {
        const text = cell.textContent.trim();
        const hasFont = cell.querySelector("font");
        const hasInput = cell.querySelector("input");
        const hasSpan = cell.querySelector("span");
        
        console.log(`   Cell ${cellIndex + 1}: "${text}" ${hasFont ? '(has font)' : ''} ${hasInput ? '(has input)' : ''} ${hasSpan ? '(has span)' : ''}`);
        
        // If cell has font elements, show their content
        if (hasFont) {
            const fonts = cell.querySelectorAll("font");
            fonts.forEach((font, fontIndex) => {
                console.log(`     Font ${fontIndex + 1}: "${font.textContent.trim()}"`);
            });
        }
    });
}

// Test specific selectors for sellable quantity and expert price
console.log("\n💰 Testing specific selectors:");

const testSelectors = [
    "#adjustedIpList tbody tr:nth-child(1) td:nth-child(3)",
    "#adjustedIpList tbody tr:nth-child(1) td:nth-child(3) font",
    "#adjustedIpList tbody tr:nth-child(1) td:nth-child(12)",
    "#adjustedIpList tbody tr:nth-child(1) td:nth-child(12) font",
    "#adjustedIpList tbody tr:nth-child(1) td:nth-child(4)",
    "#adjustedIpList tbody tr:nth-child(1) td:nth-child(4) font",
    "#adjustedIpList tbody tr:nth-child(1) td:nth-child(5)",
    "#adjustedIpList tbody tr:nth-child(1) td:nth-child(5) font"
];

testSelectors.forEach((selector, index) => {
    const element = document.querySelector(selector);
    if (element) {
        console.log(`${index + 1}. ${selector}: "${element.textContent.trim()}"`);
    } else {
        console.log(`${index + 1}. ${selector}: Not found`);
    }
});

// Look for numeric values in the table
console.log("\n🔢 Looking for numeric values in the table:");
rows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll("td");
    cells.forEach((cell, cellIndex) => {
        const text = cell.textContent.trim();
        // Check if text contains numbers (Persian or English)
        if (/\d/.test(text) && text.length > 0) {
            console.log(`Row ${rowIndex + 1}, Cell ${cellIndex + 1}: "${text}"`);
        }
    });
});
