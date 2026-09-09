const fs = require('fs');
const path = require('path');

const STOP_WORDS = new Set([
  // Hindi / Hinglish stopwords
  'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'par', 'kya', 'hai', 'hain', 'ho', 'hoga', 'hogi',
  'hote', 'hoti', 'hota', 'kar', 'kare', 'karein', 'karta', 'karti', 'karte', 'tha', 'thi', 'the',
  'aur', 'ya', 'to', 'bhi', 'kuch', 'koi', 'sab', 'jo', 'ye', 'yeh', 'wo', 'woh', 'ise', 'use',
  'unhe', 'unka', 'unki', 'unke', 'mera', 'meri', 'mere', 'apna', 'apni', 'apne', 'kab', 'kahan',
  'kaun', 'kaise', 'kitna', 'kitni', 'kitne', 'kyun', 'batao', 'bataye', 'batayein', 'bataiye',
  'kripya', 'please', 'details', 'detail', 'bata', 'dijiye', 'do', 'de', 'h', 'ji', 'sir', 'madam',
  // English stopwords
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'about', 'against', 'between', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'out', 'off', 'over', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any',
  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'now', 'what', 'which', 'who', 'whom'
]);

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
            const { PDFParse } = require('pdf-parse');
            const dataBuffer = fs.readFileSync(filePath);
            const parser = new PDFParse({ data: dataBuffer });
            const data = await parser.getText();
            text = data.text || '';
            await parser.destroy();
          } catch (pdfErr) {
            console.warn(`PDF parse skipped for ${file}:`, pdfErr.message);
          }
        } else if (ext === '.docx' || ext === '.doc') {
          try {
            const mammoth = require('mammoth');
            const dataBuffer = fs.readFileSync(filePath);
            const data = await mammoth.extractRawText({ buffer: dataBuffer });
            text = data.value || '';
          } catch (docErr) {
            console.warn(`DOCX parse skipped for ${file}:`, docErr.message);
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

  chunkText(text, filename, chunkSize = 1000, overlap = 150) {
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

  getSignificantTokens(tokens) {
    return tokens.filter(t => !STOP_WORDS.has(t));
  }

  search(query, topK = 8) {
    const allQueryTokens = this.tokenize(query);
    if (allQueryTokens.length === 0 || this.chunks.length === 0) {
      return [];
    }

    const significantTokens = this.getSignificantTokens(allQueryTokens);
    const tokensToMatch = significantTokens.length > 0 ? significantTokens : allQueryTokens;
    const queryLower = query.toLowerCase().trim();

    // Score chunks using TF-IDF / BM25-style frequency scoring
    const scored = this.chunks.map(chunk => {
      let score = 0;
      let matchedCount = 0;
      const contentLower = chunk.content.toLowerCase();
      const topicLower = (chunk.topic || '').toLowerCase();

      // Exact phrase match bonus
      if (contentLower.includes(queryLower)) {
        score += 35;
        matchedCount += 2;
      }

      const tokenSet = new Set(chunk.tokens);

      for (const token of tokensToMatch) {
        if (tokenSet.has(token)) {
          score += 10;
          matchedCount++;
        } else {
          // Partial/substring match for tokens > 3 chars
          for (const cToken of chunk.tokens) {
            if (cToken.length > 3 && (cToken.includes(token) || token.includes(cToken))) {
              score += 3;
              matchedCount += 0.5;
              break;
            }
          }
        }

        // Topic header bonus
        if (topicLower && topicLower.includes(token)) {
          score += 15;
          matchedCount++;
        }
      }

      return {
        ...chunk,
        score,
        matchedCount
      };
    });

    // Strict filtering: require substantive relevance score and at least 1 keyword match
    const minScore = significantTokens.length > 0 ? 10 : 8;

    return scored
      .filter(c => c.score >= minScore && c.matchedCount >= 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async answerQuery(query) {
    const startTime = Date.now();
    const retrievedChunks = this.search(query, 8);

    // If no relevant documents found in knowledge base, immediately return "Ye details available nahi hai."
    if (retrievedChunks.length === 0) {
      return {
        query,
        answer: "Ye details available nahi hai.",
        usedAI: false,
        confidence: "None",
        latencyMs: Date.now() - startTime,
        sources: []
      };
    }

    let answer = '';
    let usedAI = false;
    let confidence = 'High';

    const contextText = retrievedChunks
      .map((c, i) => `[Document ${i + 1}: ${c.source} | Section: ${c.topic}]\n${c.content}`)
      .join('\n\n---\n\n');

    if (this.config.geminiApiKey) {
      try {
        answer = await this.callGeminiAPI(query, contextText);
        usedAI = true;
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
      answer: (answer || '').trim(),
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
    const systemPrompt = `You are an Ultra-Fast, 100% Factually Grounded Instant Fact Lookup Assistant for Vastu Vihar Call Center Agents handling live customer calls.

CRITICAL RULES:
1. HAR QUESTION KA SPECIFIC ANSWER DEIN:
   - Provide an exact, direct, and factual answer in 1 to 2 short sentences (or 2-3 brief bullet points, strictly under 35 words).
   - Give the exact number, price, percentage, location, city name, phone number, email, or rule immediately.
   - NO introductions ("Sure", "Here are the details", "Based on records"), NO filler, NO conversational chit-chat.

2. DETAILS NAHI HONE PAR STRICT RULE:
   - If the specific details, facts, numbers, dates, people, or answers to the customer's question are NOT explicitly present in the CONTEXT below, you MUST reply ONLY:
     "Ye details available nahi hai."
     (If the customer asked in English: "This detail is not available in our records.")
   - NEVER guess, NEVER assume, NEVER fabricate, and NEVER use external or world knowledge.
   - If only partial information is available, provide the specific known fact and explicitly add: "Baaki details available nahi hai."

3. LANGUAGE:
   - Answer in the same language as the question (Hindi, Hinglish, or English).

CONTEXT FROM KNOWLEDGE BASE:
${context}

CUSTOMER QUERY:
${query}`;

    // Prefer verified active generation models
    let selectedModel = this.config.model || 'gemini-3.5-flash';
    if (['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-3.6-flash'].includes(selectedModel)) {
      selectedModel = 'gemini-3.5-flash';
    }

    const candidateModels = [
      selectedModel,
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite'
    ];
    const uniqueModels = [...new Set(candidateModels)];

    let lastError = null;

    for (const model of uniqueModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.config.geminiApiKey}`;

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
              temperature: 0.1,
              maxOutputTokens: 512
            }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini API (${model}) returned ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidate && candidate.trim().length > 0) {
          return candidate;
        }
      } catch (err) {
        lastError = err;
        console.warn(`Attempt with ${model} failed, trying next candidate...`, err.message);
      }
    }

    throw lastError || new Error('No valid response from Gemini API');
  }

  synthesizeLocalAnswer(query, chunks) {
    if (!chunks || chunks.length === 0) {
      return "Ye details available nahi hai.";
    }

    const allQueryTokens = this.tokenize(query);
    const significantTokens = this.getSignificantTokens(allQueryTokens);
    const topChunk = chunks[0];

    const topContentLower = topChunk.content.toLowerCase();
    const hasSigMatch = significantTokens.some(t => topContentLower.includes(t));

    if (!hasSigMatch && significantTokens.length > 0) {
      return "Ye details available nahi hai.";
    }

    // Try to extract lines matching the question or Q&A
    const lines = topChunk.content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const matchedLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLower = line.toLowerCase();
      if (significantTokens.some(t => lineLower.includes(t))) {
        matchedLines.push(line);
        if (i + 1 < lines.length && (lines[i + 1].startsWith('A:') || lines[i + 1].startsWith('●') || lines[i + 1].startsWith('-'))) {
          matchedLines.push(lines[i + 1]);
        }
      }
    }

    if (matchedLines.length > 0) {
      return matchedLines.slice(0, 3).join('\n');
    }

    return "Ye details available nahi hai.";
  }

  async addDocument(filename, content, isBinary = false) {
    const filePath = path.join(this.knowledgeDir, filename);
    if (isBinary) {
      if (typeof content === 'string') {
        fs.writeFileSync(filePath, Buffer.from(content, 'base64'));
      } else if (Buffer.isBuffer(content)) {
        fs.writeFileSync(filePath, content);
      }
    } else {
      fs.writeFileSync(filePath, content, 'utf8');
    }
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
