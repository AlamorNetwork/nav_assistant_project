/* Background Service Worker for NAV Assistant */

// Desktop notification helper function
async function showDesktopNotification(options) {
	try {
		const notificationOptions = {
			type: 'basic',
			iconUrl: 'icons/icon128.png',
			title: options.title || '🐍 دستیار NAV',
			message: options.message || '',
			priority: options.priority || 2, // 0=min, 1=low, 2=high
			requireInteraction: options.requireInteraction !== false, // Keep notification visible until user interacts
			silent: options.silent === true
		};

		// Add action buttons if provided
		if (options.buttons && options.buttons.length > 0) {
			notificationOptions.buttons = options.buttons.map(btn => ({
				title: btn.text,
				iconUrl: btn.iconUrl || 'icons/icon48.png'
			}));
		}

		const notificationId = await chrome.notifications.create(
			options.id || `nav_assistant_${Date.now()}`,
			notificationOptions
		);

		console.log('Desktop notification created:', notificationId);
		return notificationId;
	} catch (error) {
		console.error('Failed to create desktop notification:', error);
		return null;
	}
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
	console.log('Notification button clicked:', notificationId, buttonIndex);
	
	// Handle different notification types
	if (notificationId.startsWith('nav_adjustment_')) {
		if (buttonIndex === 0) { // "تعدیل زدم، دوباره چک کن"
			// Send message to active tab to recheck NAV
			try {
				const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
				if (tabs[0]) {
					await chrome.tabs.sendMessage(tabs[0].id, {
						type: 'RECHECK_NAV_REQUESTED',
						source: 'desktop_notification'
					});
				}
			} catch (error) {
				console.error('Failed to send recheck message:', error);
			}
		}
	}
	
	// Clear the notification after interaction
	chrome.notifications.clear(notificationId);
});

// Handle notification clicks (when user clicks the notification body)
chrome.notifications.onClicked.addListener(async (notificationId) => {
	console.log('Notification clicked:', notificationId);
	
	// Bring extension popup to focus by opening it
	try {
		const windows = await chrome.windows.getAll({ populate: true });
		let extensionWindow = null;
		
		for (const window of windows) {
			for (const tab of window.tabs) {
				if (tab.url && tab.url.includes('chrome-extension://')) {
					extensionWindow = window;
					break;
				}
			}
		}
		
		if (extensionWindow) {
			await chrome.windows.update(extensionWindow.id, { focused: true });
		} else {
			// Open popup by creating a tab with extension popup
			await chrome.action.openPopup();
		}
	} catch (error) {
		console.error('Failed to focus extension:', error);
	}
	
	// Clear the notification
	chrome.notifications.clear(notificationId);
});

// Relay log messages to keep a central log if needed (no-op for now)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request?.type === 'GET_ACTIVE_TAB') {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (chrome.runtime.lastError) {
				return sendResponse({ ok: false, error: chrome.runtime.lastError.message });
			}
			sendResponse({ ok: true, tab: tabs && tabs.length ? { id: tabs[0].id, url: tabs[0].url } : null });
		});
		return true; // async
	} else if (request?.type === 'CREATE_TAB') {
		chrome.tabs.create({ url: request.url, active: request.active !== false }, (tab) => {
			if (chrome.runtime.lastError) {
				return sendResponse({ ok: false, error: chrome.runtime.lastError.message });
			}
			return sendResponse({ ok: true, tabId: tab?.id });
		});
		return true; // async
	} else if (request?.type === 'CLOSE_TABS') {
		const tabIds = Array.isArray(request.tabIds) ? request.tabIds : [];
		if (!tabIds.length) return sendResponse({ ok: true, closed: 0 });
		chrome.tabs.remove(tabIds, () => {
			if (chrome.runtime.lastError) {
				return sendResponse({ ok: false, error: chrome.runtime.lastError.message });
			}
			sendResponse({ ok: true, closed: tabIds.length });
		});
		return true; // async
	} else if (request?.type === 'ACTIVATE_TAB') {
		const tabId = request.tabId;
		if (!tabId) return sendResponse({ ok: false, error: 'tabId required' });
		chrome.tabs.update(tabId, { active: true }, () => {
			if (chrome.runtime.lastError) {
				return sendResponse({ ok: false, error: chrome.runtime.lastError.message });
			}
			sendResponse({ ok: true });
		});
		return true;
	} else if (request?.type === 'SEND_MESSAGE_TO_TAB') {
		const { tabId, message } = request;
		if (!tabId) return sendResponse({ ok: false, error: 'tabId required' });
		chrome.tabs.sendMessage(tabId, message, (resp) => {
			if (chrome.runtime.lastError) {
				return sendResponse({ ok: false, error: chrome.runtime.lastError.message });
			}
			sendResponse({ ok: true, response: resp });
		});
		return true;
	} else if (request?.type === 'SHOW_DESKTOP_NOTIFICATION') {
		// Handle desktop notification requests
		(async () => {
			try {
				const notificationId = await showDesktopNotification(request.options || {});
				sendResponse({ ok: true, notificationId });
			} catch (error) {
				sendResponse({ ok: false, error: error.message });
			}
		})();
		return true; // async response
	} else if (request?.type === 'NAVIGATE_TO_URL') {
		// Handle navigation requests
		(async () => {
			try {
				console.log(`Navigating to URL: ${request.url} for fund: ${request.fundName}`);
				
				// Get current tab
				const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
				
				// Navigate to the URL
				await chrome.tabs.update(tab.id, { url: request.url });
				
				sendResponse({ ok: true, message: 'Navigation initiated' });
			} catch (error) {
				console.error('Navigation failed:', error);
				sendResponse({ ok: false, error: error.message });
			}
		})();
		return true; // async response
	}
});
