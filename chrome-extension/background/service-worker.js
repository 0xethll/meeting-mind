// Background service worker for MeetingMind extension
console.log('MeetingMind service worker loaded')

// Global variables for recording state
let currentRecordingTabId = null
let audioChunkCount = 0
let processingAudio = false
let lastChunkTime = null
let processTimeout = null

// Extension installation/update handler
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('MeetingMind extension installed/updated:', details.reason)

    // Clean up any existing capture state on startup
    try {
        await cleanupExistingCapture()
        console.log('Initial cleanup completed')
    } catch (cleanupError) {
        console.warn('Initial cleanup failed:', cleanupError)
    }
})

// Handle action button clicks to open side panel
chrome.action.onClicked.addListener(async (tab) => {
    // Open side panel programmatically
    await chrome.sidePanel.open({ tabId: tab.id })
})

// Also cleanup when service worker starts
chrome.runtime.onStartup.addListener(async () => {
    console.log('MeetingMind service worker started')
    try {
        await cleanupExistingCapture()
        console.log('Startup cleanup completed')
    } catch (cleanupError) {
        console.warn('Startup cleanup failed:', cleanupError)
    }
})

// Cleanup functions for managing capture state
async function cleanupExistingCapture() {
    console.log('Cleaning up existing capture state...')

    // Reset internal state
    if (processTimeout) {
        clearTimeout(processTimeout)
        processTimeout = null
    }

    // Stop recording in offscreen document if it exists
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'stop-recording',
            target: 'offscreen',
        })
        console.log('Stopped offscreen recording:', response)
    } catch (offscreenError) {
        console.log(
            'Offscreen document not available for cleanup:',
            offscreenError.message,
        )
    }

    // Reset state variables but keep currentRecordingTabId for now
    audioChunkCount = 0
    processingAudio = false
    lastChunkTime = null
    // Note: currentRecordingTabId will be reset only in handleStopRecording
}

async function forceCleanupCapture(tabId) {
    console.log('Force cleanup capture for tab:', tabId)

    // Try to close any existing offscreen document and recreate it
    try {
        if ('getContexts' in chrome.runtime) {
            const existingContexts = await chrome.runtime.getContexts({
                contextTypes: ['OFFSCREEN_DOCUMENT'],
            })

            if (existingContexts.length > 0) {
                console.log('Closing existing offscreen document...')
                await chrome.offscreen.closeDocument()
                // Wait for document to close
                await new Promise((resolve) => setTimeout(resolve, 500))
            }
        }
    } catch (closeError) {
        console.warn('Could not close offscreen document:', closeError)
    }

    // Reset the creating promise
    creating = null
}

// Setup offscreen document for Chrome 116+ audio capture
let creating // Global promise to avoid concurrency issues
async function setupOffscreenDocument() {
    const offscreenUrl = chrome.runtime.getURL('offscreen.html')

    // Check if offscreen document already exists
    if ('getContexts' in chrome.runtime) {
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [offscreenUrl],
        })

        if (existingContexts.length > 0) {
            console.log('Offscreen document already exists')
            return
        }
    }

    // Create offscreen document if it doesn't exist
    if (creating) {
        await creating
    } else {
        console.log('Creating offscreen document...')
        creating = chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification:
                'Recording audio from meeting tabs for transcription',
        })
        await creating
        creating = null
        console.log('Offscreen document created successfully')
    }
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message)
    console.log('Current recording tab ID:', currentRecordingTabId)

    switch (message.action) {
        case 'startRecording':
            handleStartRecording(message.tabId)
                .then((response) => sendResponse(response))
                .catch((error) =>
                    sendResponse({ success: false, error: error.message }),
                )
            return true // Keep message channel open for async response

        case 'stopRecording':
            handleStopRecording()
                .then((response) => sendResponse(response))
                .catch((error) =>
                    sendResponse({ success: false, error: error.message }),
                )
            return true

        case 'audioChunkReady':
            // Message comes from offscreen document, not tab, so use currentRecordingTabId
            if (currentRecordingTabId !== null) {
                handleAudioChunkReady(message, currentRecordingTabId)
            } else {
                console.warn(
                    'Received audioChunkReady but no active recording tab',
                )
            }
            break

        case 'getRecordingStatus':
            sendResponse({
                isRecording: currentRecordingTabId !== null,
                tabId: currentRecordingTabId,
            })
            break

        case 'summarizeTranscript':
            handleSummarizeTranscript(message.transcript)
                .then((response) => sendResponse(response))
                .catch((error) =>
                    sendResponse({ success: false, error: error.message }),
                )
            return true

        default:
            sendResponse({ success: false, error: 'Unknown action' })
    }
})

