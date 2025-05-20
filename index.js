// ~/haxbot/index.js
// SALVE ESTE ARQUIVO COMO UTF-8!

require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ChannelType } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Carrega variáveis do .env
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || "!";
const PEM_KEY_PATH = process.env.SSH_KEY_PATH;
const HAXBALL_EC2_IPS_STRING = process.env.HAXBALL_EC2_IPS;
const MAX_ROOMS_PER_EC2 = parseInt(process.env.MAX_ROOMS_PER_EC2, 10) || 2;
const ACTIVE_ROOMS_FILE_PATH = process.env.ACTIVE_ROOMS_FILE_PATH || path.join(__dirname, 'activeRooms.json');
const HAXBALL_EC2_USER = process.env.HAXBALL_EC2_USER || "ubuntu";
const REMOTE_SCRIPT_PATH = process.env.REMOTE_SCRIPT_PATH;
const STATS_CHANNEL_ID = process.env.STATS_CHANNEL_ID;
const STATS_UPDATE_INTERVAL_MS = parseInt(process.env.STATS_UPDATE_INTERVAL_MS, 10) || 60000;

let HAXBALL_EC2_SERVERS = [];
if (HAXBALL_EC2_IPS_STRING) {
    HAXBALL_EC2_SERVERS = HAXBALL_EC2_IPS_STRING.split(',').map(ip => ip.trim());
}

if (!BOT_TOKEN || !PEM_KEY_PATH || HAXBALL_EC2_SERVERS.length === 0 || !REMOTE_SCRIPT_PATH || !STATS_CHANNEL_ID) {
    console.error("ERRO CRÍTICO: Variáveis de ambiente faltando ou incorretas! Verifique .env:");
    console.error("- DISCORD_TOKEN, SSH_KEY_PATH, HAXBALL_EC2_IPS (precisa de pelo menos um IP), REMOTE_SCRIPT_PATH, STATS_CHANNEL_ID");
    process.exit(1);
}

const userRoomSetups = new Map();
let lastStatusMessageId = null;
let statsChannel = null;

// --- Funções para activeRooms.json ---
async function readActiveRooms() {
    try {
        await fs.access(ACTIVE_ROOMS_FILE_PATH);
        const data = await fs.readFile(ACTIVE_ROOMS_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') { 
            await writeActiveRooms([]);
            return [];
        }
        console.warn(`Aviso: Não foi possível ler ${ACTIVE_ROOMS_FILE_PATH}. Retornando lista vazia. Erro: ${error.message}`);
        return [];
    }
}

async function writeActiveRooms(rooms) {
    try {
        await fs.writeFile(ACTIVE_ROOMS_FILE_PATH, JSON.stringify(rooms, null, 2), 'utf-8');
    } catch (error) {
        console.error(`Erro CRÍTICO ao escrever em ${ACTIVE_ROOMS_FILE_PATH}:`, error);
    }
}

async function cleanupAndVerifyRooms(activeRoomsInput) {
    const now = Date.now();
    const MAX_LIFESPAN_MS = (2 * 60 * 60 * 1000) + (10 * 60 * 1000); 

    const potentiallyActiveRooms = activeRoomsInput.filter(room => {
        if (!room.creationTimestamp) return false; 
        if ((now - room.creationTimestamp > MAX_LIFESPAN_MS)) {
            console.log(`[ROOM CLEANUP STALE] Removendo sala antiga "${room.roomName}" (mais de ~2h10m) no servidor ${room.serverIp}`);
            return false;
        }
        return true;
    });
    
    if (potentiallyActiveRooms.length !== activeRoomsInput.length) {
      await writeActiveRooms(potentiallyActiveRooms);
    }
    return potentiallyActiveRooms; 
}

function formatTimeRemaining(creationTimestamp) {
    const totalLifespanMs = 2 * 60 * 60 * 1000;
    const endTime = creationTimestamp + totalLifespanMs;
    const remainingMs = Math.max(0, endTime - Date.now());

    if (remainingMs === 0) return "Encerrando...";

    const hours = Math.floor(remainingMs / (60 * 60 * 1000));
    const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
    
    let str = "";
    if (hours > 0) str += `${hours}h `;
    if (minutes > 0 || hours === 0) str += `${minutes}m`;
    
    return str.trim() + " restantes";
}

