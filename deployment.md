# Deployment Instructions

Deploy the Flappy Bird Arcade game with multiplayer support onto Vercel (Frontend) and Railway (Backend).

## 1. Local Testing
To test the game and server locally:
1. Open terminal inside the project folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` in multiple browser windows or tabs to play together.

---

## 2. Backend Deployment (Railway)
Railway is perfect for Node.js WebSockets servers.

1. Create a free account on [Railway.app](https://railway.app).
2. Create a **New Project** and select **Deploy from GitHub repository**.
3. Choose your repository containing this codebase.
4. Railway will automatically detect the `package.json` and start the server using `npm start`.
5. Once deployed, go to the **Settings** tab of your service in Railway, scroll down to **Environment**, and click **Generate Domain**.
6. Copy the generated domain (e.g. `https://flappy-arcade-backend-production.up.railway.app`). Keep this URL for the frontend configuration step.

---

## 3. Frontend Deployment (Vercel)
Vercel is ideal for serving static HTML/CSS/JS frontend files.

1. Create an account on [Vercel.com](https://vercel.com).
2. Select **Add New...** -> **Project** and import your GitHub repository.
3. Keep the settings as default (static project).
4. Go to **Environment Variables** in Vercel settings for this project and add:
   - Key: `NEXT_PUBLIC_SOCKET_SERVER` or similar, or note that the client script will connect automatically to the server url.
   - Note: The frontend connects dynamically using either:
     - The local host (if running locally at localhost:3000)
     - A hardcoded backend URL at the top of `script.js` (you can configure it inside `script.js` directly by replacing `BACKEND_URL` with your Railway domain).
5. Click **Deploy**.