async function handleStartRecording(tabId) {
    try {
        // Check if already recording
        if (currentRecordingTabId !== null) {
            console.log(
                'Recording already active on tab:',
                currentRecordingTabId,
            )
            if (currentRecordingTabId === tabId) {
                throw new Error('Recording is already active on this tab')
            } else {
                throw new Error(
                    `Recording is already active on another tab (${currentRecordingTabId}). Please stop the current recording first.`,
                )
            }
        }

        // Stop any existing recordings first (but don't reset currentRecordingTabId yet)
        if (currentRecordingTabId !== null && currentRecordingTabId !== tabId) {
            console.log(
                'Stopping previous recording on tab:',
                currentRecordingTabId,
            )
            await cleanupExistingCapture()
        }

        // Check if tab is already being captured
        try {
            const capturedTabs = await chrome.tabCapture.getCapturedTabs()
            const isTabCaptured = capturedTabs.some(
                (info) =>
                    info.tabId === tabId &&
                    (info.status === 'active' || info.status === 'pending'),
            )

            if (isTabCaptured) {
                console.log(
                    'Tab is already being captured, attempting cleanup...',
                )
                await forceCleanupCapture(tabId)
                // Wait a moment for cleanup to complete
                await new Promise((resolve) => setTimeout(resolve, 1000))
            }
        } catch (captureCheckError) {
            console.warn('Could not check capture status:', captureCheckError)
        }

        // Ensure offscreen document exists
        await setupOffscreenDocument()

        // Test communication with offscreen document
        console.log('Testing communication with offscreen document...')
        try {
            const testResponse = await Promise.race([
                chrome.runtime.sendMessage({
                    type: 'test-ping',
                    target: 'offscreen',
                }),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Communication test timeout')),
                        5000,
                    ),
                ),
            ])
            console.log('Offscreen document test response:', testResponse)

            if (!testResponse || !testResponse.success) {
                throw new Error(
                    'Offscreen document test failed: ' +
                        (testResponse?.error || 'No response'),
                )
            }
        } catch (testError) {
            console.error(
                'Offscreen document communication test failed:',
                testError,
            )

            // Try to recreate the offscreen document
            try {
                console.log('Attempting to recreate offscreen document...')
                await forceCleanupCapture(tabId)
                await setupOffscreenDocument()

                // Test again
                const retestResponse = await chrome.runtime.sendMessage({
                    type: 'test-ping',
                    target: 'offscreen',
                })
                console.log(
                    'Offscreen document retest response:',
                    retestResponse,
                )
            } catch (recreateError) {
                console.error(
                    'Failed to recreate offscreen document:',
                    recreateError,
                )
                throw new Error(
                    'Cannot establish communication with offscreen document. Try reloading the extension.',
                )
            }
        }

        // Get media stream ID for the target tab
        const streamId = await chrome.tabCapture.getMediaStreamId({
            targetTabId: tabId,
        })

        if (!streamId) {
            throw new Error('Failed to get media stream ID')
        }

        console.log('Got stream ID:', streamId, 'for tab:', tabId)

        // Initialize recording state BEFORE starting recording
        currentRecordingTabId = tabId
        audioChunkCount = 0
        processingAudio = false
        lastChunkTime = null
        if (processTimeout) {
            clearTimeout(processTimeout)
            processTimeout = null
        }

        console.log('Set currentRecordingTabId to:', currentRecordingTabId)

        // Send stream ID to offscreen document for audio capture
        console.log('Sending start-recording message to offscreen document...')
        let response
        try {
            response = await chrome.runtime.sendMessage({
                type: 'start-recording',
                target: 'offscreen',
                data: streamId,
            })
            console.log('Received response from offscreen document:', response)
        } catch (messageError) {
            console.error(
                'Failed to send message to offscreen document:',
                messageError,
            )
            throw new Error(
                'Cannot communicate with offscreen document: ' +
                    messageError.message,
            )
        }

        if (!response) {
            throw new Error(
                'No response received from offscreen document. The document may not be loaded properly.',
            )
        }

        if (!response.success) {
            const errorMsg =
                response.error || 'Unknown error from offscreen document'
            console.error('Offscreen document returned error:', errorMsg)
            throw new Error(
                'Failed to start recording in offscreen document: ' + errorMsg,
            )
        }

        console.log('Audio capture started successfully for tab:', tabId)

        return { success: true }
    } catch (error) {
        console.error('Error starting recording:', error)

        // Attempt cleanup on error
        try {
            await cleanupExistingCapture()
        } catch (cleanupError) {
            console.warn('Cleanup after error failed:', cleanupError)
        }

        // Provide user-friendly error messages
        if (
            error.message.includes('Cannot capture a tab with an active stream')
        ) {
            throw new Error(
                'Another recording session is active. Please refresh the meeting tab and try again.',
            )
        }

        throw error
    }
}

