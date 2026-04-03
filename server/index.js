import { createServer } from 'http';
import app from './src/app.js';
import { setupWebSocket } from './src/services/wsService.js';

const PORT = process.env.PORT || 3001;
const server = createServer(app);

setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`Family Dashboard server running on port ${PORT}`);
});
