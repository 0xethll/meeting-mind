// Background service worker for MeetingMind extension
console.log('MeetingMind service worker loaded');

// Global variables for recording state
let currentRecordingTabId = null;
let audioChunks = [];

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

        case 'audioChunk':
            handleAudioChunk(message.chunk, sender.tab.id);
            break;
            
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
        
        // Initialize recording state
        currentRecordingTabId = tabId;
        audioChunks = [];
        
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
        if (!currentRecordingTabId) {
            throw new Error('No active recording found');
        }
        
        // Send stop message to content script
        await chrome.tabs.sendMessage(currentRecordingTabId, {
            action: 'stopAudioCapture'
        });
        
        console.log('Recording stopped for tab:', currentRecordingTabId);
        
        // Reset recording state
        currentRecordingTabId = null;
        audioChunks = [];
        
        return { success: true };
        
    } catch (error) {
        console.error('Error stopping recording:', error);
        throw error;
    }
}

function handleAudioChunk(chunk, tabId) {
    if (tabId !== currentRecordingTabId) {
        return; // Ignore chunks from non-recording tabs
    }
    
    audioChunks.push(chunk);
    
    // Process audio chunks in batches for transcription
    if (audioChunks.length >= 5) { // Process every 5 seconds of audio
        processAudioBatch();
    }
}

async function processAudioBatch() {
    if (audioChunks.length === 0) return;
    
    try {
        // Check usage limits first
        const usageData = await checkUsageLimits();
        if (!usageData.canProceed) {
            chrome.runtime.sendMessage({
                action: 'error',
                error: usageData.message
            });
            return;
        }
        
        // Combine audio chunks into a single blob
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = []; // Clear processed chunks
        
        // Use managed API key approach
        const transcription = await transcribeAudio(audioBlob);
        
        if (transcription.text && transcription.text.trim()) {
            console.log('Transcription:', transcription.text);
            
            // Update usage tracking
            await updateUsageTracking();
            
            // Send transcription to popup
            chrome.runtime.sendMessage({
                action: 'transcriptionUpdate',
                data: {
                    text: transcription.text,
                    speaker: 'Speaker' // Basic speaker - will enhance with diarization later
                }
            });
        }
        
    } catch (error) {
        console.error('Error processing audio batch:', error);
        
        // Send error to popup
        chrome.runtime.sendMessage({
            action: 'error',
            error: 'Transcription failed: ' + error.message
        });
    }
}

async function transcribeAudio(audioBlob) {
    // For MVP: Use hardcoded API key with usage limits
    // TODO: Replace with backend proxy service in production
    const MANAGED_API_KEY = 'sk-proj-YOUR_API_KEY_HERE'; // Replace with your key
    
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');
    formData.append('language', 'en');
    
    console.log('Sending audio to OpenAI Whisper...');
    
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${MANAGED_API_KEY}`,
        },
        body: formData
    });
    
    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
}

async function checkUsageLimits() {
    const storage = await chrome.storage.local.get(['usageData', 'userPlan']);
    const now = new Date();
    const today = now.toDateString();
    
    // Initialize usage data if not exists
    let usageData = storage.usageData || {
        date: today,
        requestsToday: 0,
        totalRequests: 0
    };
    
    // Reset daily counter if new day
    if (usageData.date !== today) {
        usageData = {
            date: today,
            requestsToday: 0,
            totalRequests: usageData.totalRequests || 0
        };
    }
    
    const userPlan = storage.userPlan || 'free';
    const limits = {
        free: { daily: 50, total: 1000 }, // 50 requests per day, 1000 total
        premium: { daily: 1000, total: Infinity }
    };
    
    const limit = limits[userPlan];
    
    // Check limits
    if (usageData.requestsToday >= limit.daily) {
        return {
            canProceed: false,
            message: `Daily limit reached (${limit.daily} requests). Upgrade to Premium for unlimited usage.`
        };
    }
    
    if (usageData.totalRequests >= limit.total) {
        return {
            canProceed: false,
            message: `Free tier limit reached (${limit.total} total requests). Upgrade to Premium for unlimited usage.`
        };
    }
    
    return { canProceed: true };
}

async function updateUsageTracking() {
    const storage = await chrome.storage.local.get(['usageData']);
    const now = new Date();
    const today = now.toDateString();
    
    let usageData = storage.usageData || {
        date: today,
        requestsToday: 0,
        totalRequests: 0
    };
    
    if (usageData.date !== today) {
        usageData.date = today;
        usageData.requestsToday = 0;
    }
    
    usageData.requestsToday++;
    usageData.totalRequests++;
    
    await chrome.storage.local.set({ usageData });
    
    // Send usage update to popup
    chrome.runtime.sendMessage({
        action: 'usageUpdate',
        data: usageData
    });
}