const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 정적 파일 제공 (public 폴더)
app.use(express.static(path.join(__dirname, 'public')));

// 게임 내 오브젝트 데이터 (초기 상태)
let gameObjects = {
  box1: { id: 'box1', x: -2, y: 0.5, z: 0, color: 0xff0000 },
  box2: { id: 'box2', x: 2, y: 0.5, z: 0, color: 0x0000ff }
};

io.on('connection', (socket) => {
  console.log('유저 접속:', socket.id);

  // 새로 들어온 유저에게 현재 테이블 오브젝트 상태 전송
  socket.emit('init-state', gameObjects);

  // 유저가 오브젝트를 이동시켰을 때
  socket.on('move-object', (data) => {
    if (gameObjects[data.id]) {
      gameObjects[data.id].x = data.x;
      gameObjects[data.id].z = data.z;
      
      // 나를 제외한 다른 모든 클라이언트에게 이동 위치 방송
      socket.broadcast.emit('update-object', data);
    }
  });

  socket.on('disconnect', () => {
    console.log('유저 연결 해제:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});
