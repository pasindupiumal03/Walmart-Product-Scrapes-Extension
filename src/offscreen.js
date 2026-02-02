// Offscreen script to keep the Service Worker alive
setInterval(() => {
    // Sending a message resets the Service Worker's idle timer
    chrome.runtime.sendMessage({ action: 'KEEP_ALIVE_PING' })
        .catch(() => {
            // Ignore errors if SW is temporarily unreachable
        });
}, 20000); // 20 seconds
