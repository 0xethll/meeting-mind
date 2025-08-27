// Background service worker for MeetingMind extension
console.log('MeetingMind service worker loaded');

// Extension installation/update handler
chrome.runtime.onInstalled.addListener((details) => {
    console.log('MeetingMind extension installed/updated:', details.reason);
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message);
    
    switch (message.action) {
        case 'startRecording':
            handleStartRecording(message.tabId)
                .then(response => sendResponse(response))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true; // Keep message channel open for async response
            
        case 'stopRecording':
            handleStopRecording()
                .then(response => sendResponse(response))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
            
        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }
});

async function handleStartRecording(tabId) {
    try {
        // Get media stream ID for Manifest V3
        const streamId = await chrome.tabCapture.getMediaStreamId({
            consumerTabId: tabId
        });
        
        if (!streamId) {
            throw new Error('Failed to get media stream ID');
        }
        
        // Send stream ID to content script for audio capture
        await chrome.tabs.sendMessage(tabId, {
            action: 'initializeAudioCapture',
            streamId: streamId
        });
        
        console.log('Audio capture initialized for tab:', tabId);
        
        return { success: true };
        
    } catch (error) {
        console.error('Error starting recording:', error);
        throw error;
    }
}

async function handleStopRecording() {
    try {
        // Get the active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        
        if (!activeTab) {
            throw new Error('No active tab found');
        }
        
        // Send stop message to content script
        await chrome.tabs.sendMessage(activeTab.id, {
            action: 'stopAudioCapture'
        });
        
        console.log('Recording stopped for tab:', activeTab.id);
        
        return { success: true };
        
    } catch (error) {
        console.error('Error stopping recording:', error);
        throw error;
    }
}