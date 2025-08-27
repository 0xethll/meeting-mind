# MeetingMind - AI-Powered Meeting Transcription

Chrome extension for real-time meeting transcription with speaker identification.

## Development Setup

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" 
4. Select the project folder (`/Users/hanlynn/Projects/sentient/unname`)
5. The extension should now appear in your extensions list

### Testing the Extension

1. Navigate to a supported meeting platform:
   - Google Meet: https://meet.google.com/
   - Zoom: https://zoom.us/
   - Microsoft Teams: https://teams.microsoft.com/

2. Click the MeetingMind extension icon in the Chrome toolbar
3. Click "Start Recording" to begin transcription
4. The extension will request permission to capture tab audio

### Current Status

**Phase 1.1 - COMPLETED:**
- ✅ Chrome extension structure initialized
- ✅ manifest.json created with required permissions
- ✅ Basic popup UI with start/stop controls
- ✅ Ready for testing in Chrome developer mode

**Next Steps (Phase 1.2):**
- Audio capture implementation
- OpenAI Whisper API integration
- Real-time transcription display

### File Structure

```
/
├── manifest.json              # Extension configuration
├── popup/
│   ├── popup.html            # Extension popup interface
│   ├── popup.css             # Styling for popup
│   └── popup.js              # Popup functionality
├── background/
│   └── service-worker.js     # Background processing
├── content/
│   └── content-script.js     # Meeting platform integration
├── assets/                   # Icons and static files
└── docs/                     # Documentation
```

### Development Notes

- Extension uses Manifest V3 (latest Chrome extension format)
- Requires `tabCapture` permission for audio recording
- Supports Google Meet, Zoom, and Teams web versions
- Local storage for transcript persistence