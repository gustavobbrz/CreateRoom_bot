const { Client } = require('ssh2');
const fs = require('fs');

const conn = new Client();

const server = {
  host: '18.228.166.17', // IP público da sua EC2 que vai hospedar salas
  port: 22,
  username: 'ubuntu',
  privateKey: fs.readFileSync('/home/ubuntu/servidoresHaxHost.pem') // caminho na EC2 do bot
};

conn.on('ready', () => {
  console.log('Conectado via SSH!');
  // Executa um comando simples para testar
  conn.exec('uptime', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Stream fechado com código:', code);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect(server);
