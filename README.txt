FITPULSE V5 — EASY DEPLOYMENT

What is included:
- Mobile-friendly web app
- Sign Up / Login / Logout
- Cloud PostgreSQL database support (Supabase)
- User profile
- AI Coach + saved chat history
- Progress tracking
- Weekly plan
- Secure password hashing
- JWT authentication
- Render deployment configuration

IMPORTANT:
1. Do NOT put OPENAI_API_KEY in index.html.
2. Do NOT upload a real .env file or secret keys to GitHub.
3. V5 uses PostgreSQL through DATABASE_URL, so use a hosted PostgreSQL database for public deployment.

EASIEST PUBLIC DEPLOYMENT:
A) Create a Supabase project and get its PostgreSQL connection string.
B) Create a GitHub repository and upload the contents of this folder.
C) Create a Render Web Service from that GitHub repository.
D) Build command: npm install
E) Start command: npm start
F) Add these Render environment variables:
   DATABASE_URL = Supabase connection string
   JWT_SECRET = a long random secret
   OPENAI_API_KEY = your server-side API key
   OPENAI_MODEL = gpt-5.6-mini
G) Deploy. Render gives you a public onrender.com address.

LOCAL TEST:
npm install
npm start
Then open http://localhost:3000

DATABASE TABLES ARE CREATED AUTOMATICALLY:
users, chats, progress

NOTE:
Free hosting/database plans can have sleep/usage limits. A public URL is not a guarantee of 24/7 uptime forever.
