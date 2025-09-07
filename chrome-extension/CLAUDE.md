# MeetingMind - AI-Powered Meeting Intelligence

## Project Overview
Chrome extension for real-time meeting transcription with speaker identification. Captures audio from web-based meeting platforms (Google Meet, Zoom, Teams) and provides live transcription with speaker diarization.

## MVP Goals
- Audio capture from browser tabs
- Real-time speech-to-text transcription  
- Basic speaker identification/diarization
- Simple UI for viewing transcripts
- Local storage for meeting data

## Technical Stack
- **Platform**: Chrome Extension (Manifest V3)
- **Audio**: WebRTC MediaRecorder API for tab audio capture
- **Transcription**: OpenAI Whisper API or Azure Speech Services
- **Frontend**: HTML/CSS/JavaScript (vanilla)
- **Storage**: Chrome extension storage API
- **Architecture**: Client-side processing with cloud API calls

## Key Technical Challenges
1. Chrome extension audio capture from tabs (requires specific permissions)
2. Real-time audio streaming to transcription services
3. Speaker diarization accuracy and labeling
4. Managing API costs and rate limits
5. Privacy and data handling compliance

## Target Platforms
- **Primary**: Google Meet (web version)
- **Secondary**: Zoom web client, Microsoft Teams web
- **Future**: Native Zoom/Teams desktop integration

## Development Commands
```bash
# No specific build commands yet - pure HTML/CSS/JS
# Chrome extension development workflow:
# 1. Load unpacked extension in Chrome developer mode
# 2. Test in meeting platforms
# 3. Package for Chrome Web Store submission
```

## File Structure
```
/
├── manifest.json          # Chrome extension manifest
├── popup/                 # Extension popup UI
├── content/              # Content scripts for meeting platforms
├── background/           # Service worker for audio processing
├── assets/               # Icons and static assets
└── docs/                # Documentation and planning
```

## Privacy & Security
- Process audio locally when possible
- Encrypt stored transcripts
- Clear data retention policies
- User consent for cloud processing
- No audio storage, only transcripts

## Monetization Strategy
- Freemium model: 5 hours/month free
- Pro plan: $15/month unlimited
- Enterprise: Custom pricing for teams
- Future: API access for developers

## Success Metrics
- Daily active users
- Meeting minutes processed
- User retention rate
- Transcription accuracy
- Chrome Web Store rating

## Competitive Analysis
- **Otter.ai**: More features, higher price, not Chrome-native
- **Fireflies.ai**: Enterprise-focused, complex setup
- **Opportunity**: Simple, fast, developer-focused solution