// Offscreen document for handling media capture in Chrome 116+
console.log('MeetingMind offscreen document loaded')
console.log('Current URL:', window.location.href)
console.log('Chrome runtime available:', !!chrome.runtime)
console.log('Navigator mediaDevices available:', !!navigator.mediaDevices)

// RecordRTC-based audio recording with automatic chunking

// Test message receiving capability
window.addEventListener('load', () => {
    console.log('Offscreen document fully loaded and ready')
})

let recorder = null
let recordedChunks = []
let isRecording = false
let currentStream = null
let chunkInterval = null

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Offscreen document received message:', message)

    if (message.target !== 'offscreen') {
        console.log('Message not targeted to offscreen, ignoring')
        return false
    }

    // Handle messages based on type
    if (message.type === 'test-ping') {
        console.log('Offscreen document received test ping')
        sendResponse({
            success: true,
            message: 'Offscreen document is alive and responding',
        })
        return true
    }

    if (message.type === 'start-recording') {
        console.log('Offscreen document handling start-recording...')
        handleStartRecording(message.data)
            .then(() => {
                console.log('Offscreen document successfully started recording')
                sendResponse({ success: true })
            })
            .catch((error) => {
                console.error('Error in handleStartRecording:', error)
                sendResponse({ success: false, error: error.message })
            })
        return true // Async response
    }

    if (message.type === 'stop-recording') {
        console.log('Offscreen document handling stop-recording...')
        handleStopRecording()
            .then(() => {
                console.log('Offscreen document successfully stopped recording')
                sendResponse({ success: true })
            })
            .catch((error) => {
                console.error('Error in handleStopRecording:', error)
                sendResponse({ success: false, error: error.message })
            })
        return true // Async response
    }

    if (message.type === 'get-audio-data') {
        console.log('Offscreen document handling get-audio-data...')
        handleGetAudioData(sendResponse)
        return true // Async response handled by handleGetAudioData
    }

    // Unknown message type
    console.error('Unknown message type:', message.type)
    sendResponse({
        success: false,
        error: 'Unknown message type: ' + message.type,
    })
    return true
})

async function handleStartRecording(streamId) {
    try {
        console.log('Starting recording with streamId:', streamId)

        if (!streamId) {
            throw new Error('No stream ID provided')
        }

        // Get media stream using the stream ID
        const constraints = {
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId,
                },
            },
        }

        console.log('Getting user media with constraints:', constraints)

        try {
            currentStream = await navigator.mediaDevices.getUserMedia(
                constraints,
            )
        } catch (getUserMediaError) {
            console.error('getUserMedia failed:', getUserMediaError)
            throw new Error(
                'Failed to get media stream: ' + getUserMediaError.message,
            )
        }

        if (!currentStream || !currentStream.getAudioTracks().length) {
            throw new Error('No audio track found in stream')
        }

        console.log(
            'Audio stream obtained, tracks:',
            currentStream.getAudioTracks().length,
        )

        // Continue to play the captured audio to the user
        const output = new AudioContext()
        const source = output.createMediaStreamSource(currentStream)
        source.connect(output.destination)

        // Initialize RecordRTC for better audio handling
        recordedChunks = []
        
        // Configure RecordRTC options
        const recordRTCOptions = {
            type: 'audio',
            recorderType: StereoAudioRecorder,
            numberOfAudioChannels: 2,
            checkForInactiveTracks: true,
            bufferSize: 16384,
            sampleRate: 48000,
            mimeType: 'audio/wav' // WAV format for better transcription compatibility
        }

        // Handle browser compatibility
        const isEdge = navigator.userAgent.indexOf('Edge') !== -1
        if (isEdge) {
            recordRTCOptions.numberOfAudioChannels = 1
        }

        console.log('Initializing RecordRTC with options:', recordRTCOptions)

        recorder = RecordRTC(currentStream, recordRTCOptions)
        
        recorder.startRecording()
        isRecording = true
        
        // Create chunks every 4 seconds for real-time transcription
        chunkInterval = setInterval(() => {
            if (recorder && isRecording) {
                // Stop current recording and get the chunk
                recorder.stopRecording(() => {
                    const blob = recorder.getBlob()
                    
                    console.log(
                        'Audio chunk generated:',
                        blob.size,
                        'bytes, type:',
                        blob.type,
                    )
                    
                    // Store the complete chunk (no header management needed)
                    recordedChunks.push(blob)
                    
                    // Notify background script that new chunk is ready
                    chrome.runtime.sendMessage({
                        action: 'audioChunkReady',
                        size: blob.size,
                        mimeType: blob.type,
                    })
                    
                    // Start a new recording session for the next chunk
                    if (isRecording && currentStream) {
                        recorder = RecordRTC(currentStream, recordRTCOptions)
                        recorder.startRecording()
                    }
                })
            }
        }, 4000)

        console.log('RecordRTC recording started with WAV format')
    } catch (error) {
        console.error('Error starting recording in offscreen document:', error)
        throw error
    }
}

