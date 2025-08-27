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
        // Request tab capture stream
        const stream = await chrome.tabCapture.capture({
            audio: true,
            video: false
        });
        
        if (!stream) {
            throw new Error('Failed to capture tab audio');
        }
        
        console.log('Audio capture started for tab:', tabId);
        
        // TODO: Implement audio processing and transcription
        // For now, just return success
        return { success: true };
        
    } catch (error) {
        console.error('Error starting recording:', error);
        throw error;
    }
}

async function handleStopRecording() {
    try {
        // TODO: Implement stop recording logic
        console.log('Stopping recording...');
        
        return { success: true };
        
    } catch (error) {
        console.error('Error stopping recording:', error);
        throw error;
    }
}