
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env.local manually
const envPath = path.resolve(__dirname, 'frontend', '.env.local');
let apiKey = '';

try {
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        // Simple regex to find the key
        const lines = envContent.split('\n');
        for (const line of lines) {
            if (line.startsWith('VITE_GEMINI_API_KEY=')) {
                apiKey = line.split('=')[1].trim();
                break;
            }
        }
    } else {
        console.error(`Error: File not found at ${envPath}`);
    }
} catch (error) {
    console.error("Error reading .env.local:", error.message);
}

if (!apiKey) {
    console.error("Error: VITE_GEMINI_API_KEY not found in frontend/.env.local");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        console.log(`Checking available models for API key: ${apiKey.substring(0, 5)}...`);

        // Test a few likely models
        const modelsToTest = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro', 'gemini-1.0-pro'];

        for (const modelName of modelsToTest) {
            console.log(`\nTesting model: ${modelName}`);
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("Hello, just checking connection.");
                const response = await result.response;
                console.log(`✅ Success! Model '${modelName}' is available.`);
            } catch (error) {
                console.error(`❌ Failed to use '${modelName}'.\n   Error: ${error.message}`);
            }
        }

    } catch (error) {
        console.error("Fatal Error:", error);
    }
}

listModels();
