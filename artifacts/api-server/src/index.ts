import app from "./app";
import { logger } from "./lib/logger";
import express from 'express';
const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the React build (adjust path as needed)
const frontendDist = path.resolve(__dirname, '../../artifacts/science-research-portal/dist');
app.use(express.static(frontendDist));

// For any route not matched by API, serve the React index.html
app.get('/.*/', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
