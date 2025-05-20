// ~/haxbot/testAllConnections.js
require('dotenv').config(); // Para carregar o caminho da chave do .env
const { NodeSSH } = require('node-ssh');

const SSH_KEY_PATH = process.env.SSH_KEY_PATH; // Pega do .env

if (!SSH_KEY_PATH) {
    console.error("ERRO CRÍTICO: SSH_KEY_PATH não definido no arquivo .env! O script não pode continuar.");
    console.log("Certifique-se de que seu arquivo .env na pasta ~/haxbot contém a linha: SSH_KEY_PATH=/caminho/para/sua/chave.pem");
    process.exit(1);
}

// Lista das suas EC2s HaxBall com os IPs fornecidos
const SERVIDORES_EC2_HAXBALL = [
    { name: 'Servidor HaxBall EC2-1', ip: '18.228.166.17', ssh_user: 'ubuntu' },
    { name: 'Servidor HaxBall EC2-2', ip: '15.228.245.54', ssh_user: 'ubuntu' },
    { name: 'Servidor HaxBall EC2-3', ip: '15.228.145.91', ssh_user: 'ubuntu' },
];

const SSH_CONFIG_BASE = {
    username: 'ubuntu', // Usuário SSH padrão para suas EC2 HaxBall
    privateKeyPath: SSH_KEY_PATH // Caminho da chave privada lido do .env
    // Se sua chave privada tiver uma senha (passphrase), adicione aqui:
    // passphrase: 'SUA_SENHA_DA_CHAVE_AQUI'
};

async function testConnections() {
    console.log(`[Teste de Conexão] Usando chave SSH de: ${SSH_KEY_PATH}\n`);

    for (const server of SERVIDORES_EC2_HAXBALL) {
        const ssh = new NodeSSH();
        console.log(`--- Testando conexão com ${server.name} (${server.ip}) ---`);
        try {
            await ssh.connect({
                host: server.ip,
                username: server.ssh_user, // Usa o usuário definido para este servidor
                privateKeyPath: SSH_CONFIG_BASE.privateKeyPath,
                // passphrase: SSH_CONFIG_BASE.passphrase // Descomente se sua chave tiver passphrase
            });
            console.log(`✅ Conectado a ${server.name}!`);

            // Testa um comando simples para verificar a execução remota
            const commandToRun = 'ls -lah ~'; // Lista arquivos e pastas na home do usuário SSH
            console.log(`Executando comando: "${commandToRun}" em ${server.name}...`);
            const result = await ssh.execCommand(commandToRun);
            
            console.log(`Saída do comando em ${server.name}:`);
            if (result.stdout) {
                console.log("STDOUT:\n" + result.stdout);
            }
            if (result.stderr) {
                console.error("STDERR:\n" + result.stderr);
            }
            if (!result.stdout && !result.stderr) {
                console.log("(Comando executou, mas não houve saída em stdout ou stderr)");
            }

            ssh.dispose();
            console.log(`✔️  Teste para ${server.name} concluído com sucesso.\n`);

        } catch (error) {
            console.error(`❌ ERRO ao conectar ou executar comando em ${server.name} (${server.ip}):`);
            console.error(`  Tipo de Erro: ${error.name}`);
            console.error(`  Mensagem: ${error.message}`);
            if (error.level) { // node-ssh às vezes inclui um 'level' para erros de autenticação
                console.error(`  Nível do Erro (ssh2): ${error.level}`);
            }
            console.log("  Possíveis causas:");
            console.log("    - A chave pública correspondente à chave privada acima NÃO está no arquivo ~/.ssh/authorized_keys do usuário 'ubuntu' na EC2 alvo.");
            console.log("    - O arquivo da chave privada está corrompido ou não é o correto.");
            console.log("    - O formato da chave privada não é suportado (use RSA PEM tradicional).");
            console.log("    - Há um firewall ou Security Group bloqueando a porta SSH (22) para esta EC2 do bot.");
            console.log("    - O IP do servidor está incorreto ou o servidor está offline.");
            console.log(`❌ Teste para ${server.name} FALHOU.\n`);
        }
    }
    console.log("--- Todos os testes de conexão foram concluídos. ---");
}

testConnections();
