const fs = require('fs');
const path = require('path');

class RAGEngine {
  constructor(knowledgeDir, configPath) {
    this.knowledgeDir = knowledgeDir;
    this.configPath = configPath;
    this.documents = [];
    this.chunks = [];
    this.config = this.loadConfig();
    this.isIndexing = false;
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch (e) {
      console.error('Error loading config:', e);
    }
    return {
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      model: 'gemini-1.5-flash',
      agentName: 'Call Center AI Assistant',
      hotkey: 'CommandOrControl+Shift+Space',
      autoSuggestQuestions: true
    };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('Error saving config:', e);
      return false;
    }
  }

  async initialize() {
    if (!fs.existsSync(this.knowledgeDir)) {
      fs.mkdirSync(this.knowledgeDir, { recursive: true });
    }
    await this.indexDocuments();
  }

  async indexDocuments() {
    this.isIndexing = true;
    this.documents = [];
    this.chunks = [];

    const files = fs.readdirSync(this.knowledgeDir);
    for (const file of files) {
      const filePath = path.join(this.knowledgeDir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) continue;

      const ext = path.extname(file).toLowerCase();
      let text = '';

      try {
        if (ext === '.pdf') {
          try {
            const pdfParse = require('pdf-parse');
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            text = data.text;
          } catch (pdfErr) {
            console.warn(`PDF parse skipped for ${file}:`, pdfErr.message);
          }
        } else if (['.txt', '.md', '.csv', '.json'].includes(ext)) {
          text = fs.readFileSync(filePath, 'utf8');
        }

        if (text && text.trim().length > 0) {
          const docId = path.basename(file, ext);
          this.documents.push({
            id: docId,
            filename: file,
            size: stat.size,
            updatedAt: stat.mtime
          });

          // Chunk the document
          this.chunkText(text, file);
        }
      } catch (err) {
        console.error(`Error reading ${file}:`, err);
      }
    }

    this.isIndexing = false;
    console.log(`[RAGEngine] Indexed ${this.documents.length} docs, ${this.chunks.length} total chunks.`);
  }

  chunkText(text, filename, chunkSize = 500, overlap = 100) {
    // Split by paragraphs / markdown headers first
    const sections = text.split(/\n(?=#{1,3}\s|\n\n)/g);

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx].trim();
      if (!section) continue;

      // Extract possible title from first line
      const firstLine = section.split('\n')[0].replace(/^[#\s\-*]+/, '').trim();
      const topic = firstLine.length < 80 ? firstLine : '';

      if (section.length <= chunkSize) {
        this.chunks.push({
          source: filename,
          topic: topic || filename,
          content: section,
          tokens: this.tokenize(section)
        });
      } else {
        // Sliding window chunking
        let start = 0;
        while (start < section.length) {
          const end = Math.min(start + chunkSize, section.length);
          const chunkStr = section.substring(start, end);
          this.chunks.push({
            source: filename,
            topic: topic || filename,
            content: chunkStr,
            tokens: this.tokenize(chunkStr)
          });
          start += chunkSize - overlap;
        }
      }
    }
  }

  tokenize(str) {
    return str
      .toLowerCase()
      .replace(/[^\w\s\u0900-\u097F]/g, ' ') // support English and Hindi/Devanagari
      .split(/\s+/)
      .filter(w => w.length > 1);
  }

  search(query, topK = 4) {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0 || this.chunks.length === 0) {
      return [];
    }

    // Score chunks using TF-IDF / BM25-style frequency scoring
    const scored = this.chunks.map(chunk => {
      let score = 0;
      const contentLower = chunk.content.toLowerCase();
      const queryLower = query.toLowerCase();

      // Exact phrase bonus
      if (contentLower.includes(queryLower)) {
        score += 25;
      }

      // Token matching
      const tokenSet = new Set(chunk.tokens);
      for (const qToken of queryTokens) {
        if (tokenSet.has(qToken)) {
          score += 5;
        }
        // Partial match
        for (const cToken of chunk.tokens) {
          if (cToken.length > 3 && (cToken.includes(qToken) || qToken.includes(cToken))) {
            score += 2;
          }
        }
      }

      // Topic header bonus
      if (chunk.topic && queryTokens.some(t => chunk.topic.toLowerCase().includes(t))) {
        score += 8;
      }

      return {
        ...chunk,
        score
      };
    });

    return scored
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async answerQuery(query) {
    const startTime = Date.now();
    const retrievedChunks = this.search(query, 4);

    let answer = '';
    let usedAI = false;
    let confidence = 'Low';

    const contextText = retrievedChunks
      .map((c, i) => `[Document ${i + 1}: ${c.source} | Section: ${c.topic}]\n${c.content}`)
      .join('\n\n---\n\n');

    if (this.config.geminiApiKey) {
      try {
        answer = await this.callGeminiAPI(query, contextText);
        usedAI = true;
        confidence = retrievedChunks.length > 0 ? 'High' : 'General';
      } catch (err) {
        console.error('Gemini API Error, falling back to local extractor:', err.message);
        answer = this.synthesizeLocalAnswer(query, retrievedChunks);
      }
    } else {
      answer = this.synthesizeLocalAnswer(query, retrievedChunks);
    }

    const latencyMs = Date.now() - startTime;

    return {
      query,
      answer,
      usedAI,
      confidence,
      latencyMs,
      sources: retrievedChunks.map(c => ({
        source: c.source,
        topic: c.topic,
        snippet: c.content.substring(0, 150) + (c.content.length > 150 ? '...' : '')
      }))
    };
  }

  async callGeminiAPI(query, context) {
    const systemPrompt = `You are a high-speed, accurate Real-Time AI Copilot for Call Center Agents / Customer Support Representatives.
Your job is to read the customer support Knowledge Base provided in CONTEXT and answer the agent's question instantly.

CRITICAL GUIDELINES FOR CALL CENTER REPS:
1. Be direct, clear, and actionable. The agent is on a live call with a customer!
2. Provide a quick summary (1-2 sentences), followed by bullet points of exact steps, product policies, prices, or technical troubleshooting instructions.
3. If applicable, provide a "What to say to customer" script snippet in quotes.
4. Answer in the same language as the agent's query (English, Hindi, or Hinglish).
5. If the knowledge base does not contain the information, state clearly: "Not found in knowledge base. Recommend escalating to Tier 2."

CONTEXT FROM KNOWLEDGE BASE:
${context || 'No specific document found.'}

AGENT QUERY:
${query}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model || 'gemini-1.5-flash'}:generateContent?key=${this.config.geminiApiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: systemPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 600
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API returned ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) {
      throw new Error('No response content returned by Gemini API');
    }
    return candidate;
  }

  synthesizeLocalAnswer(query, chunks) {
    if (chunks.length === 0) {
      return `❌ **Koi match nahi mila (No direct match found in Knowledge Base)**\n\nIs query ke baare mein knowledge base documents me jaankari nahi mili. Kripya naye documents upload karein ya support lead se verify karein.`;
    }

    const topChunk = chunks[0];
    let formatted = `📋 **Knowledge Base Match (${topChunk.source})**\n\n`;
    formatted += `${topChunk.content.trim()}\n\n`;

    if (chunks.length > 1) {
      formatted += `\n🔍 **Related Points (${chunks[1].source})**:\n`;
      const secondSnippet = chunks[1].content.split('\n').filter(l => l.trim().length > 0).slice(0, 3).join('\n');
      formatted += `${secondSnippet}\n`;
    }

    formatted += `\n> 💡 *Note: Real-time generative AI bullet answers ke liye Settings me Gemini API key add karein.*`;
    return formatted;
  }

  async addDocument(filename, content) {
    const filePath = path.join(this.knowledgeDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    await this.indexDocuments();
    return true;
  }

  async deleteDocument(filename) {
    const filePath = path.join(this.knowledgeDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      await this.indexDocuments();
      return true;
    }
    return false;
  }

  getKnowledgeList() {
    return {
      documents: this.documents,
      totalChunks: this.chunks.length,
      isIndexing: this.isIndexing
    };
  }
}

module.exports = RAGEngine;
