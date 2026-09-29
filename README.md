LOOP — Love Opportunities

No more missed deadlines.

LOOP is a personalized opportunity discovery platform for students. It brings internships, scholarships, competitions, fellowships, and hackathons into one place and matches them to a user's profile.

✨ Features

🎯 Personalized opportunity feed with match scores

🔎 Search and category filtering

👆 Swipe-based opportunity discovery

❤️ Save, interested, passed, and applied tracking

📅 Deadline calendar and upcoming-deadline watchlist

👤 Custom student profiles and preferences

🤖 Gemini-powered opportunity generation

📄 AI resume PDF analysis

🔐 JWT authentication with password reset

🗄️ MongoDB with local mock-data fallback

🛠️ Tech Stack

Frontend

HTML, CSS, JavaScript

Tailwind CSS

Lucide Icons

Backend

Node.js

Express

JWT

bcrypt

MongoDB

Google Gemini

📁 Project Structure

LOOP/
├── frontend/
│   ├── index.html
│   ├── login.html
│   ├── signup.html
│   ├── opportunity.html
│   ├── profile.html
│   ├── saved.html
│   ├── calendar.html
│   ├── common.js
│   └── styles.css
│
└── server/
    ├── app.js
    ├── db.js
    ├── gemini.server.js
    └── mock-opportunities.js

🚀 Run Locally

1. Install dependencies

npm install

2. Configure .env

MONGODB_URI=your_mongodb_uri
DATABASE_NAME=your_database
JWT_SECRET=your_secret
GEMINI_API_KEY=your_gemini_api_key
PORT=8080
NODE_ENV=development

3. Start the server

npm start

Open:

http://localhost:8080

🔌 Main API Routes

/api/auth/*
/api/user/*
/api/feed/init
/api/opportunities/*
/api/gemini/*
/api/master/*

🤖 AI

LOOP uses Gemini for:

Personalized opportunity generation

Resume PDF analysis