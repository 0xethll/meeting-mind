// Content script for MeetingMind extension
console.log('MeetingMind content script loaded on:', window.location.href)

// Detect meeting platform and inject necessary functionality
function detectMeetingPlatform() {
    const hostname = window.location.hostname

    if (hostname.includes('meet.google.com')) {
        return 'google-meet'
    } else if (hostname.includes('zoom.us')) {
        return 'zoom'
    } else if (hostname.includes('teams.microsoft.com')) {
        return 'microsoft-teams'
    }

    return 'unknown'
}

// Initialize content script
function initialize() {
    const platform = detectMeetingPlatform()
    console.log('Detected meeting platform:', platform)

    // Send platform info to background script
    chrome.runtime.sendMessage({
        action: 'platformDetected',
        platform: platform,
        url: window.location.href,
    })

    // Add platform-specific initialization
    switch (platform) {
        case 'google-meet':
            initializeGoogleMeet()
            break
        case 'zoom':
            initializeZoom()
            break
        case 'microsoft-teams':
            initializeTeams()
            break
        default:
            console.log('Unsupported meeting platform')
    }
}

function initializeGoogleMeet() {
    console.log('Initializing Google Meet integration')
    // TODO: Add Google Meet specific functionality
    // - Detect when user joins/leaves meeting
    // - Monitor meeting controls
    // - Extract participant information if possible
}

function initializeZoom() {
    console.log('Initializing Zoom integration')
    // TODO: Add Zoom specific functionality
}

function initializeTeams() {
    console.log('Initializing Teams integration')
    // TODO: Add Teams specific functionality
}

// Global variables for audio recording
let mediaRecorder = null
let recordedChunks = []

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message)

    switch (message.action) {
        case 'checkMeetingStatus':
            sendResponse({
                inMeeting: checkIfInMeeting(),
                platform: detectMeetingPlatform(),
            })
            break
        case 'initializeAudioCapture':
            initializeAudioCapture(message.streamId)
                .then(() => sendResponse({ success: true }))
                .catch((error) =>
                    sendResponse({ success: false, error: error.message }),
                )
            return true // Keep message channel open
        case 'stopAudioCapture':
            stopAudioCapture()
                .then(() => sendResponse({ success: true }))
                .catch((error) =>
                    sendResponse({ success: false, error: error.message }),
                )
            return true
        default:
            sendResponse({ success: false, error: 'Unknown action' })
    }
})

async function initializeAudioCapture(streamId) {
    try {
        // Get media stream using the stream ID
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId,
            },
        })

        // Initialize MediaRecorder
        recordedChunks = []
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus',
        })

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data)

                // Send audio chunk to background for processing
                chrome.runtime.sendMessage({
                    action: 'audioChunk',
                    chunk: event.data,
                })
            }
        }

        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event)
        }

        // Start recording with 1-second chunks for real-time processing
        mediaRecorder.start(1000)

        console.log('Audio capture started successfully')
    } catch (error) {
        console.error('Error initializing audio capture:', error)
        throw error
    }
}

async function stopAudioCapture() {
    try {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop()

            // Stop all tracks in the stream
            mediaRecorder.stream.getTracks().forEach((track) => track.stop())

            console.log('Audio capture stopped')
        }

        mediaRecorder = null
        recordedChunks = []
    } catch (error) {
        console.error('Error stopping audio capture:', error)
        throw error
    }
}

function checkIfInMeeting() {
    // Basic check - can be enhanced per platform
    const platform = detectMeetingPlatform()

    switch (platform) {
        case 'google-meet':
            // Check if we're in a meeting room (not just the homepage)
            return window.location.pathname.length > 1
        case 'zoom':
            // Check for Zoom meeting indicators
            return (
                document.querySelector('[data-testid="meeting-info"]') !== null
            )
        case 'microsoft-teams':
            // Check for Teams meeting indicators
            return document.querySelector('[data-tid="meeting-stage"]') !== null
        default:
            return false
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize)
} else {
    initialize()
}
