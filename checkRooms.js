const { Client } = require('ssh2');
const fs = require('fs');

const servidores = [
  { ip: '18.228.166.17', name: 'Servidor 1' },
  { ip: '15.228.245.54', name: 'Servidor 2' },
  { ip: '15.228.145.91', name: 'Servidor 3' },
];

const user = 'ubuntu';
const privateKey = fs.readFileSync('/home/ubuntu/servidoresHaxHost.pem');

function checkRooms() {
  return Promise.all(
    servidores.map(({ ip, name }) => {
      return new Promise((resolve, reject) => {
        const conn = new Client();
        conn
          .on('ready', () => {
            conn.exec('bash countRooms.sh', (err, stream) => {
              if (err) return reject(err);
              let data = '';
              stream.on('data', chunk => data += chunk.toString());
              stream.on('close', () => {
                const count = parseInt(data.trim()) || 0;
                resolve({ ip, name, count });
                conn.end();
              });
            });
          })
          .on('error', reject)
          .connect({ host: ip, username: user, privateKey });
      });
    })
  );
}

module.exports = { checkRooms };
