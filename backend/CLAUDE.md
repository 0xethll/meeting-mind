# MeetingMind Backend - Claude Code Agent Instructions

## Project Overview

**MeetingMind Backend** is a Cloudflare Workers-based transcription service that moves audio processing from frontend to backend, enabling:

-   Centralized API key management
-   Usage tracking and billing
-   Subscription/usage-based monetization
-   Scalable audio transcription processing

## Business Model

-   **Free Tier**: 30 minutes/month transcription
-   **Pro Tier**: $9/month

## Technical Architecture

### Core Components

1. **Cloudflare Worker** - Main API endpoint and request handler
2. **D1 Database** - User management, usage tracking, subscriptions
3. **KV Store** - Session management, rate limiting, caching
4. **External APIs** - Transcription services (OpenAI Whisper, AssemblyAI, Deepgram)

### Tech Stack

-   **Runtime**: Cloudflare Workers (JavaScript/TypeScript)
-   **Database**: Cloudflare D1 (SQLite-based)
-   **Cache/Sessions**: Cloudflare KV
-   **Authentication**: JWT tokens
-   **Payment Processing**: Stripe integration

## Database Schema (D1)

```sql
-- Users table
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    plan TEXT DEFAULT 'free', -- free, pro, enterprise
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Usage tracking
CREATE TABLE usage_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    minutes_used REAL NOT NULL,
    cost REAL NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Transcription jobs
CREATE TABLE transcription_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    audio_url TEXT,
    transcript_url TEXT,
    duration_minutes REAL,
    provider TEXT, -- openai, assemblyai, deepgram
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Subscriptions
CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    stripe_subscription_id TEXT,
    plan TEXT NOT NULL,
    status TEXT NOT NULL, -- active, canceled, past_due
    current_period_start INTEGER NOT NULL,
    current_period_end INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
);
```

## API Endpoints

### Authentication

-   `POST /auth/register` - User registration
-   `POST /auth/login` - User login
-   `POST /auth/refresh` - Refresh JWT token

### Transcription

-   `POST /transcribe` - Upload audio for transcription
-   `GET /transcribe/{jobId}` - Get transcription status/result
-   `GET /transcribe/history` - User's transcription history

### Usage & Billing

-   `GET /usage` - Current usage statistics
-   `POST /subscription` - Create/update subscription
-   `GET /subscription` - Get current subscription details

## Environment Variables

```bash
# API Keys
OPENAI_API_KEY=sk-...
ASSEMBLYAI_API_KEY=...
DEEPGRAM_API_KEY=...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# JWT
JWT_SECRET=...

# Database
DATABASE_URL=... # D1 database binding
```

## Development Commands

```bash
# Local development
npm run dev

# Deploy to Cloudflare
npm run deploy

# Run database migrations
npm run migrate

# Run tests
npm run test

# Lint and format
npm run lint
npm run format
```

## File Structure

```
backend/
├── src/
│   ├── handlers/
│   │   ├── auth.ts           # Authentication endpoints
│   │   ├── transcription.ts  # Transcription logic
│   │   ├── billing.ts        # Stripe integration
│   │   └── usage.ts          # Usage tracking
│   ├── utils/
│   │   ├── jwt.ts            # JWT utilities
│   │   ├── database.ts       # D1 database helpers
│   │   └── transcription/    # Transcription service integrations
│   │       ├── openai.ts
│   │       ├── assemblyai.ts
│   │       └── deepgram.ts
│   ├── middleware/
│   │   ├── auth.ts           # JWT verification
│   │   ├── rateLimit.ts      # Rate limiting
│   │   └── cors.ts           # CORS handling
│   ├── types/
│   │   └── index.ts          # TypeScript definitions
│   └── index.ts              # Main Worker entry point
├── migrations/
│   └── 001_initial.sql       # Database schema
├── tests/
│   ├── auth.test.ts
│   ├── transcription.test.ts
│   └── billing.test.ts
├── wrangler.toml             # Cloudflare Workers config
├── package.json
└── README.md
```

## Integration with Chrome Extension

The existing chrome extension will be updated to:

1. Remove API key input from settings
2. Add user authentication (login/register)
3. Send audio to backend `/transcribe` endpoint instead of processing locally
4. Display usage statistics and billing info
5. Handle subscription management

## Testing Strategy

1. **Unit Tests**: Individual function testing with vitest
2. **Integration Tests**: API endpoint testing with Miniflare
3. **E2E Tests**: Full workflow testing including payment processing
4. **Load Tests**: Performance testing for concurrent transcription jobs

## Security Considerations

-   JWT tokens for authentication
-   Rate limiting per user/IP
-   Input validation and sanitization
-   Secure storage of API keys in environment variables
-   CORS configuration for frontend integration
-   Audit logs for billing and usage

## Monitoring & Analytics

-   Usage metrics tracking
-   Error logging and alerting
-   Performance monitoring
-   Cost tracking per transcription provider
-   User activity analytics

## Deployment Pipeline

1. **Development**: Local testing with Miniflare
2. **Staging**: Cloudflare Workers preview deployment
3. **Production**: Main branch auto-deployment via GitHub Actions
4. **Database Migrations**: Automated via wrangler d1 migrations

## Cost Optimization

-   Intelligent transcription provider selection based on cost/quality
-   Audio compression before processing
-   Caching of frequently requested transcripts
-   Bulk pricing negotiations with transcription providers
-   Usage-based auto-scaling

## Future Enhancements

-   Real-time streaming transcription
-   Multiple language support
-   Custom vocabulary/terminology
-   Speaker diarization improvements
-   Integration with popular meeting platforms APIs
-   Mobile app support
-   Team/organization accounts
