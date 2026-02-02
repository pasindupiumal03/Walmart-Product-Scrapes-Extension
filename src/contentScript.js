/**
 * Content Script for Walmart Listing Generator
 * Keeps the Service Worker alive by establishing a long-lived connection
 * and can be used for DOM access if needed in future updates.
 */

// Establish a long-lived connection to keep the background worker alive
const port = chrome.runtime.connect({ name: "keep-alive" });

port.onDisconnect.addListener(() => {
    console.log("Keep-alive port disconnected. Reconnecting...");
    // Optional: Logic to reconnect if needed, though usually content script reload is required
});

// Listen for ping messages from background to prove life
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'PING') {
        sendResponse({ status: 'PONG' });
        return true;
    }
});