async function handleStopRecording() {
    try {
        // Send stop message to offscreen document
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'stop-recording',
                target: 'offscreen',
            })

            if (!response || !response.success) {
                console.warn(
                    'Failed to stop recording in offscreen document:',
                    response?.error,
                )
            }
        } catch (messageError) {
            console.warn(
                'Could not send stop message to offscreen document:',
                messageError,
            )
            // Continue with cleanup even if offscreen document communication fails
        }

        console.log('Recording stopped for tab:', currentRecordingTabId)

        // Reset recording state
        currentRecordingTabId = null
        audioChunkCount = 0
        processingAudio = false
        lastChunkTime = null
        if (processTimeout) {
            clearTimeout(processTimeout)
            processTimeout = null
        }

        return { success: true }
    } catch (error) {
        console.error('Error stopping recording:', error)
        throw error
    }
}

function handleAudioChunkReady(message, tabId) {
    console.log(
        'handleAudioChunkReady called with tabId:',
        tabId,
        'currentRecordingTabId:',
        currentRecordingTabId,
    )

    if (tabId !== currentRecordingTabId) {
        console.log('Ignoring chunk - tab mismatch')
        return // Ignore chunks from non-recording tabs
    }

    audioChunkCount++
    lastChunkTime = Date.now()

    console.log(
        '🎙️ NEW AUDIO CHUNK:',
        message.size,
        'bytes, type:',
        message.mimeType,
        'total chunks:',
        audioChunkCount,
    )

    // Clear any existing timeout
    if (processTimeout) {
        clearTimeout(processTimeout)
        processTimeout = null
    }

    // DIFFERENTIAL PROCESSING - Process only new audio chunks to prevent duplicates
    if (!processingAudio) {
        console.log(
            '*** TRIGGERING DIFFERENTIAL PROCESSING for new chunks',
            audioChunkCount,
            '***',
        )
        processAudioBatch(tabId)
    } else {
        console.log(
            'Already processing - will queue this chunk for next batch:',
            audioChunkCount,
        )
        // Queue processing for next available slot
    }
}

