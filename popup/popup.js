// Popup script for MeetingMind extension
class MeetingMindPopup {
    constructor() {
        this.isRecording = false
        this.transcript = []
        this.currentMeetingId = null
        this.meetingSummary = null
        this.currentPage = 'dashboard'
        this.sessionStartTime = null
        this.sessionTimer = null
        this.wordCount = 0
        this.speakerCount = 0
        this.speakers = new Set()
        this.currentTheme = 'dark'

        this.initializeElements()
        this.attachEventListeners()
        this.loadStoredData()
        this.initializeNavigation()
        this.loadTheme()
    }

    initializeElements() {
        // Control elements
        this.startBtn = document.getElementById('startBtn')
        this.stopBtn = document.getElementById('stopBtn')
        this.statusDot = document.getElementById('statusDot')
        this.statusText = document.getElementById('statusText')
        this.clearBtn = document.getElementById('clearBtn')
        this.exportBtn = document.getElementById('exportBtn')
        this.summarizeBtn = document.getElementById('summarizeBtn')

        // Dashboard elements
        this.previewContainer = document.getElementById('previewContainer')
        this.sessionTime = document.getElementById('sessionTime')
        this.wordCount = document.getElementById('wordCount')
        this.speakerCountEl = document.getElementById('speakerCount')
        this.durationEl = document.getElementById('duration')

        // Transcript elements
        this.transcriptFull = document.getElementById('transcriptFull')
        this.searchInput = document.getElementById('searchInput')

        // Analytics elements
        this.sessionHistory = document.getElementById('sessionHistory')

        // Settings elements
        this.apiKeyInput = document.getElementById('apiKeyInput')
        this.saveApiKey = document.getElementById('saveApiKey')
        this.themeSelect = document.getElementById('themeSelect')
        this.autoExport = document.getElementById('autoExport')

        // Modal elements
        this.summaryModal = document.getElementById('summaryModal')
        this.summaryContent = document.getElementById('summaryContent')
        this.summaryLoading = document.getElementById('summaryLoading')
        this.copySummaryBtn = document.getElementById('copySummaryBtn')
        this.closeSummaryBtn = document.getElementById('closeSummaryBtn')
        this.exportSummaryBtn = document.getElementById('exportSummaryBtn')

        // Navigation elements
        this.navTabs = document.querySelectorAll('.nav-tab')
        this.pages = document.querySelectorAll('.page')
    }