async function updateServerStatsMessage() {
    if (!statsChannel) {
        console.warn("[STATS] Canal de status não encontrado. Pulando atualização.");
        return;
    }

    let activeRooms = await readActiveRooms();
    activeRooms = await cleanupAndVerifyRooms(activeRooms);

    const statusEmbed = new EmbedBuilder()
        .setColor(0x1ABC9C)
        .setTitle('📊 Status dos Servidores HaxBall 🚀')
        .setTimestamp()
        .setFooter({ text: 'Hax Host Bot | Atualizado em', iconURL: client.user.displayAvatarURL() });

    if (HAXBALL_EC2_SERVERS.length === 0) {
        statusEmbed.setDescription("⚠️ Nenhum servidor HaxBall configurado no momento.");
    } else {
        let totalRoomsOverall = 0;
        let totalCapacityOverall = 0;

        for (const serverIp of HAXBALL_EC2_SERVERS) {
            const roomsOnThisServer = activeRooms.filter(room => room.serverIp === serverIp);
            const roomCount = roomsOnThisServer.length;
            let availableSlots = MAX_ROOMS_PER_EC2 - roomCount;
            if (availableSlots < 0) availableSlots = 0;

            let serverStatusEmoji = "🟢";
            if (roomCount >= MAX_ROOMS_PER_EC2) {
                serverStatusEmoji = "🔴 LOTADO";
            } else if (roomCount > 0) {
                serverStatusEmoji = `🟡 Ocupado (${availableSlots} vaga${availableSlots === 1 ? "" : "s"})`;
            } else {
                serverStatusEmoji = `🟢 Livre (${availableSlots} vaga${availableSlots === 1 ? "" : "s"})`;
            }
            
            let roomListString = "Nenhuma sala aberta neste servidor! Que tal criar uma? 😉";
            if (roomsOnThisServer.length > 0) {
                roomListString = roomsOnThisServer.map(r => {
                    const timeRemaining = r.creationTimestamp ? formatTimeRemaining(r.creationTimestamp) : "Tempo indefinido";
                    return `⚽ [**${r.roomName.substring(0, 25)}**](${r.link}) - ${timeRemaining}`;
                }).join("\n");
            }

            statusEmbed.addFields({
                name: `${serverStatusEmoji} Servidor (${serverIp})`,
                value: `**Salas:** ${roomCount}/${MAX_ROOMS_PER_EC2}\n**Salas Ativas:**\n${roomListString}`,
                inline: false
            });
            totalRoomsOverall += roomCount;
            totalCapacityOverall += MAX_ROOMS_PER_EC2;
        }
        statusEmbed.setDescription(`**Resumo Geral:** ${totalRoomsOverall} sala(s) ativa(s) de ${totalCapacityOverall} vagas totais disponíveis nos servidores configurados.`);
    }

    try {
        if (lastStatusMessageId) {
            const messageToEdit = await statsChannel.messages.fetch(lastStatusMessageId).catch(() => null);
            if (messageToEdit) {
                await messageToEdit.edit({ embeds: [statusEmbed] });
                return;
            } else {
                lastStatusMessageId = null;
            }
        }
        const sentMessage = await statsChannel.send({ embeds: [statusEmbed] });
        lastStatusMessageId = sentMessage.id;
    } catch (error) {
        console.error(`[STATS] Erro ao enviar/editar mensagem no canal ${STATS_CHANNEL_ID}:`, error.message);
        lastStatusMessageId = null;
    }
}

