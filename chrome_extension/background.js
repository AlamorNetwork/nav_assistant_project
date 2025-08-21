/* Background Service Worker for NAV Assistant */

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
		chrome.tabs.create({ url: request.url, active: true }, (tab) => {
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
	}
});
