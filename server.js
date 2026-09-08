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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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

  const normalizedQuery = query.trim().toLowerCase();
  totalQueries++;

  // Check cache for identical queries from agents
  if (queryCache.has(normalizedQuery)) {
    cacheHits++;
    const cachedResult = queryCache.get(normalizedQuery);
    return res.json({
      ...cachedResult,
      isCached: true,
      latencyMs: 1
    });
  }

  try {
    const result = await rag.answerQuery(query.trim());
    // Cache the result for 15 minutes
    queryCache.set(normalizedQuery, result);
    if (queryCache.size > 5000) {
      // Evict oldest
      const firstKey = queryCache.keys().next().value;
      queryCache.delete(firstKey);
    }

    res.json(result);
  } catch (err) {
    console.error('Error answering query:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin Stats
app.get('/api/admin/stats', (req, res) => {
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

// Upload or add a new knowledge doc
app.post('/api/knowledge', async (req, res) => {
  const { filename, content } = req.body;
  if (!filename || !content) {
    return res.status(400).json({ error: 'Filename and content are required' });
  }

  try {
    const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    await rag.addDocument(cleanName, content);
    res.json({ success: true, message: `File ${cleanName} added and re-indexed.` });
  } catch (err) {
    console.error('Error adding knowledge:', err);
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
