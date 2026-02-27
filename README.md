# Eagle Eye

Eagle Eye helps you scan your email at lightning speed with customizable categories.

## Run Locally

1. Install dependencies:
   ```bash
   bun install
   ```
2. Create local env files and fill in required values (Google OAuth, Convex URLs, and LLM keys):
   ```bash
   cp .env.example .env
   ```

   Follow this vid to get need google ouath secrets: https://www.youtube.com/watch?v=TjMhPr59qn4

3. Create a Convex project in one terminal (for all endpoints). Then add all .env variables into convex using their dashboard or `npx convex env set API_KEY <key>`

4. Deploy Convex to production:
   ```bash
   npx convex deploy
   ```

5. Start the Next.js app:
   ```bash
   bun dev
   ```
6. Open `http://localhost:3000`.
