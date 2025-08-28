// Popup script for MeetingMind extension
class MeetingMindPopup {
    constructor() {
        this.isRecording = false
        this.transcript = []

        this.initializeElements()
        this.attachEventListeners()
        this.loadStoredData()
    }

    initializeElements() {
        this.startBtn = document.getElementById('startBtn')
        this.stopBtn = document.getElementById('stopBtn')
        this.statusDot = document.getElementById('statusDot')
        this.statusText = document.getElementById('statusText')
        this.transcriptContainer = document.getElementById(
            'transcriptContainer',
        )
        this.clearBtn = document.getElementById('clearBtn')
        this.settingsBtn = document.getElementById('settingsBtn')
        this.exportBtn = document.getElementById('exportBtn')
    }

    attachEventListeners() {
        this.startBtn.addEventListener('click', () => this.startRecording())
        this.stopBtn.addEventListener('click', () => this.stopRecording())
        this.clearBtn.addEventListener('click', () => this.clearTranscript())
        this.settingsBtn.addEventListener('click', () => this.openSettings())
        this.exportBtn.addEventListener('click', () => this.exportTranscript())

        // Listen for messages from background script
        chrome.runtime.onMessage.addListener(
            (message, sender, sendResponse) => {
                this.handleMessage(message)
            },
        )
    }

    async loadStoredData() {
        try {
            const data = await chrome.storage.local.get([
                'isRecording',
                'transcript',
                'usageData',
            ])

            // Check actual recording status from background script
            try {
                const backgroundStatus = await chrome.runtime.sendMessage({
                    action: 'getRecordingStatus'
                })
                
                console.log('Background recording status:', backgroundStatus)
                
                if (backgroundStatus && backgroundStatus.isRecording) {
                    this.isRecording = true
                    this.updateUIState('recording')
                    await chrome.storage.local.set({ isRecording: true })
                } else {
                    this.isRecording = false
                    this.updateUIState('ready')
                    await chrome.storage.local.set({ isRecording: false })
                }
            } catch (statusError) {
                console.warn('Could not get background status, using stored state:', statusError)
                
                // Show connection error if it's a communication issue
                if (statusError.message && (
                    statusError.message.includes('Could not establish connection') ||
                    statusError.message.includes('Receiving end does not exist')
                )) {
                    this.showError('Extension not loaded properly. Please reload the extension.')
                }
                
                // Fallback to stored state
                if (data.isRecording) {
                    this.isRecording = true
                    this.updateUIState('recording')
                } else {
                    this.isRecording = false
                    this.updateUIState('ready')
                }
            }

            if (data.transcript && data.transcript.length > 0) {
                this.transcript = data.transcript
                this.displayTranscript()
            }

            // Load and display usage data
            if (data.usageData) {
                this.updateUsageDisplay(data.usageData)
            }
        } catch (error) {
            console.error('Error loading stored data:', error)
        }
    }

    async startRecording() {
        try {
            // Check if we're on a supported meeting platform
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            })

            console.log('Current tab:', tab.url)

            if (!this.isSupportedMeetingPlatform(tab.url)) {
                this.showError(
                    'Please navigate to Google Meet, Zoom, or Teams to start recording',
                )
                return
            }

            // Check if API key is configured
            const storage = await chrome.storage.local.get(['fireworksApiKey'])
            if (!storage.fireworksApiKey || storage.fireworksApiKey === 'YOUR_API_KEY_HERE') {
                this.showError('Please configure your Fireworks API key in Settings first.')
                return
            }

            // Check usage limits
            const usageCheck = await this.checkUsageLimits()
            if (!usageCheck.canProceed) {
                this.showError(usageCheck.message)
                return
            }

            // Show consent message
            if (!(await this.getAudioConsent())) {
                return
            }

            this.updateUIState('processing')

            // Test background script connection first
            try {
                console.log('Testing background script connection...')
                const testResponse = await chrome.runtime.sendMessage({
                    action: 'getRecordingStatus'
                })
                console.log('Background script responding:', testResponse)
            } catch (connectionError) {
                console.error('Background script connection failed:', connectionError)
                this.updateUIState('ready')
                this.showError('Extension error: Please reload the extension and try again.')
                return
            }

