# 🎧 Call Center Floating Desktop AI Copilot (Knowledge Base Chatbot)

Call Center ke agents ke liye ek **Floating Desktop AI Assistant** jo hamesha screen par floating rehta hai aur customer call ke dauraan product se judhi koi bhi jaankari sirf 1-2 second mein bullet points aur customer script ke sath provide karta hai.

---

## 🌟 Key Features

1. **Floating Desktop Icon (Bubble Mode)**:
   - Screen ke kisi bhi kone mein sleek, glowing draggable floating icon.
   - Click karne par ya global hotkey press karne par instant expand hota hai.
   - Always-on-Top: CRM, dialer ya browser ke upar bina disturb kiye floating rehta hai.

2. **Sub-Second Knowledge Base Search (RAG)**:
   - Local BM25 + Semantic search index.
   - Pre-loaded with:
     - ⚡ **Telecom & Fiber Broadband Guide** (Plans, pricing, router LOS red light fix, Wi-Fi password change)
     - 📦 **E-Commerce Return & Warranty Guide** (7-day policy, replacement, UPI/Card refund timelines)
   - PDF, TXT, MD, CSV, JSON formats supported.

3. **Call Center Optimized Answers**:
   - Direct, bulleted troubleshooting steps.
   - **"What to say to customer" script** in quotes.
   - **One-Click "Copy Script"**: Instant clipboard copy for live chat or reading to customer.
   - **Sources & Latency Tag**: Shows exact file and retrieval time (e.g. `2ms`).

4. **Google Gemini API Integration**:
   - Ultra-fast responses with `gemini-1.5-flash` or `gemini-2.0-flash`.
   - Built-in Local Extractor fallback if API key is not provided yet.

5. **In-App Knowledge Base Manager**:
   - Header mein book icon par click karke naye product docs, FAQs, ya price updates paste/upload karein.
   - Automatic live re-indexing bina app restart kiye.

---

## 🚀 How to Run

### 1. Run as Floating Desktop App (Native Electron)
```bash
npm run electron
```
- Floating icon screen ke bottom-right mein open ho jayega.
- **Global Hotkey**: Press <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd> (Mac) ya <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd> (Windows) to instantly toggle the window!

### 2. Run as Web App / Local Office Network
```bash
npm start
```
- Open browser at `http://localhost:3847`
- Apne local network ke baki call center agents ke sath bhi share kar sakte hain (`http://<YOUR_IP>:3847`).

---

## ⚙️ Adding Gemini API Key
1. Floating assistant open karein.
2. Top-right mein **Settings (⚙️)** button par click karein.
3. Apna Google Gemini API Key paste karein aur **Save** karein.
*(Agar API key nahi daalte hain, tab bhi local knowledge base extractor automatically kaam karega!)*

---

## 📁 Project Structure

```
├── knowledge/                        # Knowledge Base documents folder
│   ├── telecom_broadband_products.md # Sample telecom & router guides
│   └── ecommerce_return_warranty.md  # Sample returns & refund policies
├── rag/
│   └── ragEngine.js                  # Document chunking, BM25 semantic index, Gemini API
├── public/
│   ├── index.html                    # Floating bubble & chat panel UI
│   ├── style.css                     # Glassmorphic dark theme & animations
│   └── app.js                        # Drag, toggle, hotkey, and chat interactions
├── main.js                           # Electron always-on-top desktop process
├── server.js                         # Express backend API & static server
├── config.json                       # Config & API key settings
└── package.json
```