async function processAudioBatch(tabId) {
    console.log('=== ENTERING processAudioBatch ===')
    console.log(
        'audioChunkCount:',
        audioChunkCount,
        'processingAudio:',
        processingAudio,
        'tabId:',
        tabId,
    )

    if (audioChunkCount === 0 || processingAudio) {
        console.log('=== EARLY RETURN from processAudioBatch ===', {
            audioChunkCount,
            processingAudio,
        })
        return
    }

    processingAudio = true
    console.log('=== SET processingAudio = true ===')

    try {
        console.log('Requesting audio data from offscreen document...')

        // Request audio data from offscreen document
        let audioResponse
        try {
            audioResponse = await chrome.runtime.sendMessage({
                type: 'get-audio-data',
                target: 'offscreen',
            })

            if (!audioResponse) {
                throw new Error(
                    'Offscreen document did not respond to get-audio-data message',
                )
            }

            if (!audioResponse.success) {
                throw new Error(
                    audioResponse.error || 'Failed to get audio data',
                )
            }
        } catch (messageError) {
            console.error(
                'Error communicating with offscreen document:',
                messageError,
            )
            throw new Error(
                `Offscreen document communication failed: ${messageError.message}`,
            )
        }

        console.log(
            '📦 BATCH RECEIVED - Audio data:',
            audioResponse.size,
            'bytes, type:',
            audioResponse.mimeType,
            'from',
            audioResponse.chunksProcessed || 1,
            'chunks',
        )

        // Convert base64 back to blob with proper handling
        try {
            const binaryString = atob(audioResponse.audioData)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
            }

            const audioBlob = new Blob([bytes], {
                type: audioResponse.mimeType,
            })

            console.log(
                'Created audio blob:',
                audioBlob.size,
                'bytes, type:',
                audioBlob.type,
            )
            console.log(
                'First 32 bytes as hex:',
                Array.from(bytes.slice(0, 32))
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join(' '),
            )

            // Request silence analysis from offscreen document
            console.log('Requesting silence analysis from offscreen document...')
            const silenceResponse = await chrome.runtime.sendMessage({
                type: 'analyze-silence',
                target: 'offscreen',
                audioData: audioResponse.audioData,
                mimeType: audioResponse.mimeType
            })
            
            if (silenceResponse && silenceResponse.success && silenceResponse.isSilent) {
                console.log('🔇 Audio contains mostly silence - skipping transcription')
                console.log(`📊 Silence metrics: RMS=${silenceResponse.metrics?.rmsVolume.toFixed(6)}, Speech=${(silenceResponse.metrics?.speechRatio * 100).toFixed(1)}%`)
                return // Skip processing silent audio
            } else if (silenceResponse && silenceResponse.success) {
                console.log('🔊 Audio contains speech - proceeding with transcription')
                console.log(`📊 Audio metrics: RMS=${silenceResponse.metrics?.rmsVolume.toFixed(6)}, Speech=${(silenceResponse.metrics?.speechRatio * 100).toFixed(1)}%`)
            } else {
                console.log('⚠️ Could not analyze audio for silence, proceeding with transcription')
            }

            // Use the reconstructed blob for transcription
            var finalAudioBlob = audioBlob
        } catch (conversionError) {
            console.error('Error converting base64 to blob:', conversionError)
            throw conversionError
        }

        // Reset chunk count and clear timeout after successful batch processing
        const processedChunkCount = audioResponse.chunksProcessed || 1
        console.log(
            `🔄 BATCH COMPLETE: Processed ${processedChunkCount} audio chunks, resetting counters`,
        )

        audioChunkCount = 0
        if (processTimeout) {
            clearTimeout(processTimeout)
            processTimeout = null
        }

        // Use managed API key approach
        const transcription = await transcribeAudio(finalAudioBlob)

        if (transcription.text && transcription.text.trim()) {
            console.log('Raw transcription:', transcription.text)

            // Filter out silence, noise, and non-meaningful content
            if (isValidTranscription(transcription.text.trim())) {
                console.log('✅ Valid transcription:', transcription.text)

                // Send transcription to popup
                chrome.runtime.sendMessage({
                    action: 'transcriptionUpdate',
                    data: {
                        text: transcription.text,
                    },
                })
            } else {
                console.log(
                    '🔇 Filtered out invalid/silent transcription:',
                    transcription.text,
                )
            }
        } else {
            console.log('🔇 Empty transcription - likely silence or no audio')
        }
    } catch (error) {
        console.error('Error processing audio batch:', error)

        // Send error to popup
        chrome.runtime.sendMessage({
            action: 'error',
            error: 'Transcription failed: ' + error.message,
        })
    } finally {
        processingAudio = false
    }
}

