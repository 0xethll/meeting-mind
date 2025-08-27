// Content script for MeetingMind extension
console.log('MeetingMind content script loaded on:', window.location.href);

// Detect meeting platform and inject necessary functionality
function detectMeetingPlatform() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('meet.google.com')) {
        return 'google-meet';
    } else if (hostname.includes('zoom.us')) {
        return 'zoom';
    } else if (hostname.includes('teams.microsoft.com')) {
        return 'microsoft-teams';
    }
    
    return 'unknown';
}

// Initialize content script
function initialize() {
    const platform = detectMeetingPlatform();
    console.log('Detected meeting platform:', platform);
    
    // Send platform info to background script
    chrome.runtime.sendMessage({
        action: 'platformDetected',
        platform: platform,
        url: window.location.href
    });
    
    // Add platform-specific initialization
    switch (platform) {
        case 'google-meet':
            initializeGoogleMeet();
            break;
        case 'zoom':
            initializeZoom();
            break;
        case 'microsoft-teams':
            initializeTeams();
            break;
        default:
            console.log('Unsupported meeting platform');
    }
}

function initializeGoogleMeet() {
    console.log('Initializing Google Meet integration');
    // TODO: Add Google Meet specific functionality
    // - Detect when user joins/leaves meeting
    // - Monitor meeting controls
    // - Extract participant information if possible
}

function initializeZoom() {
    console.log('Initializing Zoom integration');
    // TODO: Add Zoom specific functionality
}

function initializeTeams() {
    console.log('Initializing Teams integration');
    // TODO: Add Teams specific functionality
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);
    
    switch (message.action) {
        case 'checkMeetingStatus':
            sendResponse({
                inMeeting: checkIfInMeeting(),
                platform: detectMeetingPlatform()
            });
            break;
        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }
});

function checkIfInMeeting() {
    // Basic check - can be enhanced per platform
    const platform = detectMeetingPlatform();
    
    switch (platform) {
        case 'google-meet':
            // Check if we're in a meeting room (not just the homepage)
            return window.location.pathname.length > 1;
        case 'zoom':
            // Check for Zoom meeting indicators
            return document.querySelector('[data-testid="meeting-info"]') !== null;
        case 'microsoft-teams':
            // Check for Teams meeting indicators
            return document.querySelector('[data-tid="meeting-stage"]') !== null;
        default:
            return false;
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}