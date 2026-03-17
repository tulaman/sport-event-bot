# OpenMemory Guide — sport-event-bot

## Overview

A Telegram bot (Node.js + Telegraf) for organizing sports events in community groups. Users interact entirely through the bot in Russian. Runs in development on SQLite and in production on MySQL with an Express webhook server.

- **Repo:** `tulaman/sport-event-bot`
- **Author:** Ilya Lityuga
- **License:** GPL-3.0-only
- **Language:** JavaScript (Node.js)

## Architecture

```
app.js              — bot entry point (commands, callbacks, Express server)
db.js               — Sequelize ORM: Event, User, Session models
utils.js            — date/time formatting
activity_monitor.js — cron script: scans group history via GramJS, marks inactive users
telegram_login.js   — one-time script to generate TG_STRING_SESSION
config/
  index.js          — config loader (merges JSON + messages.yml)
  default.json      — shared: event_types, button_labels, activity_monitoring
  development.json  — SQLite, 7-day activity window
  production.json   — MySQL (SSL), webhook domain, channel ID
  messages.yml      — Russian message templates (Mustache)
migrations/         — Sequelize CLI migrations
docs/               — setup guides (activity monitoring)
```

## Components

### Bot Commands
- `/start`, `/help` — register user + welcome
- `/create` — event creation wizard (calendar → time → type → location → distance → pace → info)
- `/find` — browse events (today/tomorrow/week/all/calendar picker)
- `/my_events` — manage created/joined events
- `/announcement` — admin: publish daily digest to channel
- `/inactive` — admin: list inactive users
- `/exempt`, `/unexempt`, `/exempt_list` — admin: manage activity check exemptions

### Database Models (Sequelize)
- **Event**: date, time, type, location, distance, pace, additional_info, author_id
- **User**: nickname, username, telegram_id, last_message_date, last_reaction_date, last_bot_activity_date, is_active, is_exempt_from_activity_check
- **Session**: user_id, json (bot state stored in DB)
- **Participant** (join table): User ↔ Event many-to-many

### Activity Monitoring System
- `activity_monitor.js` — standalone cron script using GramJS (telegram package)
- Reads group message history, updates last_message_date per user
- Evaluates 3 activity signals: group messages, reactions, bot activity (create/join event)
- `updateUserLastBotActivity()` exported and called from app.js in real-time
- Required env: TG_API_ID, TG_API_HASH, TG_STRING_SESSION, TG_TARGET_CHAT
- Activity window priority: ACTIVITY_WINDOW_DAYS env → config window_days → 30 days default

### Production Setup
- Webhook via Express on configurable PORT (default 8080)
- `GET /publish-today-events` — cron endpoint for daily channel digest
- MySQL with SSL (ca-certificate.crt)

## Patterns

- Config loaded via `config/index.js` merging JSON files + YAML messages
- All UI messages in Russian, defined in `config/messages.yml` with Mustache templates
- Session state stored in DB (not in-memory)
- Event flow uses a dispatch table keyed by `ctx.session.state`
- Static events (Workout, Water activity, Board games, Sauna, Party) skip distance/pace steps

## User Defined Namespaces

- [Leave blank — user populates]
