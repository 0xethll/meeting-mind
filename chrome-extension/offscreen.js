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

    if (message.type === 'analyze-silence') {
        console.log('Offscreen document handling analyze-silence...')
        handleAnalyzeSilence(message, sendResponse)
        return true // Async response handled by handleAnalyzeSilence
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
            mimeType: 'audio/wav', // WAV format for better transcription compatibility
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

        // Create chunks every 5 seconds for real-time transcription
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
        }, 5000)

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
                    console.log(
                        'Final audio chunk saved:',
                        finalBlob.size,
                        'bytes',
                    )
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
        'Getting RecordRTC audio data for batch processing, total chunks:',
        recordedChunks.length,
    )

    // Batch process ALL unprocessed chunks
    if (recordedChunks.length > 0) {
        try {
            // Get ALL chunks for batch processing
            const chunksToProcess = [...recordedChunks] // Create a copy
            
            if (chunksToProcess.some(chunk => !chunk || chunk.size === 0)) {
                console.warn('Some chunks are empty, filtering them out')
                const validChunks = chunksToProcess.filter(chunk => chunk && chunk.size > 0)
                if (validChunks.length === 0) {
                    sendResponse({
                        success: false,
                        error: 'No valid audio chunks available',
                    })
                    return
                }
            }

            console.log(
                `🎵 BATCH PROCESSING: Merging ${chunksToProcess.length} audio chunks for transcription`,
                'Total size:', chunksToProcess.reduce((sum, chunk) => sum + chunk.size, 0), 'bytes'
            )

            // Merge all chunks into a single blob for batch processing
            const mergedBlob = new Blob(chunksToProcess, {
                type: chunksToProcess[0].type || 'audio/webm;codecs=opus'
            })

            console.log(
                'Merged audio blob:',
                mergedBlob.size,
                'bytes, type:',
                mergedBlob.type,
                'from', chunksToProcess.length, 'chunks'
            )

            // Convert merged blob to base64 for message passing
            const reader = new FileReader()
            reader.onload = () => {
                try {
                    const base64Data = reader.result.split(',')[1] // Remove data:mime;base64, prefix
                    sendResponse({
                        success: true,
                        audioData: base64Data,
                        mimeType: mergedBlob.type,
                        size: mergedBlob.size,
                        chunksProcessed: chunksToProcess.length
                    })

                    // Clear ALL processed chunks after successful batch processing
                    recordedChunks.length = 0 // Clear the entire array
                    console.log(
                        `✅ BATCH PROCESSED: ${chunksToProcess.length} chunks sent and cleared. Remaining chunks:`,
                        recordedChunks.length,
                    )
                } catch (conversionError) {
                    console.error(
                        'Error in FileReader onload during batch processing:',
                        conversionError,
                    )
                    sendResponse({
                        success: false,
                        error: 'Failed to process batch audio data: ' + conversionError.message,
                    })
                }
            }

            reader.onerror = (error) => {
                console.error('FileReader error during batch processing:', error)
                sendResponse({
                    success: false,
                    error: 'Failed to read batch audio data',
                })
            }

            reader.readAsDataURL(mergedBlob)
        } catch (error) {
            console.error('Error processing RecordRTC batch audio data:', error)
            sendResponse({
                success: false,
                error: 'Failed to process audio batch: ' + error.message,
            })
        }
    } else {
        console.log('No RecordRTC audio chunks available for batch processing')
        sendResponse({
            success: false,
            error: 'No audio chunks available',
        })
    }
}

// Handle silence analysis request from service worker
async function handleAnalyzeSilence(message, sendResponse) {
    try {
        console.log('Analyzing audio for silence in offscreen document...')
        
        if (!message.audioData || !message.mimeType) {
            sendResponse({
                success: false,
                error: 'Missing audio data or MIME type'
            })
            return
        }
        
        // Convert base64 audio data back to blob
        const binaryString = atob(message.audioData)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
        }
        
        const audioBlob = new Blob([bytes], { type: message.mimeType })
        
        // Analyze the audio blob for silence
        const analysisResult = await analyzeAudioForSilence(audioBlob)
        
        sendResponse({
            success: true,
            isSilent: analysisResult.isSilent,
            metrics: analysisResult.metrics
        })
        
    } catch (error) {
        console.error('Error in handleAnalyzeSilence:', error)
        sendResponse({
            success: false,
            error: error.message
        })
    }
}

// Analyze audio blob for silence using Web Audio API (available in offscreen document)
async function analyzeAudioForSilence(audioBlob) {
    try {
        // Create an AudioContext for analysis
        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        
        // Convert blob to ArrayBuffer
        const arrayBuffer = await audioBlob.arrayBuffer()
        
        // Decode audio data
        let audioBuffer
        try {
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        } catch (decodeError) {
            console.warn('Could not decode audio for silence analysis:', decodeError)
            // If we can't decode, assume it's not silent to be safe
            audioContext.close()
            return { isSilent: false, metrics: null }
        }
        
        // Get the first channel data (mono or left channel)
        const channelData = audioBuffer.getChannelData(0)
        const sampleRate = audioBuffer.sampleRate
        const duration = audioBuffer.duration
        
        console.log(`🔊 Audio analysis: ${duration.toFixed(2)}s, ${channelData.length} samples, ${sampleRate}Hz`)
        
        // Calculate RMS (Root Mean Square) for volume analysis
        let sumOfSquares = 0
        let maxAmplitude = 0
        let aboveThresholdSamples = 0
        
        const SILENCE_THRESHOLD = 0.01 // Amplitude threshold for "silence"
        const MIN_VOLUME_THRESHOLD = 0.001 // RMS threshold
        
        for (let i = 0; i < channelData.length; i++) {
            const amplitude = Math.abs(channelData[i])
            sumOfSquares += amplitude * amplitude
            
            if (amplitude > maxAmplitude) {
                maxAmplitude = amplitude
            }
            
            if (amplitude > SILENCE_THRESHOLD) {
                aboveThresholdSamples++
            }
        }
        
        const rmsVolume = Math.sqrt(sumOfSquares / channelData.length)
        const speechRatio = aboveThresholdSamples / channelData.length
        
        // Additional check for dynamic range
        const dynamicRange = maxAmplitude
        
        // Determine if audio is mostly silent
        const isLikelySilent = (
            rmsVolume < MIN_VOLUME_THRESHOLD ||    // Very low RMS volume
            speechRatio < 0.02 ||                  // Less than 2% above threshold
            dynamicRange < 0.005                   // Very low dynamic range
        )
        
        const metrics = {
            rmsVolume,
            maxAmplitude,
            speechRatio,
            dynamicRange,
            duration,
            sampleRate
        }
        
        console.log(`📊 Silence Analysis:`)
        console.log(`   RMS Volume: ${rmsVolume.toFixed(6)} (threshold: ${MIN_VOLUME_THRESHOLD})`)
        console.log(`   Max Amplitude: ${maxAmplitude.toFixed(6)}`)
        console.log(`   Speech Ratio: ${(speechRatio * 100).toFixed(1)}% (threshold: 2%)`)
        console.log(`   Dynamic Range: ${dynamicRange.toFixed(6)}`)
        console.log(`   Verdict: ${isLikelySilent ? '🔇 SILENT' : '🔊 HAS_AUDIO'}`)
        
        // Clean up
        audioContext.close()
        
        return { 
            isSilent: isLikelySilent, 
            metrics 
        }
        
    } catch (error) {
        console.error('Error analyzing audio for silence:', error)
        // If analysis fails, assume it's not silent to be safe
        return { isSilent: false, metrics: null }
    }
}
