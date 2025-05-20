# CreateRoom - Bot do Discord para Criação de Salas HaxBall

Este é um bot para Discord projetado para facilitar a criação de salas de HaxBall sob demanda, comunicando-se com servidores HaxHost dedicados.

## Funcionalidades Principais

* Criação de salas HaxBall através de comandos no Discord.
* Comunicação segura (via SSH) com múltiplos servidores HaxHost para instanciar as salas.
* Retorno do link da sala HaxBall diretamente no canal do Discord onde o comando foi executado.
* Monitoramento ou listagem de salas ativas. 
## Como Usar

Para criar uma sala, utilize o seguinte comando no Discord:

`!criarsala <nome_da_sala_opcional>` 

Exemplo:
`!criarsala Minha Sala Incrível`

O bot tentará criar a sala em um dos servidores HaxHost configurados e retornará o link.

## Configuração do Bot

Este bot requer Node.js e algumas configurações para funcionar corretamente.

### Pré-requisitos

* Node.js (versão X.X.X ou superior) *(Verifique sua versão com `node -v`)*
* `npm` ou `yarn` para gerenciamento de pacotes.
* Chave SSH privada (`servidoresHaxHost.pem` por padrão) para autenticação com os servidores HaxHost.

### Instalação

1.  Clone este repositório (se estiver configurando em um novo local):
    ```bash
    git clone git@github.com:gustavobbrz/CreateRoom_bot.git
    cd CreateRoom_bot
    ```
2.  Instale as dependências:
    ```bash
    npm install
    ```
    *(Ou `yarn install` se você usar Yarn)*

### Configuração de Ambiente

* **Token do Discord:** O token do seu bot do Discord precisa ser configurado, geralmente através de uma variável de ambiente ou um arquivo de configuração (ex: `.env`). **NUNCA FAÇA COMMIT DE TOKENS DIRETAMENTE NO CÓDIGO!**
* **Servidores HaxHost:** Informações sobre os IPs/hostnames dos servidores HaxHost e o caminho para a chave SSH (`servidoresHaxHost.pem`) são necessários para que o bot possa se conectar e executar os scripts de criação de sala.
* **Chave SSH:** A chave `servidoresHaxHost.pem` deve estar no local esperado pelo bot (ex: no diretório raiz do projeto ou em `~/.ssh/`) e ter as permissões corretas (`chmod 400 servidoresHaxHost.pem`).

### Arquivos Chave do Projeto

* `index.js`: Ponto de entrada principal do bot e lógica do Discord.
* `checkRooms.js`: (Se aplicável) Script para verificar ou gerenciar salas ativas.
* `activeRooms.json`: (Se aplicável) Arquivo para armazenar informações sobre salas ativas.
* `servidoresHaxHost.pem`: Chave privada SSH para conectar aos servidores HaxHost. *(Lembre-se de mantê-la segura e fora do versionamento se possível, ou use o `.gitignore` corretamente se ela estiver na pasta do projeto e não for o arquivo principal que está no diretório home do usuário)*.

## Para Executar o Bot

```bash
node index.js
