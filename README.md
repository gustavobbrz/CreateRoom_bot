# CreateRoom_BOT - Bot do Discord para Criação de Salas HaxBall

Este é um bot para Discord projetado para facilitar a criação de salas de HaxBall sob demanda, comunicando-se com servidores HaxHost dedicados.

## Funcionalidades Principais

* Criação de salas HaxBall através de comandos no Discord.
* Comunicação segura (via SSH) com múltiplos servidores HaxHost para instanciar as salas.
* Retorno do link da sala HaxBall diretamente no canal do Discord onde o comando foi executado.
* Pode incluir funcionalidades de monitoramento ou listagem de salas ativas.

## Como Usar (Exemplo)

Para criar uma sala, um comando similar a este pode ser usado no Discord:

`!criarsala Nome da Sala`

O bot tentará criar a sala em um dos servidores HaxHost configurados e retornará o link. (Consulte a configuração do bot para o comando exato e prefixo).

## Configuração do Bot

Este bot requer Node.js e algumas configurações para funcionar corretamente.

### Pré-requisitos

* Node.js (versão LTS recomendada).
* `npm` ou `yarn` para gerenciamento de pacotes.
* Chave SSH privada (ex: `servidoresHaxHost.pem`) para autenticação com os servidores HaxHost.

### Instalação

1.  Clone o repositório (se estiver configurando em um novo local):
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

* **Token do Discord:** O token do seu bot do Discord é essencial e deve ser configurado de forma segura, preferencialmente através de uma variável de ambiente ou um arquivo de configuração dedicado (ex: `.env`, que deve ser ignorado pelo Git). **NUNCA adicione tokens diretamente no código versionado.**
* **Servidores HaxHost:** As informações de conexão (IPs/hostnames) dos servidores HaxHost e o caminho para a chave SSH privada são necessários.
* **Chave SSH:** A chave privada para acessar os servidores HaxHost (ex: `servidoresHaxHost.pem`) deve estar armazenada de forma segura e com as permissões corretas (ex: `chmod 400 sua_chave.pem`).

### Arquivos Chave do Projeto (Estrutura Típica)

* `index.js`: Ponto de entrada principal do bot e lógica de interação com o Discord.
* `checkRooms.js`: (Se existir) Script para verificar ou gerenciar salas ativas.
* `activeRooms.json`: (Se existir) Arquivo para persistir informações sobre salas ativas.

## Para Executar o Bot

```bash
node index.js

https://www.youtube.com/watch?v=Z8naikC4ZPI
