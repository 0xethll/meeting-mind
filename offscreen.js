// Offscreen document for handling media capture in Chrome 116+
console.log('MeetingMind offscreen document loaded')
console.log('Current URL:', window.location.href)
console.log('Chrome runtime available:', !!chrome.runtime)
console.log('Navigator mediaDevices available:', !!navigator.mediaDevices)

// Accumulation-based approach for proper WebM concatenation

// Test message receiving capability
window.addEventListener('load', () => {
    console.log('Offscreen document fully loaded and ready')
})

let mediaRecorder = null
let recordedChunks = []
let processedChunkCount = 0 // Track how many chunks have been processed
let isRecording = false
let currentStream = null
let webmHeaderChunk = null

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

        // Initialize MediaRecorder for capturing chunks - prefer WAV for transcription
        let mimeType = 'audio/wav'
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            // Fallback to WebM if WAV not supported
            mimeType = 'audio/webm;codecs=opus'
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/webm'
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    throw new Error('Browser does not support audio recording')
                }
            }
        }

        console.log('Selected audio format:', mimeType)

        recordedChunks = []
        processedChunkCount = 0
        webmHeaderChunk = null

        mediaRecorder = new MediaRecorder(currentStream, {
            mimeType: mimeType,
        })

        mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                if (!webmHeaderChunk) {
                    webmHeaderChunk = event.data
                    console.log(
                        'WebM header chunk captured:',
                        webmHeaderChunk.size,
                        'bytes',
                    )
                }

                // Store individual chunk for processing (no accumulation to avoid duplicates)
                recordedChunks.push(event.data)

                console.log(
                    'Audio chunk received:',
                    event.data.size,
                    'bytes, type:',
                    event.data.type,
                )
                console.log('Total chunks buffered:', recordedChunks.length)

                // Notify background script that new chunk is ready
                chrome.runtime.sendMessage({
                    action: 'audioChunkReady',
                    size: event.data.size,
                    mimeType: event.data.type,
                })
            }
        }

        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event)
            chrome.runtime.sendMessage({
                action: 'error',
                error: 'Audio recording error: ' + event.error,
            })
        }

        mediaRecorder.onstop = () => {
            console.log('MediaRecorder stopped')
            isRecording = false
        }

        // Start recording and request data periodically
        mediaRecorder.start()
        isRecording = true

        // Request data every 2 seconds for faster transcription
        const dataRequestInterval = setInterval(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.requestData()
                console.log('Requested audio data from MediaRecorder')
            } else {
                clearInterval(dataRequestInterval)
            }
        }, 2000) // Reduced from 5000 to 2000ms for instant processing

        console.log('Recording started with mime type:', mimeType)
    } catch (error) {
        console.error('Error starting recording in offscreen document:', error)
        throw error
    }
}

async function handleStopRecording() {
    try {
        console.log('Stopping recording in offscreen document...')

        // Stop media recorder if active
        if (mediaRecorder) {
            if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop()
            }
            mediaRecorder = null
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

        // Clear recorded data and reset processing state
        recordedChunks = []
        processedChunkCount = 0
        isRecording = false
        webmHeaderChunk = null

        console.log('Recording stopped and cleaned up in offscreen document')
    } catch (error) {
        console.error('Error stopping recording:', error)

        // Force cleanup even if there are errors
        mediaRecorder = null
        currentStream = null
        recordedChunks = []
        processedChunkCount = 0
        isRecording = false
        webmHeaderChunk = null

        throw error
    }
}

function handleGetAudioData(sendResponse) {
    console.log(
        'Getting audio data, total chunks:',
        recordedChunks.length,
        'processed:',
        processedChunkCount,
    )

    // Only send NEW chunks that haven't been processed yet
    const newChunks = recordedChunks.slice(processedChunkCount)

    if (webmHeaderChunk && newChunks.length > 0) {
        try {
            // Filter valid new chunks only
            const validNewChunks = newChunks.filter(
                (chunk) => chunk && chunk.size > 0,
            )

            if (validNewChunks.length === 0) {
                sendResponse({
                    success: false,
                    error: 'No valid new audio chunks available',
                })
                return
            }

            // const combinedNewBlob = new Blob(validNewChunks, {
            //     type: validNewChunks[0].type || 'audio/webm;codecs=opus',
            // })
            const combinedNewBlob = new Blob(
                [webmHeaderChunk, ...validNewChunks],
                {
                    type: webmHeaderChunk.type,
                },
            )

            console.log(
                'Created NEW chunk blob:',
                combinedNewBlob.size,
                'bytes, type:',
                combinedNewBlob.type,
            )
            console.log(
                'Processing chunks',
                processedChunkCount,
                'to',
                recordedChunks.length - 1,
            )

            // Convert to base64 for message passing
            const reader = new FileReader()
            reader.onload = () => {
                try {
                    const base64Data = reader.result.split(',')[1] // Remove data:mime;base64, prefix
                    sendResponse({
                        success: true,
                        audioData: base64Data,
                        mimeType: combinedNewBlob.type,
                        size: combinedNewBlob.size,
                    })

                    // Mark these chunks as processed (don't clear them, just track count)
                    processedChunkCount = recordedChunks.length
                    console.log(
                        'Audio data sent, processed chunk count now:',
                        processedChunkCount,
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

            reader.readAsDataURL(combinedNewBlob)
        } catch (error) {
            console.error('Error processing audio data:', error)
            sendResponse({
                success: false,
                error: 'Failed to process audio chunks: ' + error.message,
            })
        }
    } else {
        sendResponse({
            success: false,
            error: 'No new audio data available for processing',
        })
    }
}
