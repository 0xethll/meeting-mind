# MeetingMind - AI-Powered Meeting Transcription

Chrome extension for real-time meeting transcription with speaker identification.

## Development Setup

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the project folder
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

### Development Notes

- Extension uses Manifest V3 (latest Chrome extension format)
- Requires `tabCapture` permission for audio recording
- Supports Google Meet, Zoom, and Teams web versions
- Local storage for transcript persistence
