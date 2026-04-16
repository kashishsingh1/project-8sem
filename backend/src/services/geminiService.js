const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

/**
 * Service to handle Gemini AI requests with fallback/rotation between multiple API keys.
 */
class GeminiService {
  constructor() {
    // Collect all GEMINI_API_KEY_n from environment
    this.apiKeys = Object.keys(process.env)
      .filter((key) => key.startsWith('GEMINI_API_KEY_'))
      .map((key) => process.env[key])
      .filter((key) => !!key);

    // Add a default fallback if only one key is provided as GEMINI_API_KEY
    if (process.env.GEMINI_API_KEY) {
      this.apiKeys.unshift(process.env.GEMINI_API_KEY);
    }

    if (this.apiKeys.length === 0) {
      console.warn('No Gemini API keys found in environment variables.');
    }

    this.currentIndex = 0;
  }

  /**
   * Rotates to the next available API key.
   */
  rotateKey() {
    if (this.apiKeys.length <= 1) return;
    this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length;
    console.log(`Rotating to Gemini API key at index ${this.currentIndex}`);
  }

  /**
   * Generates structured project plan (JSON) using the current key.
   * @param {string} promptText - The prompt to send to Gemini
   * @param {number} retries - Number of key rotations to attempt
   */
  async generatePlan(promptText, retries = this.apiKeys.length) {
    if (this.apiKeys.length === 0) {
      throw new Error('Gemini API keys are missing.');
    }

    try {
      const genAI = new GoogleGenerativeAI(this.apiKeys[this.currentIndex]);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-flash-latest',
        generationConfig: { responseMimeType: 'application/json' }
      });

      const result = await model.generateContent(promptText);
      const response = await result.response;
      return JSON.parse(response.text());
    } catch (error) {
      console.error(`Gemini Error (Key Index ${this.currentIndex}):`, error.message);

      // If rate limited or service unavailable, rotate and retry
      if (retries > 0 && (error.message.includes('429') || error.message.includes('503'))) {
        this.rotateKey();
        return this.generatePlan(promptText, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Generates free-form text (for reports, chat assistant).
   * @param {string} promptText - The prompt to send to Gemini
   * @param {number} retries - Number of key rotations to attempt
   */
  async generateText(promptText, retries = this.apiKeys.length) {
    if (this.apiKeys.length === 0) {
      throw new Error('Gemini API keys are missing.');
    }

    try {
      const genAI = new GoogleGenerativeAI(this.apiKeys[this.currentIndex]);
      const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

      const result = await model.generateContent(promptText);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error(`Gemini Text Error (Key Index ${this.currentIndex}):`, error.message);

      if (retries > 0 && (error.message.includes('429') || error.message.includes('503'))) {
        this.rotateKey();
        return this.generateText(promptText, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Continuous chat with history.
   * @param {string} message - User message
   * @param {Array} history - Gemini-formatted history [{ role, parts: [{ text }] }]
   * @param {number} retries - Rotation retries
   */
  async chat(message, history = [], retries = this.apiKeys.length) {
    if (this.apiKeys.length === 0) {
      throw new Error('Gemini API keys are missing.');
    }

    try {
      const genAI = new GoogleGenerativeAI(this.apiKeys[this.currentIndex]);
      const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

      const chatSession = model.startChat({
        history: history,
        generationConfig: {
          maxOutputTokens: 1000,
        },
      });

      const result = await chatSession.sendMessage(message);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error(`Gemini Chat Error (Key Index ${this.currentIndex}):`, error.message);

      if (retries > 0 && (error.message.includes('429') || error.message.includes('503'))) {
        this.rotateKey();
        return this.chat(message, history, retries - 1);
      }
      throw error;
    }
  }
}

module.exports = new GeminiService();
