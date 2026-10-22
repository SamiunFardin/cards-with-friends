const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const setupSocketHandlers = require('./server/socketHandler');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS configured for web clients
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static frontend assets from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Root route redirects to main interface
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Bind Socket.IO connection and game routing logic
setupSocketHandlers(io);

// Dynamic port assignment for Render deployment or local testing (default port 3000)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running and listening on port ${PORT}`);
});
