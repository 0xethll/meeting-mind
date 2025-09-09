# MeetingMind Desktop - AI-Powered Meeting Intelligence

## Project Overview
Tauri-based desktop application for system-wide meeting audio capture and real-time transcription with speaker identification. Captures audio from any application (Zoom, Teams, Discord, in-person meetings) without browser limitations.

## MVP Goals
- System-wide audio capture (all applications)
- Real-time speech-to-text transcription using Whisper API
- Speaker diarization and identification
- React-based UI for viewing transcripts
- Local storage for meeting data
- Cross-platform support (macOS, Windows, Linux)

## Technical Stack
- **Platform**: Tauri v2 (Rust + React + TypeScript)
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Rust with Tauri APIs
- **Audio**: `cpal` crate for system audio capture
- **Transcription**: OpenAI Whisper API or Fireworks AI
- **Storage**: Tauri's filesystem API with SQLite
- **Architecture**: Native desktop app with cloud API calls

## Key Technical Challenges
1. System-wide audio capture across platforms (macOS permissions, Windows audio routing, Linux ALSA/PulseAudio)
2. Real-time audio processing and streaming to transcription services
3. Speaker diarization accuracy and real-time labeling
4. Cross-platform distribution and code signing
5. Managing API costs and implementing local fallbacks
6. Privacy compliance for system-level audio access

## Target Platforms
- **Primary**: macOS (development machine)
- **Secondary**: Windows 10/11
- **Future**: Linux (Ubuntu, Fedora)

## Audio Capture Strategy
- **macOS**: Core Audio APIs via `cpal` crate
- **Windows**: WASAPI (Windows Audio Session API)
- **Linux**: ALSA/PulseAudio integration
- **Permissions**: Request microphone access on app launch
- **Processing**: Real-time audio chunks → Whisper API

## Development Commands
```bash
# Development
bun run tauri dev

# Build
bun run tauri build

# Test audio capture
bun run tauri dev -- --features audio-debug

# Production build with signing
bun run tauri build -- --target universal-apple-darwin
```

## File Structure
```
desktop/
├── src-tauri/           # Rust backend
│   ├── src/
│   │   ├── main.rs      # Tauri app initialization
│   │   ├── audio.rs     # Audio capture module
│   │   ├── transcription.rs  # Whisper API integration
│   │   └── storage.rs   # Local data management
│   ├── Cargo.toml       # Rust dependencies
│   └── tauri.conf.json  # Tauri configuration
├── src/                 # React frontend
│   ├── components/      # React components
│   ├── hooks/          # Custom hooks for Tauri APIs
│   └── types/          # TypeScript definitions
├── package.json        # Node.js dependencies
└── vite.config.ts      # Vite configuration
```

## Tauri Configuration Requirements
- **Permissions**: `microphone`, `fs:read-write`, `http:request`
- **APIs**: Audio capture, filesystem, HTTP client
- **Security**: CSP for external API calls
- **Build**: Code signing for macOS distribution

## Privacy & Security
- Request explicit microphone permissions
- Process audio locally when possible
- Encrypt stored transcripts with user key
- Clear data retention policies
- Option for offline-only mode
- No cloud storage of audio data

## Competitive Advantages over Chrome Extension
- Captures native app audio (Zoom desktop, Teams desktop, Discord)
- No browser tab limitations
- Better performance for long meetings
- Offline transcription capabilities (future)
- System-level integrations possible

## Monetization Strategy
- Freemium: 10 hours/month free
- Pro: $20/month unlimited + advanced features
- Enterprise: $50/user/month with team features
- One-time purchase option: $199 lifetime

## Success Metrics
- Daily active users across platforms
- Meeting hours processed
- Transcription accuracy rate
- User retention (30-day)
- App store ratings

## Risk Mitigation
- Audio permission failures → Clear user guidance
- API rate limits → Local model fallback (Whisper.cpp)
- Platform-specific bugs → Comprehensive testing
- Distribution complexity → Automated CI/CD pipeline

## Chrome Extension Migration Path
- Port React components from extension popup
- Adapt audio processing from tabCapture to system audio
- Reuse transcription and storage logic
- Maintain similar UI/UX for user familiarity

## Future Features (Post-MVP)
- Local Whisper model integration (offline mode)
- Meeting summaries and action items
- Calendar integration
- Team collaboration features
- Custom vocabulary training
- Real-time translation