# TimeGen University Timetable System

This is a Node.js + Express + MongoDB application for generating academic timetables from teacher assignment submissions.

## What this project does
- serves a landing page with login/register
- provides an authenticated dashboard with `Generate Timetable` and `View Timetables`
- generates a QR-enabled faculty assignment form
- saves faculty submissions to MongoDB
- generates a clash-free timetable by semester/division

## Files you need
- `server.js` — Node.js backend and API routes
- `db.js` — MongoDB connection
- `frontend/` — static HTML/CSS/JS frontend pages
- `package.json` — Node dependencies and start script

## Local setup
1. Install Node.js (recommended v18 or v20).
2. Open a terminal in the project folder:
   ```bash
   cd "e:\final year"
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start MongoDB locally or use MongoDB Atlas. If you use Atlas, set `MONGO_URI`.
5. Start the app:
   ```bash
   npm start
   ```
6. Open the app in your browser:
   ```bash
   http://localhost:3000
   ```

## Environment variables
Use these when you deploy:

- `MONGO_URI` — your MongoDB connection string
- `PUBLIC_URL` — the public address of your app, for stable QR/link generation

Example on Windows PowerShell:
```powershell
$env:MONGO_URI = 'mongodb+srv://<user>:<pass>@cluster0.mongodb.net/timetable_db?retryWrites=true&w=majority'
$env:PUBLIC_URL = 'https://your-app.example.com'
npm start
```

## How to make the QR link work on every phone
The app already uses `PUBLIC_URL` when available. That means your generated link will be permanent and public instead of temporary.

To make it truly phone-friendly:
- deploy the app to a public HTTPS host
- set `PUBLIC_URL` to that host URL
- use the generated QR or link from that public URL

## Deployment options

### Option 1: Render
1. Create a Render account.
2. Create a new Web Service.
3. Connect your GitHub repo or drag your project files.
4. Set the Build Command to:
   ```bash
   npm install
   ```
5. Set the Start Command to:
   ```bash
   npm start
   ```
6. Add environment variables:
   - `MONGO_URI`
   - `PUBLIC_URL` = the Render service URL, e.g. `https://your-service.onrender.com`
7. Deploy and visit the Render URL.

### Option 2: Railway
1. Create a Railway account.
2. Create a new project and add a Node.js service.
3. Upload or connect the repo.
4. Set `npm start` as the start command.
5. Add `MONGO_URI` and `PUBLIC_URL` in Railway environment settings.
6. Deploy and open the provided URL.

### Option 3: VPS / DigitalOcean / SSH server
1. Upload all project files to the server.
2. Install Node.js on the server.
3. Run:
   ```bash
   npm install
   ```
4. Set environment variables on the server:
   ```bash
   export MONGO_URI='...'
   export PUBLIC_URL='https://your-domain.com'
   ```
5. Start the app:
   ```bash
   npm start
   ```
6. Use a process manager like `pm2` or `screen` to keep it running.

## What to do after deployment
1. Go to the public URL in your browser.
2. Register or log in.
3. Open the dashboard and click `Generate Timetable`.
4. Use the QR/link to access `form.html` from a phone.
5. Submit assignments and then visit `View Timetables`.

## Notes
- If your server is only static hosting, this app will not work because it needs Node.js backend.
- If you want the page to open directly after deployment, use a public Node host and set `PUBLIC_URL`.
- The app already has a `start` script in `package.json`:
  ```json
  "scripts": {
    "start": "node server.js"
  }
  ```

## Troubleshooting
- If the frontend does not load, make sure the Node server is running.
- If login fails, check `server.js` and MongoDB connection.
- If QR links still require same Wi-Fi, ensure `PUBLIC_URL` is set and resolves to your deployed server.

## Docker (optional)

To run the app with Docker and a local MongoDB container, use the provided `Dockerfile` and `docker-compose.yml`.

Build and run:
```bash
cd "e:/final year"
docker compose up --build
```

This will start two services: `app` (your Node server) mapped to port `3000`, and `mongo` (MongoDB). Environment variables `EMAIL_USER`, `EMAIL_PASS`, and `PUBLIC_URL` can be provided via your shell or a `.env` file used by Docker Compose.

If you prefer MongoDB Atlas, remove the `mongo` service or set `MONGO_URI` in the `app` service to your Atlas connection string.

---

If you want, I can also help you prepare this project for GitHub and show the exact Render deployment commands step by step.
 
## Git & deploy quick start

Create a GitHub repo and push the project (from project root):

```bash
git init
git add .
git commit -m "Initial TimeGen project"
# create a remote on GitHub and then:
git remote add origin https://github.com/<your-username>/<repo>.git
git branch -M main
git push -u origin main
```

After pushing, connect the GitHub repo to Render/Railway or any host and set the required environment variables in the host's dashboard (`MONGO_URI`, `EMAIL_USER`, `EMAIL_PASS`, `PUBLIC_URL`).