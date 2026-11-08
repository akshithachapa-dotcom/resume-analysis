# CareerPilot — Resume Analyzer & Career Matching

A deployable Node.js/Express starter with:
- Registration and login (bcrypt password hashing, signed JWT sessions)
- PDF and DOCX resume upload and text extraction
- Skill extraction from resume text
- Sample job-role matching and custom job-description matching
- Missing-skill analysis and a starter career roadmap
- Responsive frontend with explicit dark text on white input backgrounds (fixes invisible typing)

## Run locally
1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and set a long random `JWT_SECRET`.
3. Run `npm install`
4. Run `npm start`
5. Open http://localhost:3000

## Deploy
Deploy as a Node web service on Render or another Node host:
- Build command: `npm install`
- Start command: `npm start`
- Set `JWT_SECRET` to a long random secret.
- Attach persistent storage and set `DATA_DIR` to its mount path. SQLite data and uploads need persistent storage.
- Use HTTPS. Never commit `.env`.

## Important limitations
This is a functional starter, not a finished commercial AI hiring product. Skill extraction is dictionary/keyword based; matching compares recognized skill names, not semantic understanding. The job listings are clearly labeled illustrative sample roles, not live vacancies or real company openings. Education and experience checks are simple signals, not verified eligibility. The `OPENAI_API_KEY` is not used yet; add an AI service with privacy, cost controls, validation and user consent before describing the product as AI-powered. Add rate limiting, email verification, password reset, malware scanning, retention controls, backups, logging and production security review before public launch. For production, prefer managed PostgreSQL and private object storage over local SQLite/disk if your host has ephemeral storage.
