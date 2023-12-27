# XMPP Chatbots for AI Models

## Overview
This automates the setup of XMPP chatbots for a range of AI models. It includes scripts to register multiple XMPP clients, each corresponding to a different PPLX model, and sets them up to interact with users via XMPP protocol.

Currently sets up for all the Pplx models and Replit's AI Modelfarm

## Setup
Set your environment variables per the example.env
```
PPLX_API_KEY="your-key"
BOT_PASSWORD="strong-password"
DOMAIN="xmpp.domain.com"
```

## Usage
### Run the Registration Script
This script registers all the models as users on your XMPP server.

```bash
bun run registerModels.js
```

### Start the XMPP Chatbots
This will start the XMPP clients for each registered model.

```bash
just dev index.ts
```