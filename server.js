const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Read API Key from Environment Variable (Render Environment Setting)
const GROQ_API_KEY = process.env.GROQ_API_KEY || "YOUR_GROQ_API_KEY_HERE";
const PORT = process.env.PORT || 5005;
const LEADS_FILE = path.join('/tmp', 'chatbot_leads.json');

// Ensure leads file exists
if (!fs.existsSync(LEADS_FILE)) {
  try { fs.writeFileSync(LEADS_FILE, JSON.stringify([], null, 2)); } catch (e) {}
}

// In-Memory Session Storage for Chat History
const sessionStore = {};

const SYSTEM_PROMPT = `You are a friendly, professional Lead Generation & Customer Assistant AI for Haris Farooq's Business (Automation Services, Software/Website Development, Student Master Class).

BUSINESS & COURSE KNOWLEDGE:
- Master Class Duration: ONLY 2 Live Sessions total! Each session is 2 hours long (Total 4 hours). It is NOT 1 month long.
- Master Class Focus: Hands-on practical building of real-world automation projects live together!
- Master Class Syllabus: Real-world n8n Workflow Automation, AI Agent Integration, Web Scraping, WhatsApp/Gmail Automation, and Python API Integration.
- Software & Automation Services: Custom n8n workflows, CRM integration, WhatsApp/Gmail AI bot setup, Custom Web Development.

CRITICAL RULES:
1. ANSWER QUESTIONS DIRECTLY: If the user asks specific questions (e.g., class duration, session hours, course timing, syllabus), ALWAYS answer their question clearly FIRST:
   - State clearly: Master Class duration is ONLY 2 sessions total (2 hours per session, total 4 hours of live practical project building). It is NOT 1 month long!
2. AFTER ANSWERING or ON ENROLMENT/SERVICE INTEREST: Collect lead details (Name, Phone/Email, Requirements).
3. IF USER HAS ALREADY PROVIDED DETAILS or ENROLLED: Acknowledge politely, answer any follow-up questions directly, and remind them that the team will reach out soon. DO NOT ask for their contact details repeatedly if already provided in chat history.
4. STRICTLY REFUSE OFF-TOPIC: Refuse unrelated requests (songs, poetry, coding help, jokes) with: 'Main sirf Haris Farooq ki Automation, Software, aur Master Class services ke silsiley mein assist kar sakta hoon.'
5. NO PRICE QUOTES: Do not quote prices (do not mention $75 or 20k-30k PKR).
6. LANGUAGE: Match customer language (Roman Urdu or English). Be concise, helpful, and polite.`;

function saveLeadRecord(sessionId, userMsg, aiReply) {
  try {
    const emailMatch = userMsg.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const phoneMatch = userMsg.match(/(\+?\d{10,14})/);
    
    if (emailMatch || phoneMatch || /naam|name|number|phone|email|enrol|enroll|registration/i.test(userMsg)) {
      let leads = [];
      try { leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8')); } catch (e) { leads = []; }
      
      const newLead = {
        timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }),
        sessionId: sessionId,
        userMessage: userMsg,
        aiResponse: aiReply,
        extractedContact: (emailMatch ? emailMatch[1] : "") + (phoneMatch ? " " + phoneMatch[1] : "")
      };
      
      leads.push(newLead);
      try { fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2)); } catch(e){}
    }
  } catch (err) {}
}