client.once('ready', async () => {
    console.log(`🤖 Bot ${client.user.tag} está tinindo e pronto para a ação!`);
    console.log(`🛠️  Prefixo de comando: ${COMMAND_PREFIX}`);
    client.user.setPresence({ activities: [{ name: '⚽ HaxBall com a galera!' }], status: 'online' });

    if (STATS_CHANNEL_ID) {
        try {
            const channel = await client.channels.fetch(STATS_CHANNEL_ID);
            if (channel && (channel.type === ChannelType.GuildText || channel.type === 0)) { 
                statsChannel = channel; 
                console.log(`[STATS] Canal de status (#${statsChannel.name}) encontrado! Iniciando atualizações.`);
                await updateServerStatsMessage(); 
                setInterval(updateServerStatsMessage, STATS_UPDATE_INTERVAL_MS);
            } else {
                console.error(`ERRO: Canal de status ID ${STATS_CHANNEL_ID} não é um canal de texto ou não foi encontrado.`);
            }
        } catch (error) {
            console.error(`ERRO ao buscar o canal de status ID ${STATS_CHANNEL_ID}:`, error);
        }
    } else {
        console.warn("AVISO: STATS_CHANNEL_ID não definido no .env. Atualização de status desabilitada.");
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.channel.type === ChannelType.DM || message.channel.type === 1) { 
        const setupState = userRoomSetups.get(message.author.id);
        if (setupState) {
            await handleSetupStep(message, setupState);
        }
        return;
    }

    if (!message.content.startsWith(COMMAND_PREFIX)) return;

    const args = message.content.slice(COMMAND_PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    if (commandName === "criarsala" || commandName === "criar") {
        if (userRoomSetups.has(message.author.id)) {
            const alreadyCreatingEmbed = new EmbedBuilder().setColor(0xFFB800).setTitle('⚠️ Opa! Calma aí...').setDescription('Você já tem uma configuração de sala em andamento.\nFinalize ou use `!cancelar` antes de começar uma nova, beleza?').setFooter({ text: 'Dica: Cheque suas Mensagens Diretas (DM)!' });
            try { await message.author.send({ embeds: [alreadyCreatingEmbed] }); } catch (e) { console.warn("Falha ao enviar DM de aviso de setup existente", e.message); }
            return message.reply({ embeds: [alreadyCreatingEmbed.setDescription('Você já está configurando uma sala. Dá uma olhada nas suas Mensagens Diretas (DM)! 😉')] });
        }
        try {
            const dmChannel = await message.author.createDM();
            const setupState = { step: 'awaiting_room_name', guildId: message.guildId, originalChannelId: message.channel.id, messageSource: message, dmChannel: dmChannel, timeout: null };
            userRoomSetups.set(message.author.id, setupState);
            setupState.timeout = createStepTimeout(message.author.id, dmChannel, setupState.messageSource);
            
            const initialEmbed = new EmbedBuilder().setColor(0x05A3E3).setTitle('⚽ Criação de Sala HaxBall 🥅').setDescription(`E aí, ${message.author.username}! Pronto para montar aquela sala épica de HaxBall? Estou aqui para ajudar!`).addFields({ name: '🏷️ Primeiro: Qual nome você quer para a sala?', value: 'Capriche no nome! (Entre 3 e 40 caracteres, ok?)\nVocê tem 2 minutinhos para me dizer.' }).setFooter({ text: 'Hax Host Bot - Seu criador de salas particular!', iconURL: client.user.displayAvatarURL() }).setTimestamp();
            await dmChannel.send({ embeds: [initialEmbed] });

            const replyEmbed = new EmbedBuilder().setColor(0x05A3E3).setDescription(`Ok, ${message.author.username}! 🚀 Te chamei nas Mensagens Diretas (DM) para darmos o pontapé inicial na configuração da sua sala!`);
            await message.reply({ embeds: [replyEmbed] });
        } catch (error) {
            console.error(`Erro ao tentar iniciar DM com ${message.author.tag}:`, error);
            userRoomSetups.delete(message.author.id);
            const dmErrorEmbed = new EmbedBuilder().setColor(0xE74C3C).setTitle('❌ Ops! Problema na DM').setDescription('Não consegui te enviar uma Mensagem Direta (DM).\nPor favor, verifique suas configurações de privacidade no Discord e tente novamente.');
            await message.reply({ embeds: [dmErrorEmbed] });
        }
    } else if (commandName === "cancelar") {
        if (userRoomSetups.has(message.author.id)) {
            const setupState = userRoomSetups.get(message.author.id);
            if (setupState.timeout) clearTimeout(setupState.timeout);
            userRoomSetups.delete(message.author.id);
            const cancelEmbed = new EmbedBuilder().setColor(0x95A5A6).setDescription('🗑️ Criação de sala cancelada.');
            await message.reply({ embeds: [cancelEmbed] });
            try { await setupState.dmChannel.send({ embeds: [cancelEmbed.setTitle('🗑️ Processo Cancelado').setDescription('Você cancelou a criação da sala.')] }); } catch (e) {}
        } else {
            const noProcessEmbed = new EmbedBuilder().setColor(0xFFB800).setDescription('🤔 Nenhuma configuração de sala em andamento para cancelar.');
            await message.reply({ embeds: [noProcessEmbed] });
        }
    } else if (commandName === "statuservidores" || commandName === "status") {
        if (!statsChannel && STATS_CHANNEL_ID) { 
             try {
                const channel = await client.channels.fetch(STATS_CHANNEL_ID);
                if (channel && (channel.type === ChannelType.GuildText || channel.type === 0)) {
                    statsChannel = channel;
                }
             } catch(e) { console.error("Erro ao tentar buscar canal de status no comando:", e.message)}
        }
        if (statsChannel) {
            await message.channel.sendTyping();
            await updateServerStatsMessage(); 
            await message.reply(`📊 O status dos servidores foi atualizado em #${statsChannel.name}!`);
        } else {
            await message.reply("⚠️ O canal de status não está configurado ou não foi encontrado. Peça para um admin verificar!");
        }
    }
});

function createStepTimeout(userId, dmChannel, originalMessageSource) {
    const stepTimeoutDuration = 2 * 60 * 1000;
    return setTimeout(async () => {
        if (userRoomSetups.has(userId)) {
            const setupState = userRoomSetups.get(userId); 
            userRoomSetups.delete(userId);
            const timeoutEmbed = new EmbedBuilder().setColor(0xFFB800).setTitle('⌛ Ih, o tempo voou!').setDescription('O tempo para esta etapa da configuração esgotou.\nSe ainda quiser criar a sala, é só usar o comando de criar sala novamente.');
            try {
                await dmChannel.send({ embeds: [timeoutEmbed] });
            } catch (e) {
                console.warn("Falha ao enviar DM de timeout de etapa", e.message);
                if (originalMessageSource && originalMessageSource.channel) { 
                    try { 
                        const channelTimeoutEmbed = new EmbedBuilder().setColor(0xFFB800).setDescription(`⏰ ${originalMessageSource.author.username}, parece que o tempo para configurar a sala na DM esgotou. Tente de novo quando quiser!`);
                        await originalMessageSource.channel.send({embeds: [channelTimeoutEmbed]}); 
                    } catch (e2) { console.error("Erro ao notificar canal original sobre DM timeout:", e2.message);}
                }
            }
        }
    }, stepTimeoutDuration);
}

async function handleSetupStep(dmMessage, setupState) {
    const userId = dmMessage.author.id;
    const userInput = dmMessage.content.trim();

    if (setupState.timeout) clearTimeout(setupState.timeout);
    setupState.timeout = createStepTimeout(userId, setupState.dmChannel, setupState.messageSource);

    try {
        if (setupState.step === 'awaiting_room_name') { // Corrigido de 'awaiting_selection_or_room_name'
            if (userInput.length < 3 || userInput.length > 40) {
                const invalidNameEmbed = new EmbedBuilder().setColor(0xE74C3C).setTitle('📛 Nome Inválido').setDescription('O nome da sala precisa ter entre 3 e 40 letras ou números.\nPor favor, me diga outro nome!');
                await setupState.dmChannel.send({ embeds: [invalidNameEmbed] });
                return;
            }
            setupState.roomName = userInput;
            setupState.step = 'awaiting_admin_password';
            const passwordEmbed = new EmbedBuilder().setColor(0x2ECC71).setTitle(`🏷️"${setupState.roomName}" - Adorei o nome!`).addFields({ name: '🔑 Agora, a senha de Admin', value: 'Digite uma senha para você usar os comandos de admin **DENTRO** da sala HaxBall (ex: `!admin SUA_SENHA`).\n(Mín. 4, máx. 20 caracteres)' }).setFooter({ text: 'Hax Host Bot | Etapa 2/3', iconURL: client.user.displayAvatarURL() });
            await setupState.dmChannel.send({ embeds: [passwordEmbed] });

        } else if (setupState.step === 'awaiting_admin_password') {
            if (userInput.length < 4 || userInput.length > 20) {
                const invalidPassEmbed = new EmbedBuilder().setColor(0xE74C3C).setTitle('🔑 Senha Inválida').setDescription('Essa senha não vale! Precisa ter entre 4 e 20 caracteres.\nTenta outra, por favor.');
                await setupState.dmChannel.send({ embeds: [invalidPassEmbed] });
                return;
            }
            setupState.adminPassword = userInput;
            setupState.step = 'awaiting_hax_token';
            const tokenEmbed = new EmbedBuilder().setColor(0x2ECC71).setTitle('🔒 Senha de Admin Guardada!').addFields(
                { name: '🔗 Último passo: Token HaxBall', value: 'Show! Para finalizar, preciso do seu "token headless" do HaxBall.' },
                { name: '📜 Como Gerar o Token:', value: '1. Abra este link: https://www.haxball.com/headlesstoken\n2. Faça o reCAPTCHA (para provar que você não é um robô 🤖)\n3. Copie o código do token que aparecer (ele sempre começa com `thr1...`).' },
                { name: '👇 Cole o Token Aqui na DM:', value: 'Estou no aguardo!' }
            ).setFooter({ text: 'Hax Host Bot | Etapa Final 3/3', iconURL: client.user.displayAvatarURL() });
            await setupState.dmChannel.send({ embeds: [tokenEmbed] });

        } else if (setupState.step === 'awaiting_hax_token') {
            if (!userInput.startsWith("thr1.")) {
                const invalidTokenEmbed = new EmbedBuilder().setColor(0xE74C3C).setTitle('🔗 Token Inválido').setDescription('Opa, esse token não parece certo. Ele precisa começar com `thr1.`.\nConfira lá em https://www.haxball.com/headlesstoken e me manda de novo!');
                await setupState.dmChannel.send({ embeds: [invalidTokenEmbed] });
                return;
            }
            setupState.haxToken = userInput;
            if (setupState.timeout) clearTimeout(setupState.timeout);
            
            const processingEmbed = new EmbedBuilder().setColor(0xF1C40F).setTitle('⚙️ Preparando sua Sala...').setDescription(`Token recebido! Estou verificando os servidores e criando sua sala "**${setupState.roomName}**".\nIsso pode levar alguns segundinhos, aguarde por favor... ⏳`);
            await setupState.dmChannel.send({ embeds: [processingEmbed] });

            let targetEc2Ip = null;
            if (HAXBALL_EC2_SERVERS.length > 0) {
                let currentActiveRooms = await readActiveRooms();
                currentActiveRooms = await cleanupAndVerifyRooms(currentActiveRooms);
                let bestServerCandidate = null;
                let minRoomsOnCandidate = Infinity;
                for (const serverIp of HAXBALL_EC2_SERVERS) {
                    const roomsOnThisServer = currentActiveRooms.filter(room => room.serverIp === serverIp).length;
                    if (roomsOnThisServer < MAX_ROOMS_PER_EC2) {
                        if (roomsOnThisServer < minRoomsOnCandidate) {
                            minRoomsOnCandidate = roomsOnThisServer;
                            bestServerCandidate = serverIp;
                        }
                    }
                }
                if (bestServerCandidate) {
                    targetEc2Ip = bestServerCandidate;
                    console.log(`[BOT ${userId}] Servidor selecionado: ${targetEc2Ip} (${minRoomsOnCandidate}/${MAX_ROOMS_PER_EC2} salas)`);
                } else {
                    const noSlotEmbed = new EmbedBuilder().setColor(0xE74C3C).setTitle('❌ Todos os Servidores Ocupados').setDescription('Que pena! Parece que todos os nossos servidores HaxBall estão lotados no momento.\nPor favor, tente novamente mais tarde ou avise um admin.');
                    await setupState.dmChannel.send({ embeds: [noSlotEmbed] });
                    userRoomSetups.delete(userId);
                    return;
                }
            } else {
                 const noServersEmbed = new EmbedBuilder().setColor(0xE74C3C).setTitle('❌ Configuração Incompleta').setDescription('Não há servidores HaxBall configurados para criar salas. Por favor, contate um administrador do bot.');
                 await setupState.dmChannel.send({ embeds: [noServersEmbed] });
                 userRoomSetups.delete(userId);
                 return;
            }

            const command = `ssh -i ${PEM_KEY_PATH} -o StrictHostKeyChecking=no -o ConnectTimeout=15 ${HAXBALL_EC2_USER}@${targetEc2Ip} "bash ${REMOTE_SCRIPT_PATH} '${setupState.roomName}' '${setupState.adminPassword}' '${setupState.haxToken}'"`;
            
            console.log(`[BOT ${userId}] Executando SSH para ${targetEc2Ip}: ${command}`);
            try {
                const { stdout, stderr } = await execPromise(command, { timeout: 45000 });
                const responseLine = stdout.trim();
                console.log(`[BOT ${userId}] Resposta do script em ${targetEc2Ip}: ${responseLine}`);
                if (stderr && stderr.trim() !== "") console.error(`[BOT ${userId}] Stderr do script em ${targetEc2Ip}: ${stderr.trim()}`);

                if (responseLine.startsWith("SUCCESS")) {
                    const parts = responseLine.split(" ");
                    const linkPart = parts.find(p => p.startsWith("LINK:"));
                    const pidPart = parts.find(p => p.startsWith("PID:"));

                    if (linkPart && pidPart) {
                        const link = linkPart.substring("LINK:".length);
                        const pid = pidPart.substring("PID:".length);
                        
                        let activeRoomsList = await readActiveRooms();
                        activeRoomsList.push({
                            roomName: setupState.roomName,
                            serverIp: targetEc2Ip,
                            pid: pid,
                            link: link,
                            creatorId: userId, 
                            creatorTag: dmMessage.author.tag,
                            creationTimestamp: Date.now() 
                        });
                        await writeActiveRooms(activeRoomsList);
                        if (statsChannel) await updateServerStatsMessage(); 

                        console.log(`[BOT ${userId}] Sala "${setupState.roomName}" criada! Link: ${link}, PID: ${pid} no Servidor: ${targetEc2Ip}`);
                        const successEmbed = new EmbedBuilder().setColor(0x2ECC71).setTitle(`🎉 É GOOOL! Sua sala "${setupState.roomName}" está no ar! 🎉`).setDescription('Sua arena HaxBall foi criada e já está aberta para a galera!').addFields(
                            { name: '🔗 Link Direto para a Sala:', value: `[Clique aqui para entrar e jogar!](${link})` },
                            { name: '🔑 Sua Senha de Admin (para usar na sala):', value: `\`${setupState.adminPassword}\`` },
                            { name: '⏳ Tempo de Jogo:', value: 'A sala fica ativa por aproximadamente 2 horas.' }
                        ).setThumbnail('https://i.imgur.com/ksc5a9M.png').setFooter({ text: `Hax Host Bot | Bom jogo! (Servidor: ${targetEc2Ip}, PID: ${pid})`, iconURL: client.user.displayAvatarURL() }).setTimestamp();
                        await setupState.dmChannel.send({ embeds: [successEmbed] });
                    } else {
                        const parseErrorEmbed = new EmbedBuilder().setColor(0xE74C3C).setTitle('❌ Erro Inesperado').setDescription('Consegui criar a sala, mas tive um problema ao ler os detalhes. 🙁\nPor favor, avise um administrador do bot.');
                        await setupState.dmChannel.send({ embeds: [parseErrorEmbed] });
                        console.error(`[BOT ${userId}] Erro ao parsear SUCCESS de ${targetEc2Ip}: ${responseLine}`);
                    }
                } else if (responseLine.startsWith("ERROR:")) {
                    const errorMessage = responseLine.substring("ERROR:".length).replace(/_/g, " ");
                    const scriptErrorEmbed = new EmbedBuilder().setColor(0xE74C3C).setTitle('❌ Ops! Falha na Criação').setDescription(`Não deu para criar a sala no servidor ${targetEc2Ip}.\n**Motivo:** ${errorMessage}`);
                    await setupState.dmChannel.send({ embeds: [scriptErrorEmbed] });
                    console.error(`[BOT ${userId}] Erro do script remoto em ${targetEc2Ip}: ${errorMessage}`);
                } else {
                    const unknownResponseEmbed = new EmbedBuilder().setColor(0xE74C3C).setTitle('❌ Erro Desconhecido').setDescription(`Aconteceu algo estranho e não consegui criar sua sala no servidor ${targetEc2Ip}. O servidor não respondeu como eu esperava.`);
                    await setupState.dmChannel.send({ embeds: [unknownResponseEmbed] });
                    console.error(`[BOT ${userId}] Resposta desconhecida do script remoto em ${targetEc2Ip}: ${responseLine || "Nenhuma resposta"}`);
                }
            } catch (error) {
                console.error(`[BOT ${userId}] Erro GERAL ao executar SSH/script para ${targetEc2Ip}:`, error);
                let errorMsgForUser = `Xii, deu um erro daqueles bem chatos aqui no servidor (${targetEc2Ip}) ao tentar criar sua sala.`;
                if (error.message && error.message.toLowerCase().includes('timeout')) {
                     errorMsgForUser = `O servidor (${targetEc2Ip}) demorou uma eternidade para responder (timeout). Tente de novo daqui a pouco, por favor.`;
                }
                if(error.stdout) console.error(`[BOT ${userId}] stdout do erro SSH para ${targetEc2Ip}:`, error.stdout);
                if(error.stderr) console.error(`[BOT ${userId}] stderr do erro SSH para ${targetEc2Ip}:`, error.stderr);
                
                const criticalErrorEmbed = new EmbedBuilder().setColor(0x992D22).setTitle('🚨 Erro Crítico no Sistema 🚨').setDescription(errorMsgForUser);
                await setupState.dmChannel.send({ embeds: [criticalErrorEmbed] });
            } finally {
                userRoomSetups.delete(userId);
            }
        }
    } catch (dmError) {
        console.error(`[BOT ${userId}] Erro GRAVE ao interagir com usuário via DM:`, dmError);
        if (setupState && setupState.messageSource && setupState.messageSource.channel) {
            try {
                const dmFailedEmbed = new EmbedBuilder().setColor(0xFFB800).setTitle('⚠️ Problema na DM').setDescription(`${dmMessage.author.username}, não estou conseguindo falar com você por Mensagem Direta.\nVerifique suas configurações de privacidade no Discord ou tente o comando novamente no servidor.`);
                await setupState.messageSource.channel.send({ embeds: [dmFailedEmbed] });
            } catch (e) { console.error("Erro ao notificar canal original sobre falha na DM", e); }
        }
        userRoomSetups.delete(userId);
    }
}

client.login(BOT_TOKEN).catch(err => {
    console.error("❌ ERRO FATAL AO FAZER LOGIN NO DISCORD:", err);
    process.exit(1);
});

process.on('unhandledRejection', error => {
    console.error('🚫 Unhandled promise rejection:', error);
});
process.on('uncaughtException', error => {
    console.error('💥 Uncaught exception:', error);
});