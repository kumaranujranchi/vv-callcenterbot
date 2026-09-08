const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const RAGEngine = require('./rag/ragEngine');

const app = express();
const PORT = process.env.PORT || 3847;

const knowledgeDir = path.join(__dirname, 'knowledge');
const configPath = path.join(__dirname, 'config.json');

const rag = new RAGEngine(knowledgeDir, configPath);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize RAG indexing
rag.initialize().then(() => {
  console.log('[Server] Knowledge Base RAG initialized successfully.');
});

// Fast In-Memory Query Cache for 500 agents
const queryCache = new Map();
let totalQueries = 0;
let cacheHits = 0;

// Admin Dashboard Route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Official Portal & Download Hub Route
app.get(['/portal', '/download', '/downloads'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal.html'));
});

// Query Knowledge Base (with High-Speed Cache for 500 agents)
app.post('/api/query', async (req, res) => {
  const { query } = req.body;
  if (!query || query.trim().length === 0) {
    return res.status(400).json({ error: 'Query cannot be empty' });
  }

  totalQueries++;
  const cacheKey = query.trim().toLowerCase();

  // Cache Check: Sub-second instantaneous response
  if (queryCache.has(cacheKey)) {
    cacheHits++;
    const cached = queryCache.get(cacheKey);
    return res.json({
      ...cached,
      isCached: true,
      latencyMs: 1
    });
  }

  try {
    const result = await rag.answerQuery(query.trim());
    queryCache.set(cacheKey, result);
    if (queryCache.size > 5000) {
      const firstKey = queryCache.keys().next().value;
      queryCache.delete(firstKey);
    }
    res.json(result);
  } catch (err) {
    console.error('Error handling query:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin Cache & Stats endpoint
app.get('/api/stats', (req, res) => {
  res.json({
    totalQueries,
    cacheHits,
    cacheHitRatio: totalQueries > 0 ? ((cacheHits / totalQueries) * 100).toFixed(1) + '%' : '0%',
    cachedItemsCount: queryCache.size
  });
});

// Get Knowledge Base documents & stats
app.get('/api/knowledge', (req, res) => {
  res.json(rag.getKnowledgeList());
});

// Upload or add a new knowledge doc (supports both raw text and base64 binaries like PDF/DOCX)
app.post('/api/knowledge', async (req, res) => {
  const { filename, content, isBase64 } = req.body;
  if (!filename || !content) {
    return res.status(400).json({ error: 'Filename and content are required' });
  }

  try {
    const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    await rag.addDocument(cleanName, content, !!isBase64);
    // Invalidate query cache so all 500 agents get updated answers immediately
    queryCache.clear();
    res.json({ success: true, message: `File ${cleanName} added and re-indexed across all 500 agents.` });
  } catch (err) {
    console.error('Error adding knowledge:', err);
    res.status(500).json({ error: err.message });
  }
});

// Dedicated file upload endpoint
app.post('/api/knowledge/upload', async (req, res) => {
  const { filename, content, isBase64 } = req.body;
  if (!filename || !content) {
    return res.status(400).json({ error: 'Filename and file content are required' });
  }

  try {
    const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    await rag.addDocument(cleanName, content, !!isBase64);
    queryCache.clear();
    res.json({ success: true, message: `Document ${cleanName} uploaded and indexed successfully.` });
  } catch (err) {
    console.error('Error in document upload:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a knowledge document
app.delete('/api/knowledge/:filename', async (req, res) => {
  const filename = req.params.filename;
  try {
    const success = await rag.deleteDocument(filename);
    if (success) {
      res.json({ success: true, message: `Deleted ${filename}` });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get/Update configuration (Gemini API key, model, agent name)
app.get('/api/config', (req, res) => {
  const safeConfig = { ...rag.config };
  if (safeConfig.geminiApiKey) {
    // Mask key for safety
    safeConfig.hasApiKey = true;
    safeConfig.maskedKey = safeConfig.geminiApiKey.substring(0, 6) + '...' + safeConfig.geminiApiKey.slice(-4);
  } else {
    safeConfig.hasApiKey = false;
  }
  delete safeConfig.geminiApiKey;
  res.json(safeConfig);
});

app.post('/api/config', (req, res) => {
  const { geminiApiKey, model, agentName, hotkey } = req.body;
  const updates = {};
  if (geminiApiKey !== undefined && geminiApiKey !== '') updates.geminiApiKey = geminiApiKey;
  if (model) updates.model = model;
  if (agentName) updates.agentName = agentName;
  if (hotkey) updates.hotkey = hotkey;

  const saved = rag.saveConfig(updates);
  res.json({ success: saved });
});

// Fallback to index.html for client-side navigation
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Server] Call Center AI Assistant server running at http://localhost:${PORT}`);
});
