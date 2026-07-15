# CheckMate

CheckMate is an AI-powered worksheet grading assistant for K-12 teachers. It uses OCR and large language models to read scanned student work, evaluate the work shown (not just final answers), and generate personalized feedback for each student — turning hours of manual grading into minutes.

## Features

**Upload and processing**
- Drag-and-drop upload for multiple files (PDF, JPG, PNG)
- Automatic detection of student names from handwriting
- Batch processing for entire class sets with real-time progress tracking

**Grading engine**
- Multi-subject support: Mathematics, English/Language Arts, and Science
- Evaluates the work shown and recognizes multiple solution methods
- Awards partial credit for correct methodology

**Feedback generation**
- Contextual comments based on each student's specific errors and strengths
- Constructive suggestions for improvement
- Configurable tone (strict, encouraging, or lighthearted)

**Teacher dashboard**
- Class performance overview with visual analytics
- Identification of common mistakes across the class
- Individual student progress tracking over time

## Tech Stack

- **Backend:** Node.js, Express, MongoDB
- **AI services:** Google Gemini (grading and feedback), Google Cloud Vision (OCR)
- **Frontend:** HTML, CSS, and vanilla JavaScript
- **Deployment:** Vercel

## Project Structure

```
backend/
  api/          Express route handlers (auth, upload, grading, analytics, ...)
  models/       MongoDB data models
  services/     Database, Gemini, and OCR integrations
  utils/        Shared helpers
frontend/
  css/          Stylesheets
  js/           Client-side scripts
  pages/        Application pages
  index.html    Entry point
docs/           Project background and documentation
server.js       Express server entry point
vercel.json     Vercel deployment configuration
```

## Getting Started

### Prerequisites

- Node.js 18 or later
- A MongoDB database (e.g., MongoDB Atlas)
- API keys for Google Gemini and Google Cloud Vision

### Setup

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/aaravjaichand/CheckMate.git
   cd CheckMate
   npm install
   ```

2. Create an environment file from the template and fill in your values:

   ```bash
   cp .env.example .env
   ```

   At minimum, set `MONGODB_URI`, `JWT_SECRET`, and `GEMINI_API_KEY`. See `.env.example` for the full list of options.

3. Start the development server:

   ```bash
   npm run dev
   ```

   The application runs at `http://localhost:3000`.

## Deployment

The project is configured for Vercel via `vercel.json`. Set the environment variables from `.env.example` in your Vercel project settings and deploy; `server.js` is served as a serverless function and `frontend/` as static assets.

## License

MIT
