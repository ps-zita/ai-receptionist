import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import fs from 'fs';
import { SpeechClient } from '@google-cloud/speech';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

// --- Server Setup ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = 3003;

// --- Load Services Data ---
let servicesData = {};
try {
    const rawData = fs.readFileSync('services.json');
    servicesData = JSON.parse(rawData);
} catch (error) {
    console.error('Error reading or parsing services.json:', error);
    process.exit(1); // Exit if the essential services data cannot be loaded.
}

// --- API Client Initialization ---
const speechClient = new SpeechClient({projectId: process.env.GCP_PROJECT_ID});
const textToSpeechClient = new TextToSpeechClient({projectId: process.env.GCP_PROJECT_ID});
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- WebSocket Connection Handling ---
wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');

    let conversationHistory = [];
    let recognizeStream = null;
    let isAiSpeaking = false;
    let isInterrupted = false;

    const interruptAi = () => {
        if (isAiSpeaking) {
            console.log('INTERRUPTION: User speech detected. Stopping AI response.');
            isAiSpeaking = false;
            isInterrupted = true;
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ command: 'stop_playing' }));
            }
        }
    };

    const processTranscript = async (transcript) => {
        if (!transcript.trim()) return;

        console.log(`Processing final transcript: "${transcript}"`);
        conversationHistory.push({ role: 'user', content: transcript });
        isAiSpeaking = true;

        try {
            const claudeResponse = await getClaudeResponse(conversationHistory, servicesData);

            if (!isAiSpeaking) {
                console.log('AI response cancelled after LLM generation.');
                return;
            }

            console.log(`Claude's response: ${claudeResponse}`);
            conversationHistory.push({ role: 'assistant', content: claudeResponse });

            const [ttsResponse] = await textToSpeechClient.synthesizeSpeech({
                input: { text: claudeResponse },
                voice: { languageCode: 'en-US', name: 'en-US-Standard-F' },
                audioConfig: {
                    audioEncoding: 'OGG_OPUS',
                    sampleRateHertz: 48000,
                },
            });

            if (!isAiSpeaking) {
                console.log('AI response cancelled after speech synthesis.');
                return;
            }

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(ttsResponse.audioContent);
            }
        } catch (err) {
            console.error('Error processing AI response:', err);
            isAiSpeaking = false;
        }
    };

    recognizeStream = speechClient
        .streamingRecognize({
            config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: 48000,
                languageCode: 'en-US',
            },
            interimResults: true,
        })
        .on('error', console.error)
        .on('data', (data) => {
            const transcript = data.results[0]?.alternatives[0]?.transcript;
            const isFinal = data.results[0]?.isFinal;

            if (!transcript) return;

            if (isAiSpeaking) {
                interruptAi();
            }

            if (isInterrupted) {
                if (isFinal) {
                    console.log(`Interruption utterance finished. Processing as new command: "${transcript}"`);
                    isInterrupted = false;
                    processTranscript(transcript);
                }
                return;
            }

            if (isFinal) {
                processTranscript(transcript);
            }
        });

    ws.on('message', (message) => {
        if (recognizeStream) {
            recognizeStream.write(message);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed');
        if (recognizeStream) {
            recognizeStream.destroy();
        }
    });

    isAiSpeaking = true;
    sendInitialGreeting(ws).then(() => {
        if (isAiSpeaking) {
            isAiSpeaking = false;
        }
    });
});

// --- AI and Speech Helper Functions ---

async function getClaudeResponse(history, services) {
    const servicesString = JSON.stringify(services, null, 2);
    const systemPrompt = `You are a friendly, conversational sales assistant for the Ministry of Detailing, bentleigh, victoria. speaking to a customer on the phone. Your primary goal is to listen to the customer's problem and guide them to the best service package. Be helpful and sound like a real person, not a robot.

Here is your knowledge base of all services, prices, and their detailed descriptions. You must stick to these offerings:
${servicesString}

**Your Conversational Rules:**
- **Make and Model First Rule:** If the customer asks about a service with size-based pricing (like a 'Full Detail'), your FIRST response must be to ask for the vehicle's make and model. Example: "Absolutely. What's the make and model of your vehicle?"
- **Vehicle Classification Guide:** Once the user provides a make and model, classify it into a size category to find the price. Use these examples as a guide:
    - **small:** Sedans (Toyota Camry, Honda Civic), Hatchbacks.
    - **medium:** Small SUVs & Crossovers (Toyota RAV4, Honda CR-V).
    - **large:** Trucks (Ford F-150), Vans, and Large SUVs (Chevrolet Tahoe).
- **Concise Service Recommendation:** When recommending a service or providing a price, be concise. State the service and price, then naturally offer to provide more details. For example: "For a BMW hatchback, I'd recommend our Premium Exterior service, which is $110. Would you like to know more about what that includes?" or "The Full Detail for your BMW hatchback would be $400. I can tell you more about what's included if you like."
- For flat-rate add-ons (like 'Scratch Removal'), state the price directly, e.g., "The Scratch Removal is a flat $50."
- When a customer describes a problem (like 'dog hair'), confidently recommend the *best* service and then ask for the make and model if needed. Example: "For dog hair, I'd recommend our Interior Detail. What kind of car do you have?"
- Never say you can't help. Find the closest service we offer.
- dont respond in paragraphs or bullet points, just give a concise answer.`;

    const msg = await anthropic.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 150, // Adjusted tokens to allow for descriptions when asked
        system: systemPrompt,
        messages: history,
    });
    return msg.content[0].text;
}

async function sendInitialGreeting(ws) {
    const greetingText = "Welcome to the Ministry of Detailing! How can I help you today?";
    console.log(`Sending greeting: ${greetingText}`);
    try {
        const [response] = await textToSpeechClient.synthesizeSpeech({
            input: { text: greetingText },
            voice: { languageCode: 'en-US', name: 'en-US-Standard-F' },
            audioConfig: {
                audioEncoding: 'OGG_OPUS',
                sampleRateHertz: 48000,
            },
        });
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(response.audioContent);
        }
    } catch (err) {
        console.error('Error sending initial greeting:', err);
    }
}

// --- Server Startup ---
server.listen(PORT, () => {
    console.log(`Voice agent server is listening on port ${PORT}`);
});