async function transcribeAudio(audioBlob) {
    // Get API key from storage (user must set this first)
    const storage = await chrome.storage.local.get(['fireworksApiKey'])
    const MANAGED_API_KEY = storage.fireworksApiKey

    if (!MANAGED_API_KEY || MANAGED_API_KEY === 'YOUR_API_KEY_HERE') {
        throw new Error(
            'API key not configured. Please set your Fireworks API key in extension settings.',
        )
    }

    console.log('Preparing audio for transcription:', {
        size: audioBlob.size,
        type: audioBlob.type,
        constructor: audioBlob.constructor.name,
    })

    // Verify we have a valid audio blob
    if (audioBlob.size === 0) {
        throw new Error('Audio blob is empty')
    }

    const formData = new FormData()

    // Create a proper file with the correct filename extension
    // Fireworks supports: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm
    let filename = 'audio.wav' // Default to WAV for better transcription
    if (audioBlob.type.includes('wav')) {
        filename = 'audio.wav'
    } else if (audioBlob.type.includes('webm')) {
        filename = 'audio.webm'
    } else if (audioBlob.type.includes('ogg')) {
        filename = 'audio.ogg'
    } else if (audioBlob.type.includes('mp3')) {
        filename = 'audio.mp3'
    }

    console.log(
        'Audio format for transcription:',
        filename,
        'MIME type:',
        audioBlob.type,
    )

    formData.append('file', audioBlob, filename)
    formData.append('model', 'whisper-v3-turbo')
    formData.append('temperature', '0')
    formData.append('vad_model', 'silero')
    formData.append('response_format', 'json')

    console.log(
        'Sending audio to Fireworks Whisper:',
        filename,
        audioBlob.size,
        'bytes',
    )

    const response = await fetch(
        'https://audio-turbo.us-virginia-1.direct.fireworks.ai/v1/audio/transcriptions',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${MANAGED_API_KEY}`,
            },
            body: formData,
        },
    )

    if (!response.ok) {
        console.error('Fireworks API error details:', {
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            headers: Object.fromEntries(response.headers.entries()),
            type: response.type,
            redirected: response.redirected,
        })

        // Try to get error response body if available
        let errorText = ''
        try {
            errorText = await response.text()
            console.error('Error response body:', errorText)

            // Check for WebM fragment error
            if (
                errorText.includes('Could not transcode audio') &&
                audioBlob.type.includes('webm')
            ) {
                throw new Error(
                    'WebM audio chunk is invalid (fragment without header). The extension will now use header prepending for subsequent chunks.',
                )
            }
        } catch (bodyError) {
            console.error('Could not read error response body:', bodyError)
        }

        throw new Error(
            `Fireworks API error: ${response.status} ${response.statusText}`,
        )
    }

    return await response.json()
}

// Intelligent transcription filtering to prevent noise/silence being transcribed
function isValidTranscription(text) {
    if (!text || text.length < 3) {
        return false // Too short to be meaningful
    }

    // Common patterns that indicate silence, noise, or invalid transcription
    const invalidPatterns = [
        // Silence indicators
        /^[\s\.\,\-_]*$/i, // Only punctuation/whitespace
        /^(uh|um|hmm|ah|eh|oh)+[\s\.\,]*$/i, // Just filler words
        /^[^a-zA-Z0-9]*$/, // No alphanumeric characters

        // Noise patterns (common Whisper artifacts)
        /^(you|the|a|and|to|of|in|that|it|is|for|on|with|as|be)+[\s\.\,]*$/i, // Just common words
        /^[\.\,\!\?\-_\s]+$/, // Just punctuation
        /^(music|sound|noise|audio|background)[\s\.\,]*$/i, // Audio artifacts

        // Repeated characters (transcription artifacts)
        /(.)\1{4,}/, // Same character repeated 5+ times
        /^([a-z])\1*[\s\.\,]*$/i, // Single repeated letter

        // Very short repeated words
        /^(\w{1,2}\s*){3,}$/, // Short words repeated multiple times

        // Common Whisper silence artifacts
        /^(thank you|thanks|bye|okay|ok|yes|yeah|no|mm|mhm)[\s\.\,]*$/i,

        // Artifacts from system sounds
        /^(click|pop|beep|ding|notification)[\s\.\,]*$/i,
    ]

    // Check against invalid patterns
    for (const pattern of invalidPatterns) {
        if (pattern.test(text)) {
            return false
        }
    }

    // Additional checks for valid content
    const wordCount = text.trim().split(/\s+/).length

    // Require minimum meaningful content
    if (wordCount < 2) {
        return false // Single word is likely noise
    }

    // Check for minimum content-to-filler ratio
    const fillerWords =
        /\b(um|uh|ah|eh|oh|hmm|mm|mhm|like|you know|so|well|actually)\b/gi
    const fillerMatches = text.match(fillerWords) || []
    const fillerRatio = fillerMatches.length / wordCount

    if (fillerRatio > 0.7) {
        // More than 70% filler words
        return false
    }

    // Check for minimum vowels (real speech should have vowels)
    const vowelCount = (text.match(/[aeiouAEIOU]/g) || []).length
    const vowelRatio = vowelCount / text.length

    if (vowelRatio < 0.15) {
        // Less than 15% vowels is suspicious
        return false
    }

    console.log(
        `📊 Transcription validation: "${text}" - Words: ${wordCount}, Filler ratio: ${fillerRatio.toFixed(
            2,
        )}, Vowel ratio: ${vowelRatio.toFixed(2)}`,
    )

    return true // Passed all checks
}


async function handleSummarizeTranscript(transcript) {
    try {
        if (!transcript || transcript.trim() === '') {
            throw new Error('No transcript content to summarize')
        }

        // Get API key from storage
        const storage = await chrome.storage.local.get(['fireworksApiKey'])
        const apiKey = storage.fireworksApiKey

        if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
            throw new Error('API key not configured')
        }

        console.log(
            'Generating summary for transcript length:',
            transcript.length,
        )

        const summary = await generateMeetingSummary(transcript, apiKey)

        // Send summary to popup
        chrome.runtime.sendMessage({
            action: 'summaryGenerated',
            data: summary,
        })

        return { success: true, summary }
    } catch (error) {
        console.error('Error summarizing transcript:', error)

        // Send error to popup
        chrome.runtime.sendMessage({
            action: 'summaryError',
            error: error.message,
        })

        throw error
    }
}

async function generateMeetingSummary(transcript, apiKey) {
    const prompt = `Please analyze this meeting transcript and provide a comprehensive summary with the following sections:

## Meeting Overview
Brief description of the meeting purpose and context

## Key Discussion Points
Main topics and themes discussed (bullet points)

## Action Items
Specific tasks or commitments mentioned (if any)

## Decisions Made
Important decisions or conclusions reached (if any)

## Participants & Insights
Notable contributions or viewpoints (if identifiable from context)

## Follow-up Required
Next steps or pending items mentioned

Transcript to analyze:
${transcript}

Please provide a well-structured, professional summary that captures the essential information from this meeting.`

    const response = await fetch(
        'https://api.fireworks.ai/inference/v1/chat/completions',
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'accounts/sentientfoundation-serverless/models/dobby-mini-unhinged-plus-llama-3-1-8b',
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                max_tokens: 2048,
                temperature: 0.7,
                top_p: 0.9,
            }),
        },
    )

    if (!response.ok) {
        const errorText = await response.text()
        console.error('Fireworks API error:', response.status, errorText)
        throw new Error(
            `Failed to generate summary: ${response.status} ${response.statusText}`,
        )
    }

    const result = await response.json()

    if (!result.choices || !result.choices[0] || !result.choices[0].message) {
        throw new Error('Invalid response format from Fireworks API')
    }

    return result.choices[0].message.content
}
