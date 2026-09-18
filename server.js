const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let gameObjects = {};
let cardCount = 0;

function createJengaBlocks() {
  const blocks = {};
  const blockHeight = 0.6;
  let idCount = 0;

  for (let floor = 0; floor < 18; floor++) {
    const isEven = floor % 2 === 0;
    const y = floor * 0.62 + blockHeight / 2 + 0.1;

    for (let i = 0; i < 3; i++) {
      const id = `jenga_${idCount++}`;
      const offset = (i - 1) * 1.05;
      blocks[id] = {
        id, type: 'jenga_block',
        x: isEven ? 0 : offset, y, z: isEven ? offset : 0,
        rotY: isEven ? 0 : Math.PI / 2, color: 0xd2b48c
      };
    }
  }
  return blocks;
}

io.on('connection', (socket) => {
  socket.emit('init-physics-objects', gameObjects);

  socket.on('add-objects', (type) => {
    if (type === 'clear') {
      gameObjects = {};
    } else if (type === 'dice') {
      gameObjects['dice1'] = { id: 'dice1', type: 'dice', x: -1.5, y: 1, z: 0, color: 0xffffff };
      gameObjects['dice2'] = { id: 'dice2', type: 'dice', x: 1.5, y: 1, z: 0, color: 0xffffff };
    } else if (type === 'figures') {
      gameObjects['figure_red'] = { id: 'figure_red', type: 'figure', x: -2, y: 0.6, z: -2, color: 0xef4444 };
      gameObjects['figure_blue'] = { id: 'figure_blue', type: 'figure', x: 2, y: 0.6, z: 2, color: 0x3b82f6 };
      gameObjects['token_yellow'] = { id: 'token_yellow', type: 'token', x: -1, y: 0.2, z: 1, color: 0xeab308 };
      gameObjects['token_green'] = { id: 'token_green', type: 'token', x: 1, y: 0.2, z: 1, color: 0x10b981 };
    } else if (type === 'cards') {
      const suits = ['♠', '♥', '♦', '♣', '♠', '♥', '♦', '♣'];
      const values = ['A', '2', '7', 'J', 'Q', 'K', '3', '10'];
      for (let i = 0; i < 4; i++) {
        const id = `flying_card_${cardCount++}`;
        const suit = suits[cardCount % suits.length];
        const val = values[cardCount % values.length];
        gameObjects[id] = {
          id, type: 'flying_card',
          x: -2.2 + (i % 4) * 1.5, y: 0.05, z: 0,
          suit: suit, value: val,
          color: (suit === '♥' || suit === '♦') ? '#dc2626' : '#0f172a'
        };
      }
    } else if (type === 'jenga') {
      gameObjects = createJengaBlocks();
    }

    io.emit('init-physics-objects', gameObjects);
  });

  socket.on('move-object', (data) => {
    if (gameObjects[data.id]) {
      Object.assign(gameObjects[data.id], data);
      socket.broadcast.emit('update-object', data);
    }
  });

  socket.on('roll-dice', () => {
    io.emit('roll-dice-action');
  });

  socket.on('flip-card', (cardId) => {
    io.emit('flip-card-action', { id: cardId });
  });

  socket.on('reset-game', () => {
    gameObjects = {};
    io.emit('init-physics-objects', gameObjects);
  });
});

server.listen(PORT, () => console.log(`TTS 서버 실행 중: 포트 ${PORT}`));
