// Popup script for MeetingMind extension
class MeetingMindPopup {
    constructor() {
        this.isRecording = false;
        this.transcript = [];
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadStoredData();
    }
    
    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.transcriptContainer = document.getElementById('transcriptContainer');
        this.clearBtn = document.getElementById('clearBtn');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.exportBtn = document.getElementById('exportBtn');
    }
    
    attachEventListeners() {
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.clearBtn.addEventListener('click', () => this.clearTranscript());
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.exportBtn.addEventListener('click', () => this.exportTranscript());
        
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message);
        });
    }
    
    async loadStoredData() {
        try {
            const data = await chrome.storage.local.get(['isRecording', 'transcript']);
            
            if (data.isRecording) {
                this.updateUIState('recording');
            }
            
            if (data.transcript && data.transcript.length > 0) {
                this.transcript = data.transcript;
                this.displayTranscript();
            }
        } catch (error) {
            console.error('Error loading stored data:', error);
        }
    }
    
    async startRecording() {
        try {
            // Check if we're on a supported meeting platform
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!this.isSupportedMeetingPlatform(tab.url)) {
                this.showError('Please navigate to Google Meet, Zoom, or Teams to start recording');
                return;
            }
            
            // Send message to background script to start recording
            const response = await chrome.runtime.sendMessage({
                action: 'startRecording',
                tabId: tab.id
            });
            
            if (response.success) {
                this.isRecording = true;
                this.updateUIState('recording');
                await chrome.storage.local.set({ isRecording: true });
            } else {
                this.showError(response.error || 'Failed to start recording');
            }
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showError('Failed to start recording');
        }
    }
    
    async stopRecording() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'stopRecording'
            });
            
            if (response.success) {
                this.isRecording = false;
                this.updateUIState('ready');
                await chrome.storage.local.set({ isRecording: false });
            } else {
                this.showError(response.error || 'Failed to stop recording');
            }
        } catch (error) {
            console.error('Error stopping recording:', error);
            this.showError('Failed to stop recording');
        }
    }
    
    updateUIState(state) {
        switch (state) {
            case 'ready':
                this.statusText.textContent = 'Ready';
                this.statusDot.className = 'status-dot';
                this.startBtn.disabled = false;
                this.stopBtn.disabled = true;
                break;
            case 'recording':
                this.statusText.textContent = 'Recording...';
                this.statusDot.className = 'status-dot recording';
                this.startBtn.disabled = true;
                this.stopBtn.disabled = false;
                break;
            case 'processing':
                this.statusText.textContent = 'Processing...';
                this.statusDot.className = 'status-dot processing';
                this.startBtn.disabled = true;
                this.stopBtn.disabled = true;
                break;
        }
    }
    
    handleMessage(message) {
        switch (message.action) {
            case 'transcriptionUpdate':
                this.addTranscriptLine(message.data);
                break;
            case 'recordingStatus':
                this.updateUIState(message.status);
                break;
            case 'error':
                this.showError(message.error);
                break;
        }
    }
    
    addTranscriptLine(data) {
        const transcriptLine = {
            speaker: data.speaker || 'Speaker',
            text: data.text,
            timestamp: new Date().toLocaleTimeString()
        };
        
        this.transcript.push(transcriptLine);
        this.displayTranscript();
        this.saveTranscript();
    }
    
    displayTranscript() {
        if (this.transcript.length === 0) {
            this.transcriptContainer.innerHTML = '<p class="transcript-placeholder">Click "Start Recording" to begin transcription...</p>';
            return;
        }
        
        const transcriptHTML = this.transcript.map(line => `
            <div class="transcript-line">
                <span class="speaker-label">${line.speaker}:</span>
                <span class="timestamp">[${line.timestamp}]</span>
                <br>
                ${line.text}
            </div>
        `).join('');
        
        this.transcriptContainer.innerHTML = transcriptHTML;
        this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
    }
    
    async saveTranscript() {
        try {
            await chrome.storage.local.set({ transcript: this.transcript });
        } catch (error) {
            console.error('Error saving transcript:', error);
        }
    }
    
    async clearTranscript() {
        this.transcript = [];
        this.displayTranscript();
        try {
            await chrome.storage.local.remove('transcript');
        } catch (error) {
            console.error('Error clearing transcript:', error);
        }
    }
    
    exportTranscript() {
        if (this.transcript.length === 0) {
            this.showError('No transcript to export');
            return;
        }
        
        const exportText = this.transcript.map(line => 
            `[${line.timestamp}] ${line.speaker}: ${line.text}`
        ).join('\n\n');
        
        const blob = new Blob([exportText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meeting-transcript-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    openSettings() {
        // Placeholder for settings functionality
        alert('Settings panel coming soon!');
    }
    
    isSupportedMeetingPlatform(url) {
        const supportedDomains = [
            'meet.google.com',
            'zoom.us',
            'teams.microsoft.com'
        ];
        
        return supportedDomains.some(domain => url.includes(domain));
    }
    
    showError(message) {
        // Simple error display - could be enhanced with better UI
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            right: 10px;
            background: #fee2e2;
            color: #dc2626;
            padding: 8px;
            border-radius: 6px;
            font-size: 12px;
            z-index: 1000;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (document.body.contains(errorDiv)) {
                document.body.removeChild(errorDiv);
            }
        }, 5000);
    }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MeetingMindPopup();
});