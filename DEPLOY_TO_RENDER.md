# Deploying TimeGen to Render (step-by-step)

1. Push the repo to GitHub if you haven't already:
```bash
cd "e:/final year"
git init
git add .
git commit -m "Prepare TimeGen for deploy"
# create repo on GitHub then:
git remote add origin https://github.com/<your-username>/<repo>.git
git branch -M main
git push -u origin main
```

2. Create a Render account and connect your GitHub.

3. Import the repository into Render:
   - In Render dashboard, click "New" → "Web Service" → "Connect a repository".
   - Choose your repo and branch (`main`).
   - Render will use `render.yaml` if present; otherwise set Build Command to `npm install` and Start Command to `npm start`.

4. Set environment variables (Render Dashboard → Environment):
   - `MONGO_URI` — MongoDB connection string (Atlas recommended)
   - `EMAIL_USER` — SMTP/Gmail account used to send emails
   - `EMAIL_PASS` — SMTP password or Gmail App Password
   - `PUBLIC_URL` — optional; set to the Render-provided URL for stable link generation
   - `PORT` — optional (default 3000)

5. Deploy and wait for the build to finish. Render will provide an HTTPS URL like `https://timegen-web.onrender.com`.

6. (Optional) Set `PUBLIC_URL` to the Render URL in environment variables to make QR links permanent.

7. Verify:
   - Open the Render URL in a browser.
   - Register a user, go to Dashboard, and click `Generate Timetable` to get the public form QR/link.

Notes:
- Do not put secrets in the repository. Use Render's Environment settings to store secrets.
- If you don't want to use `render.yaml`, configure the service manually in Render's UI.
