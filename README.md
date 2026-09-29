# LOOP — Love Opportunities

> **No more missed deadlines.**  
> LOOP is a personalized opportunity discovery platform for students. It aggregates internships, scholarships, competitions, fellowships, and hackathons into one place and matches them to a user's profile.

---

## ✨ Features

- 🎯 **Personalized Opportunity Feed**: Dynamic match scoring based on skills, interests, and domain.
- 🔎 **Search & Category Filtering**: Easily filter by opportunity type, location, stipend, and remote status.
- 👆 **Tinder-Style Swiping**: Swipe right to express interest or left to pass.
- ❤️ **Status Tracking**: Keep track of Saved, Interested, Passed, and Applied opportunities.
- 📅 **Deadline Watchlist & Calendar**: Real-time countdowns and calendar visualization for upcoming deadlines.
- 👤 **Student Profiles**: Manage resume links, portfolio, custom skills, and preferences.
- 🤖 **Gemini-Powered Generation**: Instantly generate dynamic, realistic opportunities using Google Gemini 2.5 Flash.
- 📄 **AI Resume PDF Analysis**: Extract key skills and fields directly from uploaded PDF resumes.
- 🔐 **JWT Authentication**: Secure login, signup, and cookie-based session management.
- 🗄️ **MongoDB & Fallback**: Seamless database integration with automatic local mock-data fallback.

---

## 🛠️ Tech Stack

### Frontend
- **Core**: HTML5, Vanilla JavaScript (ES6+)
- **Styling**: Custom CSS (`styles.css`), Tailwind CSS
- **Icons**: Lucide Icons

### Backend & Database
- **Server Engine**: Node.js & Express
- **Database**: MongoDB (using Native Node.js Driver) with local JSON fallback
- **Authentication**: JWT (`jsonwebtoken`) & `bcrypt`
- **AI Integration**: Google GenAI SDK (`@google/genai`)

---

## 📁 Project Structure

```
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
├── backend/
│   └── server/
│       ├── app.js
│       ├── db.js
│       ├── gemini.server.js
│       └── mock-opportunities.js
│
├── package.json
├── package-lock.json
├── vercel.json
└── README.md
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables (`.env`)
Create a `.env` file in the root directory:
```env
MONGODB_URI=your_mongodb_uri
DATABASE_NAME=leap_lounge
JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_gemini_api_key
PORT=8080
NODE_ENV=development
```

### 3. Start Server
- **Development mode** (with auto-reload):
  ```bash
  npm run dev
  ```
- **Production mode**:
  ```bash
  npm start
  ```

Open [http://localhost:8080](http://localhost:8080) in your browser.

---

## 📜 Available Scripts

- `npm run dev`: Runs the backend server with Node.js native watch mode (`node --watch backend/server/app.js`).
- `npm start`: Starts the Express backend server (`node backend/server/app.js`).
- `npm run lint`: Runs ESLint to check for code quality issues.
- `npm run format`: Formats code across the workspace using Prettier.

---

## 🔌 Main API Routes

- `/api/auth/*` — User authentication (`/signup`, `/login`, `/me`, `/logout`)
- `/api/user/*` — User profile, preferences, resume parsing, saved opportunities
- `/api/feed/init` — Initialized opportunity feed with match scores
- `/api/opportunities/*` — Search, filter, fetch details, update opportunity statuses
- `/api/gemini/*` — AI-powered feed generation & PDF resume parsing
- `/api/master/*` — Master list of skills & interests