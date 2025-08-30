// Test script for desktop notifications
// You can run this in Chrome DevTools console on any page with the extension loaded

console.log('🧪 Testing Desktop Notifications...');

// Test basic notification
chrome.runtime.sendMessage({
    type: 'SHOW_DESKTOP_NOTIFICATION',
    options: {
        id: 'test_basic',
        title: '🧪 تست نوتیفیکیشن',
        message: 'این یک پیام تست است',
        priority: 1,
        requireInteraction: false
    }
}).then(response => {
    console.log('Basic notification test result:', response);
});

// Test adjustment notification with buttons
setTimeout(() => {
    chrome.runtime.sendMessage({
        type: 'SHOW_DESKTOP_NOTIFICATION',
        options: {
            id: 'test_adjustment',
            title: '🚨 تست تعدیل NAV',
            message: 'صندوق تست: قیمت پیشنهادی 1250.00',
            priority: 2,
            requireInteraction: true,
            buttons: [
                { text: 'تعدیل زدم، دوباره چک کن' },
                { text: 'بستن' }
            ]
        }
    }).then(response => {
        console.log('Adjustment notification test result:', response);
    });
}, 2000);

// Test stale NAV notification
setTimeout(() => {
    chrome.runtime.sendMessage({
        type: 'SHOW_DESKTOP_NOTIFICATION',
        options: {
            id: 'test_stale',
            title: '⏰ تست تاخیر NAV',
            message: 'صندوق تست: آخرین بروزرسانی 5 دقیقه پیش',
            priority: 1,
            requireInteraction: false,
            buttons: [
                { text: 'رفرش صفحه' },
                { text: 'بستن' }
            ]
        }
    }).then(response => {
        console.log('Stale NAV notification test result:', response);
    });
}, 4000);

console.log('✅ All notification tests queued!');
console.log('📋 Check your desktop for notifications in the next few seconds...');