async function handleStopRecording() {
    try {
        console.log('Stopping RecordRTC recording in offscreen document...')
        
        isRecording = false
        
        // Clear the chunk interval
        if (chunkInterval) {
            clearInterval(chunkInterval)
            chunkInterval = null
        }

        // Stop RecordRTC recorder if active
        if (recorder) {
            recorder.stopRecording(() => {
                // Get the final chunk
                const finalBlob = recorder.getBlob()
                if (finalBlob && finalBlob.size > 0) {
                    recordedChunks.push(finalBlob)
                    console.log('Final audio chunk saved:', finalBlob.size, 'bytes')
                }
                recorder = null
            })
        }

        // Stop all stream tracks
        if (currentStream) {
            currentStream.getTracks().forEach((track) => {
                if (track.readyState === 'live') {
                    track.stop()
                    console.log('Stopped track:', track.kind, track.id)
                }
            })
            currentStream = null
        }

        console.log('RecordRTC recording stopped and cleaned up')
    } catch (error) {
        console.error('Error stopping RecordRTC recording:', error)

        // Force cleanup even if there are errors
        isRecording = false
        if (chunkInterval) {
            clearInterval(chunkInterval)
            chunkInterval = null
        }
        recorder = null
        currentStream = null

        throw error
    }
}

function handleGetAudioData(sendResponse) {
    console.log(
        'Getting RecordRTC audio data, total chunks:',
        recordedChunks.length
    )

    // Get the latest unprocessed chunk
    if (recordedChunks.length > 0) {
        try {
            // Get the most recent chunk (RecordRTC chunks are complete audio files)
            const latestChunk = recordedChunks[recordedChunks.length - 1]
            
            if (!latestChunk || latestChunk.size === 0) {
                sendResponse({
                    success: false,
                    error: 'No valid audio chunks available',
                })
                return
            }

            console.log(
                'Sending RecordRTC audio chunk:',
                latestChunk.size,
                'bytes, type:',
                latestChunk.type,
            )

            // Convert to base64 for message passing
            const reader = new FileReader()
            reader.onload = () => {
                try {
                    const base64Data = reader.result.split(',')[1] // Remove data:mime;base64, prefix
                    sendResponse({
                        success: true,
                        audioData: base64Data,
                        mimeType: latestChunk.type,
                        size: latestChunk.size,
                    })

                    // Remove the processed chunk to avoid reprocessing
                    recordedChunks.pop()
                    console.log(
                        'Audio chunk sent and removed, remaining chunks:',
                        recordedChunks.length,
                    )
                } catch (conversionError) {
                    console.error(
                        'Error in FileReader onload:',
                        conversionError,
                    )
                    sendResponse({
                        success: false,
                        error: 'Failed to process audio data',
                    })
                }
            }

            reader.onerror = (error) => {
                console.error('FileReader error:', error)
                sendResponse({
                    success: false,
                    error: 'Failed to read audio data',
                })
            }

            reader.readAsDataURL(latestChunk)
        } catch (error) {
            console.error('Error processing RecordRTC audio data:', error)
            sendResponse({
                success: false,
                error: 'Failed to process audio chunk: ' + error.message,
            })
        }
    } else {
        console.log('No RecordRTC audio chunks available to process')
        sendResponse({
            success: false,
            error: 'No audio chunks available',
        })
    }
}
