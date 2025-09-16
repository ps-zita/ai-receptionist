# AI Voice Receptionist

This project is a standalone AI-powered voice receptionist that can answer calls, understand spoken language, and respond intelligently based on a predefined set of services. It uses Google Cloud for Speech-to-Text and Text-to-Speech and Anthropic's Claude model for conversational AI.

## Features

- **Real-time Conversation:** Engages in natural, real-time conversation over the phone (via a WebSocket connection).
- **Service Recommendation:** Understands customer needs and recommends the appropriate service from a knowledge base (`services.json`).
- **Interruption Handling:** Allows users to interrupt the AI's response for a more natural conversational flow.

## Setup and Installation

Follow these steps to get the project running.

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- A Google Cloud Platform (GCP) project with billing enabled.
- An Anthropic API key.

### 2. Clone and Install Dependencies

```bash
# Clone this repository
git clone https://github.com/ps-zita/ai-receptionist
cd voice-receptionist

# Install the required npm packages
npm install
```

### 3. Configure Environment Variables

Create a file named `.env` in the `voice-receptionist` directory and add the following content.

```env
# .env

# --- Anthropic API Key ---
# Get yours from https://console.anthropic.com/
ANTHROPIC_API_KEY="sk-ant-xxxxxxxx"

# --- Google Cloud Credentials ---
# This is the ID of your Google Cloud project
GCP_PROJECT_ID="your-gcp-project-id"
```

### 4. Set Up Google Cloud Authentication

This application uses Google's Application Default Credentials (ADC). You only need to do this once per machine.

1.  Install the `gcloud` CLI. Follow the official instructions: [Google Cloud SDK Installation](https://cloud.google.com/sdk/docs/install).
2.  Run the following command and follow the web-based authentication flow:
    ```bash
    gcloud auth application-default login
    ```

### 5. Running the Server

Once the setup is complete, you can start the server.

```bash
npm start
```

The server will start, and the voice agent will be running on port 3003.

## How It Works

- **`server.js`**: The main server file that handles WebSocket connections, orchestrates the different AI services, and manages the conversation flow.
- **`index.html`**: A simple web client for testing the voice agent. You can open this file in your browser to start a conversation.
- **`services.json`**: A JSON file containing the knowledge base for the AI. You can edit this file to change the services, descriptions, and pricing.

To connect the `index.html` client to your server, you will need to update the `WEBSOCKET_URL` variable in the HTML file to point to your server's address (e.g., `ws://localhost:3003` for local testing or `wss://your-production-url.com` for a deployed version).