            // Send message to background script to start recording
            console.log('Sending start recording message...')
            const response = await chrome.runtime.sendMessage({
                action: 'startRecording',
                tabId: tab.id,
            })

            console.log('Start recording response:', response)

            if (response && response.success) {
                this.isRecording = true
                this.updateUIState('recording')
                await chrome.storage.local.set({ isRecording: true })
            } else {
                this.updateUIState('ready')
                this.showError(
                    (response && response.error) ||
                        'Failed to start recording. Please ensure you have clicked in the meeting tab first.',
                )
            }
        } catch (error) {
            console.error('Error starting recording:', error)
            this.updateUIState('ready')
            
            // Provide specific error messages
            if (error.message.includes('Could not establish connection')) {
                this.showError('Extension connection error. Please reload the extension (chrome://extensions/) and try again.')
            } else if (error.message.includes('Receiving end does not exist')) {
                this.showError('Background script not responding. Please reload the extension and try again.')
            } else {
                this.showError('Failed to start recording: ' + error.message)
            }
        }
    }

    async stopRecording() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'stopRecording',
            })

            if (response.success) {
                this.isRecording = false
                this.updateUIState('ready')
                await chrome.storage.local.set({ isRecording: false })
                this.showSuccess('Recording stopped successfully')
            } else {
                this.showError(response.error || 'Failed to stop recording')
                // Force state reset if stop fails
                this.isRecording = false
                this.updateUIState('ready')
                await chrome.storage.local.set({ isRecording: false })
            }
        } catch (error) {
            console.error('Error stopping recording:', error)
            this.showError('Failed to stop recording')
            // Force state reset on error
            this.isRecording = false
            this.updateUIState('ready')
            await chrome.storage.local.set({ isRecording: false })
        }
    }

    updateUIState(state) {
        switch (state) {
            case 'ready':
                this.statusText.textContent = 'Ready'
                this.statusDot.className = 'status-dot'
                this.startBtn.disabled = false
                this.stopBtn.disabled = true
                break
            case 'recording':
                this.statusText.textContent = 'Recording...'
                this.statusDot.className = 'status-dot recording'
                this.startBtn.disabled = true
                this.stopBtn.disabled = false
                break
            case 'processing':
                this.statusText.textContent = 'Processing...'
                this.statusDot.className = 'status-dot processing'
                this.startBtn.disabled = true
                this.stopBtn.disabled = true
                break
        }
    }

    handleMessage(message) {
        switch (message.action) {
            case 'transcriptionUpdate':
                this.addTranscriptLine(message.data)
                // Briefly flash the status to show transcription activity
                this.statusText.textContent = 'Transcribing...'
                this.statusDot.className = 'status-dot processing'
                setTimeout(() => {
                    this.statusText.textContent = 'Recording...'
                    this.statusDot.className = 'status-dot recording'
                }, 1000)
                break
            case 'recordingStatus':
                this.updateUIState(message.status)
                break
            case 'error':
                this.showError(message.error)
                break
            case 'usageUpdate':
                this.updateUsageDisplay(message.data)
                break
        }
    }

    addTranscriptLine(data) {
        const transcriptLine = {
            speaker: data.speaker || 'Speaker',
            text: data.text,
            timestamp: new Date().toLocaleTimeString(),
        }

        this.transcript.push(transcriptLine)
        this.displayTranscript()
        this.saveTranscript()
    }

    displayTranscript() {
        if (this.transcript.length === 0) {
            this.transcriptContainer.innerHTML =
                '<p class="transcript-placeholder">Click "Start Recording" to begin transcription...</p>'
            return
        }

        const transcriptHTML = this.transcript
            .map(
                (line) => `
            <div class="transcript-line">
                <span class="speaker-label">${line.speaker}:</span>
                <span class="timestamp">[${line.timestamp}]</span>
                <br>
                ${line.text}
            </div>
        `,
            )
            .join('')

        this.transcriptContainer.innerHTML = transcriptHTML
        this.transcriptContainer.scrollTop =
            this.transcriptContainer.scrollHeight
    }

    async saveTranscript() {
        try {
            await chrome.storage.local.set({ transcript: this.transcript })
        } catch (error) {
            console.error('Error saving transcript:', error)
        }
    }

    async clearTranscript() {
        this.transcript = []
        this.displayTranscript()
        try {
            await chrome.storage.local.remove('transcript')
        } catch (error) {
            console.error('Error clearing transcript:', error)
        }
    }

    exportTranscript() {
        if (this.transcript.length === 0) {
            this.showError('No transcript to export')
            return
        }

        const exportText = this.transcript
            .map((line) => `[${line.timestamp}] ${line.speaker}: ${line.text}`)
            .join('\n\n')

        const blob = new Blob([exportText], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `meeting-transcript-${
            new Date().toISOString().split('T')[0]
        }.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    async getAudioConsent() {
        const consent = await chrome.storage.local.get(['audioConsent'])
        if (consent.audioConsent) {
            return true
        }

        return new Promise((resolve) => {
            const modal = document.createElement('div')
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            `

            const dialog = document.createElement('div')
            dialog.style.cssText = `
                background: white;
                padding: 20px;
                border-radius: 8px;
                max-width: 300px;
                text-align: center;
            `

            dialog.innerHTML = `
                <h3>Audio Recording Consent</h3>
                <p>This extension will capture audio from your browser tab for transcription.</p>
                <div style="margin-top: 15px;">
                    <button id="consentAllow" style="margin-right: 10px; padding: 8px 16px; background: #059669; color: white; border: none; border-radius: 4px; cursor: pointer;">Allow</button>
                    <button id="consentDeny" style="padding: 8px 16px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;">Deny</button>
                </div>
            `

            modal.appendChild(dialog)
            document.body.appendChild(modal)

            document.getElementById('consentAllow').onclick = async () => {
                await chrome.storage.local.set({ audioConsent: true })
                document.body.removeChild(modal)
                resolve(true)
            }

            document.getElementById('consentDeny').onclick = () => {
                document.body.removeChild(modal)
                resolve(false)
            }
        })
    }

    async checkUsageLimits() {
        const storage = await chrome.storage.local.get([
            'usageData',
            'userPlan',
        ])
        const now = new Date()
        const today = now.toDateString()

        let usageData = storage.usageData || {
            date: today,
            requestsToday: 0,
            totalRequests: 0,
        }

        if (usageData.date !== today) {
            usageData = {
                date: today,
                requestsToday: 0,
                totalRequests: usageData.totalRequests || 0,
            }
        }

        const userPlan = storage.userPlan || 'free'
        const limits = {
            free: { daily: 50, total: 1000 },
            premium: { daily: 1000, total: Infinity },
        }

        const limit = limits[userPlan]

        if (usageData.requestsToday >= limit.daily) {
            return {
                canProceed: false,
                message: `Daily limit reached (${limit.daily} requests). Upgrade to Premium for unlimited usage.`,
            }
        }

        if (usageData.totalRequests >= limit.total) {
            return {
                canProceed: false,
                message: `Free tier limit reached (${limit.total} total requests). Upgrade to Premium for unlimited usage.`,
            }
        }

        return { canProceed: true }
    }

    updateUsageDisplay(usageData) {
        const statusElement = document.getElementById('usageStatus')
        if (statusElement) {
            const userPlan = 'free' // TODO: Get from storage
            const limits =
                userPlan === 'free'
                    ? { daily: 50, total: 1000 }
                    : { daily: 1000, total: Infinity }

            statusElement.textContent = `Usage: ${usageData.requestsToday}/${limits.daily} today, ${usageData.totalRequests}/${limits.total} total`
        }
    }

    openSettings() {
        const modal = document.createElement('div')
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `

        const dialog = document.createElement('div')
        dialog.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 8px;
            max-width: 400px;
            width: 90%;
        `

        dialog.innerHTML = `
            <h3>Settings</h3>
            <div style="margin: 15px 0;">
                <h4>API Configuration</h4>
                <label style="display: block; font-size: 12px; color: #666; margin-bottom: 5px;">
                    Fireworks API Key (required for transcription):
                </label>
                <input type="password" id="apiKeyInput" placeholder="Enter your Fireworks API key" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px;">
                <button id="saveApiKey" style="width: 100%; padding: 6px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Save API Key</button>
                <p style="font-size: 10px; color: #666; margin-top: 5px;">
                    Get your API key from <a href="https://fireworks.ai" target="_blank" style="color: #3b82f6;">fireworks.ai</a>
                </p>
            </div>
            <div style="margin: 15px 0;">
                <h4>Current Plan: Free</h4>
                <p style="font-size: 12px; color: #666;">
                    • 50 transcription requests per day<br>
                    • 1,000 total requests<br>
                    • Basic speaker identification
                </p>
                <div id="usageDisplay" style="margin: 10px 0; padding: 10px; background: #f3f4f6; border-radius: 4px;">
                    Loading usage data...
                </div>
            </div>
            <div style="margin-top: 20px;">
                <button id="settingsClose" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
            </div>
        `

        modal.appendChild(dialog)
        document.body.appendChild(modal)

        // Load and display current API key status and usage
        chrome.storage.local.get(['usageData', 'userPlan', 'fireworksApiKey']).then((data) => {
            // Show masked API key if exists
            if (data.fireworksApiKey && data.fireworksApiKey !== 'YOUR_API_KEY_HERE') {
                const apiKeyInput = document.getElementById('apiKeyInput')
                apiKeyInput.placeholder = 'API key configured ✓'
                apiKeyInput.style.borderColor = '#059669'
            }

            const usageData = data.usageData || {
                requestsToday: 0,
                totalRequests: 0,
            }
            const userPlan = data.userPlan || 'free'
            const limits =
                userPlan === 'free'
                    ? { daily: 50, total: 1000 }
                    : { daily: 1000, total: Infinity }

            document.getElementById('usageDisplay').innerHTML = `
                <strong>Today:</strong> ${usageData.requestsToday}/${
                limits.daily
            } requests<br>
                <strong>Total:</strong> ${usageData.totalRequests}/${
                limits.total === Infinity ? '∞' : limits.total
            } requests
            `
        })

        // Save API key handler
        document.getElementById('saveApiKey').onclick = async () => {
            const apiKey = document.getElementById('apiKeyInput').value.trim()
            if (!apiKey) {
                this.showError('Please enter a valid API key')
                return
            }
            
            try {
                await chrome.storage.local.set({ fireworksApiKey: apiKey })
                this.showSuccess('API key saved successfully!')
                document.getElementById('apiKeyInput').placeholder = 'API key configured ✓'
                document.getElementById('apiKeyInput').value = ''
                document.getElementById('apiKeyInput').style.borderColor = '#059669'
            } catch (error) {
                this.showError('Failed to save API key: ' + error.message)
            }
        }

        document.getElementById('settingsClose').onclick = () => {
            document.body.removeChild(modal)
        }
    }

    isSupportedMeetingPlatform(url) {
        const supportedDomains = [
            'meet.google.com',
            'zoom.us',
            'teams.microsoft.com',
        ]

        return supportedDomains.some((domain) => url.includes(domain))
    }

    showError(message) {
        this.showNotification(message, 'error')
    }

    showSuccess(message) {
        this.showNotification(message, 'success')
    }

    showNotification(message, type) {
        const colors = {
            error: { bg: '#fee2e2', text: '#dc2626' },
            success: { bg: '#d1fae5', text: '#059669' },
        }

        const notificationDiv = document.createElement('div')
        notificationDiv.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            right: 10px;
            background: ${colors[type].bg};
            color: ${colors[type].text};
            padding: 8px;
            border-radius: 6px;
            font-size: 12px;
            z-index: 1000;
        `
        notificationDiv.textContent = message
        document.body.appendChild(notificationDiv)

        setTimeout(() => {
            if (document.body.contains(notificationDiv)) {
                document.body.removeChild(notificationDiv)
            }
        }, 5000)
    }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MeetingMindPopup()
})