    attachEventListeners() {
        // Control listeners
        this.startBtn.addEventListener('click', () => this.startRecording())
        this.stopBtn.addEventListener('click', () => this.stopRecording())
        this.clearBtn.addEventListener('click', () => this.clearTranscript())
        this.exportBtn.addEventListener('click', () => this.exportTranscript())
        this.summarizeBtn.addEventListener('click', () =>
            this.summarizeTranscript(),
        )

        // Settings listeners
        this.saveApiKey.addEventListener('click', () =>
            this.saveApiKeyHandler(),
        )
        this.themeSelect.addEventListener('change', () => this.changeTheme())
        this.autoExport.addEventListener('change', () => this.saveSettings())

        // Modal listeners
        this.copySummaryBtn.addEventListener('click', () => this.copySummary())
        this.closeSummaryBtn.addEventListener('click', () =>
            this.closeSummaryModal(),
        )
        this.exportSummaryBtn.addEventListener('click', () =>
            this.exportSummary(),
        )

        // Search listener
        this.searchInput.addEventListener('input', (e) =>
            this.searchTranscript(e.target.value),
        )

        // Navigation listeners
        this.navTabs.forEach((tab) => {
            tab.addEventListener('click', (e) =>
                this.switchPage(e.target.dataset.page),
            )
        })

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e))

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
            ])

            // Check actual recording status from background script
            try {
                const backgroundStatus = await chrome.runtime.sendMessage({
                    action: 'getRecordingStatus',
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
                console.warn(
                    'Could not get background status, using stored state:',
                    statusError,
                )

                // Show connection error if it's a communication issue
                if (
                    statusError.message &&
                    (statusError.message.includes(
                        'Could not establish connection',
                    ) ||
                        statusError.message.includes(
                            'Receiving end does not exist',
                        ))
                ) {
                    this.showError(
                        'Extension not loaded properly. Please reload the extension.',
                    )
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
            if (
                !storage.fireworksApiKey ||
                storage.fireworksApiKey === 'YOUR_API_KEY_HERE'
            ) {
                this.showError(
                    'Please configure your Fireworks API key in Settings first.',
                )
                this.switchPage('settings')
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
                    action: 'getRecordingStatus',
                })
                console.log('Background script responding:', testResponse)
            } catch (connectionError) {
                console.error(
                    'Background script connection failed:',
                    connectionError,
                )
                this.updateUIState('ready')
                this.showError(
                    'Extension error: Please reload the extension and try again.',
                )
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
                this.currentMeetingId = this.generateMeetingId()
                this.updateUIState('recording')
                this.startSessionTimer()
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
                this.showError(
                    'Extension connection error. Please reload the extension (chrome://extensions/) and try again.',
                )
            } else if (error.message.includes('Receiving end does not exist')) {
                this.showError(
                    'Background script not responding. Please reload the extension and try again.',
                )
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
                this.stopSessionTimer()
                await chrome.storage.local.set({ isRecording: false })
                this.showSuccess('Recording stopped successfully')

                // Enable summarize button if we have transcript
                if (this.transcript.length > 0) {
                    this.summarizeBtn.disabled = false
                }

                // Auto-export if enabled
                const settings = await chrome.storage.local.get(['autoExport'])
                if (settings.autoExport) {
                    this.exportTranscript()
                }
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
            this.stopSessionTimer()
            await chrome.storage.local.set({ isRecording: false })
        }
    }

    updateUIState(state) {
        // Remove previous state classes
        this.statusDot.className = 'status-dot'
        this.startBtn.classList.remove('btn-glow')
        this.stopBtn.classList.remove('btn-glow')

        switch (state) {
            case 'ready':
                this.statusText.textContent = 'READY'
                this.startBtn.disabled = false
                this.stopBtn.disabled = true
                this.startBtn.classList.add('btn-glow')
                break
            case 'recording':
                this.statusText.textContent = 'RECORDING'
                this.statusDot.className =
                    'status-dot recording recording-pulse'
                this.startBtn.disabled = true
                this.stopBtn.disabled = false
                this.stopBtn.classList.add('btn-glow')
                break
            case 'processing':
                this.statusText.textContent = 'PROCESSING'
                this.statusDot.className =
                    'status-dot processing processing-spin'
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
                this.statusText.textContent = 'TRANSCRIBING'
                this.statusDot.className = 'status-dot processing'
                setTimeout(() => {
                    this.statusText.textContent = 'RECORDING'
                    this.statusDot.className = 'status-dot recording'
                }, 1000)
                break
            case 'recordingStatus':
                this.updateUIState(message.status)
                break
            case 'error':
                this.showError(message.error)
                break
            case 'summaryGenerated':
                this.displaySummary(message.data)
                break
            case 'summaryError':
                this.showSummaryError(message.error)
                break
        }
    }

    addTranscriptLine(data) {
        const transcriptLine = {
            text: data.text,
            speaker: data.speaker || 'Speaker',
            timestamp: new Date().toISOString(),
        }

        this.transcript.push(transcriptLine)
        this.displayTranscript()
        this.saveTranscript()
    }

    displayTranscript() {
        // Update preview on dashboard
        this.updatePreview()

        // Update full transcript view
        this.updateFullTranscript()

        // Update stats
        this.updateStats()
    }

    updatePreview() {
        const container = this.previewContainer
        if (this.transcript.length === 0) {
            container.innerHTML = `
                <div class="terminal-prompt">
                    <span class="prompt-symbol">$</span>
                    <span class="cursor-blink">_</span>
                    <span class="preview-placeholder">Waiting for audio input...</span>
                </div>
            `
            return
        }

        // Show last few lines in terminal style
        const lastLines = this.transcript.slice(-3)
        const terminalOutput = lastLines
            .map((line, index) => {
                const lineNum = String(
                    this.transcript.length - lastLines.length + index + 1,
                ).padStart(3, '0')
                return `<div class="output-line">
                <span class="line-number">${lineNum}</span>
                <span class="speaker-msg">${this.escapeHtml(line.text)}</span>
            </div>`
            })
            .join('')

        container.innerHTML = `
            <div class="terminal-output">
                ${terminalOutput}
                <div class="output-line">
                    <span class="line-number">${String(
                        this.transcript.length + 1,
                    ).padStart(3, '0')}</span>
                    <span class="prompt-symbol">$</span>
                    <span class="cursor-blink">_</span>
                </div>
            </div>
        `
    }

    updateFullTranscript() {
        const container = this.transcriptFull.querySelector('.terminal-output')
        if (!container) return

        if (this.transcript.length === 0) {
            container.innerHTML = `
                <div class="output-line">
                    <span class="line-number">001</span>
                    <span class="system-msg"># No transcript data available</span>
                </div>
                <div class="output-line">
                    <span class="line-number">002</span>
                    <span class="system-msg"># Start recording to see live transcription</span>
                </div>
            `
            return
        }

        const transcriptLines = this.transcript
            .map((line, index) => {
                const lineNum = String(index + 1).padStart(3, '0')
                const timestamp = new Date(
                    line.timestamp || Date.now(),
                ).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                })
                const speakerIndex =
                    Array.from(this.speakers).indexOf(
                        line.speaker || 'Unknown',
                    ) % 6
                const speakerClass = `speaker-${speakerIndex}`
                const isNewLine = index === this.transcript.length - 1

                return `<div class="output-line ${
                    isNewLine ? 'new-transcript-line' : ''
                }" style="--line-index: ${index}">
                <span class="line-number">${lineNum}</span>
                <div class="speaker-avatar ${speakerClass}"></div>
                <span class="speaker-label ${speakerClass}">${
                    line.speaker || 'Speaker'
                }:</span>
                <span class="speaker-msg ${
                    isNewLine ? 'typing-effect' : ''
                }">${this.escapeHtml(line.text)}</span>
                <span class="timestamp">[${timestamp}]</span>
            </div>`
            })
            .join('')

        container.innerHTML = transcriptLines
        container.scrollTop = container.scrollHeight

        // Add typing effect to the last line
        if (this.transcript.length > 0) {
            setTimeout(() => {
                const lastLine = container.querySelector('.new-transcript-line')
                if (lastLine) {
                    lastLine.classList.remove('new-transcript-line')
                }
            }, 2000)
        }
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
        this.meetingSummary = null
        this.displayTranscript()
        this.hideSummary()
        this.summarizeBtn.disabled = true
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

        let exportText = '# Meeting Transcript\n\n'
        exportText += `Generated on: ${new Date().toLocaleString()}\n\n`

        // Add transcript
        exportText += '## Transcript\n\n'
        exportText += this.transcript
            .map((line) => line.text)
            .join(' ')
            .replace(/\.\s+/g, '.\n')

        // Add summary if available
        if (this.meetingSummary) {
            exportText += '\n\n## Summary\n\n'
            exportText += this.meetingSummary
        }

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

    generateMeetingId() {
        return `meeting_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`
    }

    async summarizeTranscript() {
        console.log('start summarize')
        if (this.transcript.length === 0) {
            this.showError('No transcript to summarize')
            return
        }

        try {
            // Show modal and loading state
            this.showSummaryModal()
            this.showSummaryLoading()
            this.summarizeBtn.disabled = true
            this.summarizeBtn.textContent = 'ANALYZING...'

            // Get full transcript text
            const fullTranscript = this.transcript
                .map((line) => line.text)
                .join(' ')

            // Send to background script for summarization
            const response = await chrome.runtime.sendMessage({
                action: 'summarizeTranscript',
                transcript: fullTranscript,
            })

            if (!response.success) {
                throw new Error(response.error || 'Failed to generate summary')
            }
        } catch (error) {
            console.error('Error summarizing transcript:', error)
            this.showSummaryError(error.message)
        }
    }

    showSummaryLoading() {
        this.summarySection.style.display = 'block'
        this.summaryLoading.style.display = 'block'
        this.summaryContent.style.display = 'none'
    }

    displaySummary(summaryText) {
        this.meetingSummary = summaryText
        this.summaryContent.innerHTML = this.formatSummaryText(summaryText)
        this.summaryLoading.style.display = 'none'
        this.summaryContent.style.display = 'block'
        this.summarizeBtn.disabled = false
        this.summarizeBtn.textContent = 'ANALYZE'

        // Save summary to storage
        this.saveMeetingData()
    }

    showSummaryError(errorMessage) {
        this.summaryContent.innerHTML = `<div class="error-message">ERROR: Failed to generate summary - ${errorMessage}</div>`
        this.summaryLoading.style.display = 'none'
        this.summaryContent.style.display = 'block'
        this.summarizeBtn.disabled = false
        this.summarizeBtn.textContent = 'ANALYZE'
    }

    hideSummary() {
        this.summarySection.style.display = 'none'
    }

    formatSummaryText(text) {
        // Convert markdown-like formatting to HTML
        return text
            .replace(/## (.*?)$/gm, '<h4>$1</h4>')
            .replace(/### (.*?)$/gm, '<h5>$1</h5>')
            .replace(/^\* (.*?)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/^([^<])/gm, '<p>$1')
            .replace(/([^>])$/gm, '$1</p>')
            .replace(/<p><\/p>/g, '')
    }

    async copySummary() {
        if (!this.meetingSummary) {
            this.showError('No summary to copy')
            return
        }

        try {
            await navigator.clipboard.writeText(this.meetingSummary)
            this.showSuccess('Summary copied to clipboard!')
        } catch (error) {
            console.error('Error copying summary:', error)
            this.showError('Failed to copy summary to clipboard')
        }
    }

    async saveMeetingData() {
        if (!this.currentMeetingId) {
            return
        }

        try {
            const meetingData = {
                id: this.currentMeetingId,
                timestamp: new Date().toISOString(),
                transcript: this.transcript,
                summary: this.meetingSummary,
                duration: null, // Could be calculated if needed
            }

            // Save to meetings storage
            const storage = await chrome.storage.local.get(['meetings'])
            const meetings = storage.meetings || []

            // Update existing meeting or add new one
            const existingIndex = meetings.findIndex(
                (m) => m.id === this.currentMeetingId,
            )
            if (existingIndex >= 0) {
                meetings[existingIndex] = meetingData
            } else {
                meetings.push(meetingData)
            }

            await chrome.storage.local.set({ meetings })
        } catch (error) {
            console.error('Error saving meeting data:', error)
        }
    }

    // Navigation methods
    initializeNavigation() {
        this.switchPage('dashboard')
    }

    switchPage(pageName) {
        // Update active states
        this.navTabs.forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.page === pageName)
        })

        this.pages.forEach((page) => {
            page.classList.toggle('active', page.dataset.page === pageName)
        })

        this.currentPage = pageName

        // Load page-specific data
        if (pageName === 'analytics') {
            this.loadAnalytics()
        } else if (pageName === 'settings') {
            this.loadSettings()
        }
    }

    // Theme management
    async loadTheme() {
        const data = await chrome.storage.local.get(['theme'])
        this.currentTheme = data.theme || 'dark'
        document.body.setAttribute('data-theme', this.currentTheme)
        if (this.themeSelect) {
            this.themeSelect.value = this.currentTheme
        }
    }

    async changeTheme() {
        this.currentTheme = this.themeSelect.value
        document.body.setAttribute('data-theme', this.currentTheme)
        await chrome.storage.local.set({ theme: this.currentTheme })
    }

    async summarizeTranscript() {
        console.log('start summarize')
        if (this.transcript.length === 0) {
            this.showError('No transcript to summarize')
            return
        }

        try {
            // Show modal and loading state
            this.showSummaryModal()
            this.showSummaryLoading()
            this.summarizeBtn.disabled = true
            this.summarizeBtn.textContent = 'ANALYZING...'

            // Get full transcript text
            const fullTranscript = this.transcript
                .map((line) => line.text)
                .join(' ')

            // Send to background script for summarization
            const response = await chrome.runtime.sendMessage({
                action: 'summarizeTranscript',
                transcript: fullTranscript,
            })

            if (!response.success) {
                throw new Error(response.error || 'Failed to generate summary')
            }
        } catch (error) {
            console.error('Error summarizing transcript:', error)
            this.showSummaryError(error.message)
        }
    }
    // Search functionality
    searchTranscript(query) {
        const lines = this.transcriptFull.querySelectorAll('.output-line')
        lines.forEach((line) => {
            const text = line.textContent.toLowerCase()
            const match = query.toLowerCase()
            if (query === '' || text.includes(match)) {
                line.style.display = 'flex'
                line.style.opacity = '1'
            } else {
                line.style.display = 'none'
            }
        })
    }
    // Analytics methods
    async loadAnalytics() {
        const data = await chrome.storage.local.get(['meetings'])
        const meetings = data.meetings || []
        if (meetings.length === 0) {
            this.sessionHistory.innerHTML =
                '<div class="no-data">No sessions recorded yet</div>'
            return
        }
        const sessionHtml = meetings
            .slice(-5)
            .reverse()
            .map((meeting, index) => {
                const date = new Date(meeting.timestamp).toLocaleDateString()
                const time = new Date(meeting.timestamp).toLocaleTimeString(
                    [],
                    { hour: '2-digit', minute: '2-digit' },
                )
                const duration = meeting.duration || 'Unknown'
                const wordCount = meeting.transcript
                    ? meeting.transcript.length
                    : 0

                return `
                <div class=\"session-item\" style=\"margin-bottom: 12px; padding: 10px; background: var(--bg-tertiary); border-radius: 4px; border-left: 3px solid var(--text-accent);\">
                <div style=\"display: flex; justify-content: space-between; margin-bottom: 4px;\">
                <span style=\"color: var(--text-accent); font-weight: 600;\">${date}</span>
                <span style=\"color: var(--text-secondary);\">${time}</span>
                </div>
                <div style=\"display: flex; gap: 16px; font-size: 10px; color: var(--text-secondary);\">
                <span>WORDS: ${wordCount}</span>
                <span>DURATION: ${duration}</span>
                </div>
                </div>
                `
            })
            .join('')

        this.sessionHistory.innerHTML = sessionHtml
    }

    // Settings methods
    async loadSettings() {
        const data = await chrome.storage.local.get([
            'fireworksApiKey',
            'theme',
            'autoExport',
        ])

        if (
            data.fireworksApiKey &&
            data.fireworksApiKey !== 'YOUR_API_KEY_HERE'
        ) {
            this.apiKeyInput.placeholder = 'API key configured ✓'
            this.apiKeyInput.style.borderColor = 'var(--text-success)'
        }
        this.themeSelect.value = data.theme || 'dark'
        this.autoExport.checked = data.autoExport || false
    }

    async saveApiKeyHandler() {
        const apiKey = this.apiKeyInput.value.trim()
        if (!apiKey) {
            this.showError('Please enter a valid API key')
            return
        }

        try {
            await chrome.storage.local.set({ fireworksApiKey: apiKey })
            this.showSuccess('API key saved successfully!')
            this.apiKeyInput.placeholder = 'API key configured ✓'
            this.apiKeyInput.value = ''
            this.apiKeyInput.style.borderColor = 'var(--text-success)'
        } catch (error) {
            this.showError('Failed to save API key: ' + error.message)
        }
    }

    async saveSettings() {
        const settings = {
            autoExport: this.autoExport.checked,
        }

        await chrome.storage.local.set(settings)
    }

    // Modal methods
    showSummaryModal() {
        this.summaryModal.style.display = 'flex'
    }

    closeSummaryModal() {
        this.summaryModal.style.display = 'none'
        this.summarizeBtn.disabled = false
        this.summarizeBtn.textContent = 'ANALYZE'
    }

    async exportSummary() {
        if (!this.meetingSummary) {
            this.showError('No summary to export')
            return
        }

        const exportData = {
            meeting_id: this.currentMeetingId,
            timestamp: new Date().toISOString(),
            summary: this.meetingSummary,
            transcript: this.transcript,
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json',
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `meeting-analysis-${
            new Date().toISOString().split('T')[0]
        }.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        this.showSuccess('Analysis exported successfully!')
    }

    showError(message) {
        this.showNotification(message, 'error')
    }

    showSuccess(message) {
        this.showNotification(message, 'success')
    }

    showNotification(message, type) {
        const notificationDiv = document.createElement('div')
        notificationDiv.className = `notification ${type}`
        notificationDiv.textContent = message
        document.body.appendChild(notificationDiv)

        setTimeout(() => {
            if (document.body.contains(notificationDiv)) {
                document.body.removeChild(notificationDiv)
            }
        }, 4000)
    }

    // New utility methods
    escapeHtml(text) {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    }

    getSpeakerColor(speaker) {
        const colors = [
            '#58a6ff',
            '#3fb950',
            '#d29922',
            '#f85149',
            '#bc8cff',
            '#ff7b72',
        ]
        const speakerIndex = Array.from(this.speakers).indexOf(speaker)
        return colors[speakerIndex % colors.length] || '#58a6ff'
    }

    updateStats() {
        // Update word count
        this.wordCount = this.transcript.reduce((count, line) => {
            return count + (line.text || '').split(' ').length
        }, 0)

        // Update speaker count
        this.speakers.clear()
        this.transcript.forEach((line) => {
            if (line.speaker) this.speakers.add(line.speaker)
        })

        // Update UI
        if (this.wordCountEl) this.wordCountEl.textContent = this.wordCount
        if (this.speakerCountEl)
            this.speakerCountEl.textContent = this.speakers.size
    }

    startSessionTimer() {
        this.sessionStartTime = Date.now()
        this.sessionTimer = setInterval(() => {
            const elapsed = Date.now() - this.sessionStartTime
            const duration = this.formatDuration(elapsed)
            if (this.sessionTime) this.sessionTime.textContent = duration
            if (this.durationEl)
                this.durationEl.textContent = this.formatDuration(elapsed, true)
        }, 1000)
    }

    stopSessionTimer() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer)
            this.sessionTimer = null
        }
    }

    formatDuration(ms, short = false) {
        const seconds = Math.floor(ms / 1000)
        const minutes = Math.floor(seconds / 60)
        const hours = Math.floor(minutes / 60)

        if (short) {
            if (hours > 0)
                return `${hours}:${String(minutes % 60).padStart(2, '0')}`
            return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
        }

        return `${String(hours).padStart(2, '0')}:${String(
            minutes % 60,
        ).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    }

    // Keyboard shortcuts
    handleKeyboard(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case '1':
                    e.preventDefault()
                    this.switchPage('dashboard')
                    break
                case '2':
                    e.preventDefault()
                    this.switchPage('transcript')
                    break
                case '3':
                    e.preventDefault()
                    this.switchPage('analytics')
                    break
                case '4':
                    e.preventDefault()
                    this.switchPage('settings')
                    break
                case 'r':
                    e.preventDefault()
                    this.toggleRecording()
                    break
                case 'f':
                    e.preventDefault()
                    this.focusSearch()
                    break
            }
        }

        if (e.key === 'Escape' && this.summaryModal.style.display !== 'none') {
            this.closeSummaryModal()
        }
    }

    toggleRecording() {
        if (this.isRecording) {
            this.stopRecording()
        } else {
            this.startRecording()
        }
    }

    focusSearch() {
        if (this.currentPage === 'transcript' && this.searchInput) {
            this.searchInput.focus()
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

    // Search functionality
    searchTranscript(query) {
        const lines = this.transcriptFull.querySelectorAll('.output-line')
        lines.forEach((line) => {
            const text = line.textContent.toLowerCase()
            const match = query.toLowerCase()

            if (query === '' || text.includes(match)) {
                line.style.display = 'flex'
                line.style.opacity = '1'
            } else {
                line.style.display = 'none'
            }
        })
    }

    // Analytics methods
    async loadAnalytics() {
        const data = await chrome.storage.local.get(['meetings'])
        const meetings = data.meetings || []

        if (meetings.length === 0) {
            this.sessionHistory.innerHTML =
                '<div class="no-data">No sessions recorded yet</div>'
            return
        }

        const sessionHtml = meetings
            .slice(-5)
            .reverse()
            .map((meeting, index) => {
                const date = new Date(meeting.timestamp).toLocaleDateString()
                const time = new Date(meeting.timestamp).toLocaleTimeString(
                    [],
                    { hour: '2-digit', minute: '2-digit' },
                )
                const duration = meeting.duration || 'Unknown'
                const wordCount = meeting.transcript
                    ? meeting.transcript.length
                    : 0

                return `
                <div class="session-item" style="margin-bottom: 12px; padding: 10px; background: var(--bg-tertiary); border-radius: 4px; border-left: 3px solid var(--text-accent);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="color: var(--text-accent); font-weight: 600;">${date}</span>
                        <span style="color: var(--text-secondary);">${time}</span>
                    </div>
                    <div style="display: flex; gap: 16px; font-size: 10px; color: var(--text-secondary);">
                        <span>WORDS: ${wordCount}</span>
                        <span>DURATION: ${duration}</span>
                    </div>
                </div>
            `
            })
            .join('')

        this.sessionHistory.innerHTML = sessionHtml
    }

    // Settings methods
    async loadSettings() {
        const data = await chrome.storage.local.get([
            'fireworksApiKey',
            'theme',
            'autoExport',
        ])

        if (
            data.fireworksApiKey &&
            data.fireworksApiKey !== 'YOUR_API_KEY_HERE'
        ) {
            this.apiKeyInput.placeholder = 'API key configured ✓'
            this.apiKeyInput.style.borderColor = 'var(--text-success)'
        }

        this.themeSelect.value = data.theme || 'dark'
        this.autoExport.checked = data.autoExport || false
    }

    async saveApiKeyHandler() {
        const apiKey = this.apiKeyInput.value.trim()
        if (!apiKey) {
            this.showError('Please enter a valid API key')
            return
        }

        try {
            await chrome.storage.local.set({ fireworksApiKey: apiKey })
            this.showSuccess('API key saved successfully!')
            this.apiKeyInput.placeholder = 'API key configured ✓'
            this.apiKeyInput.value = ''
            this.apiKeyInput.style.borderColor = 'var(--text-success)'
        } catch (error) {
            this.showError('Failed to save API key: ' + error.message)
        }
    }

    async saveSettings() {
        const settings = {
            autoExport: this.autoExport.checked,
        }

        await chrome.storage.local.set(settings)
    }

    // Modal methods
    showSummaryModal() {
        this.summaryModal.style.display = 'flex'
    }

    closeSummaryModal() {
        this.summaryModal.style.display = 'none'
        this.summarizeBtn.disabled = false
        this.summarizeBtn.textContent = 'ANALYZE'
    }

    async exportSummary() {
        if (!this.meetingSummary) {
            this.showError('No summary to export')
            return
        }

        const exportData = {
            meeting_id: this.currentMeetingId,
            timestamp: new Date().toISOString(),
            summary: this.meetingSummary,
            transcript: this.transcript,
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json',
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `meeting-analysis-${
            new Date().toISOString().split('T')[0]
        }.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        this.showSuccess('Analysis exported successfully!')
    }

    showError(message) {
        this.showNotification(message, 'error')
    }

    showSuccess(message) {
        this.showNotification(message, 'success')
    }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MeetingMindPopup()
})