function callGroqAPI(messages) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
     model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages
      ],
      temperature: 0.2
    });

    const options = {
      hostname: "api.groq.com",
      port: 443,
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Length": Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          let reply = json.choices?.[0]?.message?.content || "Thank you for reaching out!";
          reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
          resolve(reply);
        } catch (e) {
          resolve("Master Class ki duration sirf 2 live sessions ki hai (har session 2 hours ka hota hai, total 4 hours). Isme hum live real-world projects build karne ki practical practice karte hain. Hamari team jald aap se contact karegi!");
        }
      });
    });

    req.on("error", err => resolve("Master Class duration is only 2 sessions of 2 hours each, focused on building real-world projects. Our team will contact you shortly!"));
    req.write(postData);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET Request Status or View Leads Page (/leads)
  if (req.method === "GET") {
    if (req.url === "/leads" || req.url === "/leads.csv") {
      let leads = [];
      try { leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8')); } catch (e) { leads = []; }

      if (req.url === "/leads.csv") {
        res.writeHead(200, {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=haris_farooq_chatbot_leads.csv"
        });
        let csv = "Timestamp,Session ID,User Message,Extracted Contact,AI Reply\n";
        leads.forEach(l => {
          csv += `"${l.timestamp}","${l.sessionId}","${(l.userMessage||'').replace(/"/g, '""')}","${(l.extractedContact||'').replace(/"/g, '""')}","${(l.aiResponse||'').replace(/"/g, '""')}"\n`;
        });
        res.end(csv);
        return;
      }

      // Render HTML Leads Dashboard
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Haris Farooq AI Chatbot Leads Dashboard</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 30px; }
            h1 { color: #38bdf8; font-size: 24px; }
            .btn { background: #0284c7; color: white; padding: 10px 18px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
            th, td { padding: 14px 18px; text-align: left; border-bottom: 1px solid #334155; font-size: 14px; }
            th { background: #0f172a; color: #94a3b8; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; }
            tr:hover { background: #334155; }
            .highlight { color: #4ade80; font-weight: 600; }
          </style>
        </head>
        <body>
          <h1>📊 Haris Farooq AI Chatbot Customer Leads (24/7 Production)</h1>
          <a href="/leads.csv" class="btn">📥 Download Excel (.CSV) File</a>
          <table>
            <thead>
              <tr>
                <th>Time (PKT)</th>
                <th>Session ID</th>
                <th>Customer Message</th>
                <th>Extracted Contact</th>
                <th>AI Reply</th>
              </tr>
            </thead>
            <tbody>
      `;

      if (leads.length === 0) {
        html += `<tr><td colspan="5" style="text-align:center; padding:30px; color:#94a3b8;">No customer leads recorded yet. Try chatting on the website!</td></tr>`;
      } else {
        leads.reverse().forEach(l => {
          html += `
            <tr>
              <td>${l.timestamp}</td>
              <td style="font-family:monospace; color:#94a3b8;">${l.sessionId}</td>
              <td>${l.userMessage}</td>
              <td class="highlight">${l.extractedContact || 'Provided in chat'}</td>
              <td style="color:#cbd5e1;">${l.aiResponse}</td>
            </tr>
          `;
        });
      }

      html += `
            </tbody>
          </table>
        </body>
        </html>
      `;
      res.end(html);
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "online",
      message: "🚀 Haris Farooq 24/7 Cloud AI Chatbot Server is Live!",
      leadsDashboard: "/leads",
      downloadExcelCSV: "/leads.csv"
    }, null, 2));
    return;
  }

  // POST Request Chat
  if (req.method === "POST") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const userMsg = payload.message || "hi";
        const sessionId = payload.sessionId || "global_session";

        if (!sessionStore[sessionId]) sessionStore[sessionId] = [];
        sessionStore[sessionId].push({ role: "user", content: userMsg });

        if (sessionStore[sessionId].length > 10) {
          sessionStore[sessionId] = sessionStore[sessionId].slice(-10);
        }

        const aiReply = await callGroqAPI(sessionStore[sessionId]);
        sessionStore[sessionId].push({ role: "assistant", content: aiReply });

        saveLeadRecord(sessionId, userMsg, aiReply);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ reply: aiReply }));
      } catch (err) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ reply: "Master Class duration is only 2 sessions of 2 hours each. Our team will contact you shortly!" }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

server.listen(PORT, () => {
  console.log(`🚀 24/7 CLOUD CHATBOT SERVER RUNNING ON PORT ${PORT}!`);
});
