# AI Booking Assistant

WhatsApp-powered AI booking system using **Node.js**, **Express**, **OpenAI** (function calling), **MySQL**, and **Meta Cloud API**.

Customers message your WhatsApp number to book salon services. An OpenAI-powered agent extracts intent, checks availability, and confirms bookings — all conversationally.

---

## Architecture

```
Customer (WhatsApp)
    │
    ▼
Meta Cloud API  ──webhook──▶  Express Server
                                   │
                          ┌────────┴────────┐
                          ▼                  ▼
                   OpenAI Agent        MySQL Database
                   (tool calling)      (slots, bookings)
                          │                  ▲
                          └──── tools ───────┘
```

---

## Quick Start

### 1. Prerequisites

- **Node.js** ≥ 18
- **MySQL** 8.x running locally (or remote)
- **Meta Developer Account** with a WhatsApp Business app
- **OpenAI API key**

### 2. Clone & Install

```bash
git clone <repo-url>
cd ai-booking-assistant
npm install
```

### 3. Configure

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PORT` | Server port (default `3000`) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection |
| `WHATSAPP_PHONE_NUMBER_ID` | Your WhatsApp phone number ID from Meta |
| `WHATSAPP_ACCESS_TOKEN` | Permanent or temporary access token |
| `WHATSAPP_VERIFY_TOKEN` | A secret string you choose for webhook verification |
| `WHATSAPP_API_VERSION` | Graph API version (default `v21.0`) |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `OPENAI_MODEL` | Model name (default `gpt-3.5-turbo`) |

### 4. Database Setup

```bash
# Create tables
npm run migrate

# Seed sample services & availability slots
npm run seed
```

### 5. Run

```bash
# Development (auto-restart with nodemon)
npm run dev

# Production
npm start
```

### 6. Expose Webhook (Development)

Use [ngrok](https://ngrok.com) to expose your local server:

```bash
ngrok http 3000
```

Then configure the webhook URL in your Meta app:
- **Callback URL**: `https://<ngrok-id>.ngrok.io/webhook`
- **Verify Token**: the value of `WHATSAPP_VERIFY_TOKEN` in your `.env`

---

## Project Structure

```
ai-booking-assistant/
├── sql/
│   ├── schema.sql          # Database schema
│   ├── migrate.js          # Migration runner
│   └── seed.js             # Sample data seeder
├── src/
│   ├── config/
│   │   └── config.js       # Environment configuration
│   ├── controllers/
│   │   └── messageController.js  # Incoming message orchestrator
│   ├── llm/
│   │   └── bookingAgent.js # OpenAI agent with tool calling
│   ├── middleware/
│   │   └── errorHandler.js # Central error middleware
│   ├── models/
│   │   └── db.js           # MySQL connection pool
│   ├── routes/
│   │   └── webhook.js      # WhatsApp webhook routes
│   ├── scheduler/
│   │   └── reminderJob.js  # Cron-based reminder job
│   ├── tools/
│   │   ├── availabilityTool.js  # Slot availability checker
│   │   └── confirmTool.js       # Booking confirmation
│   ├── whatsapp/
│   │   └── whatsappClient.js    # Meta Graph API client
│   └── server.js           # Express entry point
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## How It Works

1. **Customer sends a WhatsApp message** (e.g., "I want a haircut tomorrow evening").
2. **Meta forwards the message** to your `/webhook` endpoint.
3. **The message controller** loads/creates the conversation and calls the **OpenAI booking agent**.
4. **The agent** uses function calling to invoke tools:
   - `check_availability` — queries open slots in MySQL.
   - `confirm_booking` — reserves a slot and creates a booking record.
5. **The agent's reply** is sent back to the customer via the WhatsApp Cloud API.
6. **A cron job** sends reminders 24h and 1h before confirmed bookings.

---

## License

MIT
