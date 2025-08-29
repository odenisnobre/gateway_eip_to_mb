
/*
Vale Base Metals
Denis Nobre - Salobo
08/2025
*/

/* Carrega modulos */
const ModbusRTU = require("modbus-serial");
const { Controller, Tag, TagGroup, EthernetIP  } = require("ethernet-ip");
const { DINT, BOOL } = EthernetIP.CIP.DataTypes.Types;
const { simuladorHR, delay, carregaData, fmtErr, } = require('./utils/funcs');
const { firstExisting } = require('./utils/utils');
const Modbus = require('./utils/Modbus');
const fs = require('fs');
const path = require('path');

/****** Bloco inicio carregamento arquivo de configuracao *****/
const isPkg = !!process.pkg;
const exeDir = isPkg ? path.dirname(process.execPath) : __dirname;

const candidates = [
	process.env.MYAPP_CONFIG,                              
	path.join(exeDir, 'configuration.json'),              
	process.platform === 'win32'
		? path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'MinhaApp', 'configuration.json')
		: (process.platform === 'darwin'
			? '/Library/Application Support/MinhaApp/configuration.json'
			: '/etc/minhaapp/configuration.json'),
];

const externalConfigPath = firstExisting(candidates);
let config = {};

try {
	const defaultPath = path.join(__dirname, 'utils', 'config-default.json');
	const defaultCfg = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
	if (externalConfigPath) {
		config = JSON.parse(fs.readFileSync(externalConfigPath, 'utf8'));
	} else {
		config = defaultCfg;
	}
} catch (e) {
	console.error(`${carregaData()} - Falha ao carregar configuração: ${e.message}`);
}

console.log('Config usada: ', externalConfigPath || '(default embutido)');
/*****************************************************************************/

/****** Bloco inicio configuracao servidor modbus *****/
//Define objeto de configuracao modbus
const MB = config.mbServerConfig;

//Define quantidade de variaveis dos registros modbus 
const holdingRegisters = new Array(MB.qntHoldingRegisters).fill(0);
const coilsLeitura = new Array(MB.qntCoilsLeitura).fill(false);
const coilsEscrita = new Array(MB.qntCoilsEscrita).fill(false);

/** Inicializa servidor Modbus */
const modbus = new Modbus(config, holdingRegisters, coilsLeitura, coilsEscrita);
modbus.start();

/*****************************************************************************/
/****** Bloco inicio configuracao do PLC *****/
// Inicia variaveis por tipo
var grupoHR = new TagGroup();
var grupoCoilLeitura = new TagGroup();
var grupoCoilEscrita = new TagGroup();
var grupoEscrita = []

// Controle de conexao com o PLC
let conectado = false;
let conectando = false;
let variaveisCarregadas = false;
let ultimoErroConexao = 0;
const tempoMinimoEntreErros = config.appConfig.tempoEntreErros;
let verificaTag = false

// Define variavel com todas a variaveis configuradas
const variaveisPLC = config.plcConfig.variaveis;

// Define novo objeto PLC Control
const PLC = new Controller();

// Verifica e adiciona tags válidas
async function validaTagGrupo(tagName, group) {
    const tag = new Tag(tagName);
    try {
        await PLC.readTag(tag);
        group.add(tag);
        console.log(`[OK] Tag válida adicionada: ${tagName}`);
    } catch (err) {
        console.warn(`[SKIP] Tag inválida: ${tagName} → ${fmtErr(err)}`);
    }	
}

// Verifica e adiciona tags válidas
async function validaTag(tagName) {
	verificaTag = false
    const tag = new Tag(tagName);
    try {
        await PLC.readTag(tag);  
		verificaTag = true				
    } catch (err){
		verificaTag = false
    }	
}

// Carrega todas as variáveis e separa por tipo
async function carregaVariaveis() {
    grupoHR = new TagGroup();
    grupoCoilLeitura = new TagGroup();
	grupoCoilEscrita = new TagGroup();
	console.log(`${carregaData()} - Lendo variáveis!`)
    for (const element of variaveisPLC) {
        if (element.tipo === 'coil' && element.funcao == 'leitura') {
            await validaTagGrupo(element.nome, grupoCoilLeitura);
        } else if (element.tipo == 'coil' && element.funcao == 'escrita'){
			await validaTagGrupo(element.nome, grupoCoilEscrita);
			grupoEscrita.push(element.nome)
		} else {
            await validaTagGrupo(element.nome, grupoHR);
        }
    }
    variaveisCarregadas = true;
	console.log(`${carregaData()} - variaveis carregadas!`)
}

// Monitora conexao PLC
async function conectarPLC() {
    if (conectando || conectado) return;
    conectando = true;
    try {
        const agora = Date.now();
        if (agora - ultimoErroConexao > tempoMinimoEntreErros) {
            console.log(`${carregaData()} - Tentando conectar ao PLC!`);
            ultimoErroConexao = agora;
        }
        await PLC.connect(config.plcConfig.ip, config.plcConfig.slot, { timeout: config.appConfig.tempoEsperaPLC });
        conectado = true;
		coilsLeitura[MB.bitFalha] = true
        variaveisCarregadas = false;
        console.log(`${carregaData()} - Conectado ao PLC`);
        if (!variaveisCarregadas) {
            await carregaVariaveis();
        }
    } catch (err) {
        if (Date.now() - ultimoErroConexao > tempoMinimoEntreErros) {
            console.warn(`${carregaData()} - Erro ao conectar: ${fmtErr(err)}`);
            ultimoErroConexao = Date.now();        }
        conectado = false;
		coilsLeitura[MB.bitFalha] = false
        // Aguarda 5 segundos antes de liberar nova tentativa
		console.log(`${carregaData()} - Aguardando Reconexão!`)
        await delay(config.appConfig.tempoReconecta);
    }
    conectando = false;
}

// Inicia processo para verificação de comunicação com o PLC
process.on("uncaughtException", (err) => {
	const msg = fmtErr(err);
    if (err.message.includes("Socket Transmission Failure Occurred")) {
		console.warn(`${carregaData()} - Conexão perdida com o PLC. Tentando reconectar!`);
        conectado = false;
		coilsLeitura[MB.bitFalha] = false
    } else {
        console.error(`${carregaData()} - Erro fatal: ${msg}`);
    }
});

// Inicia processo para verificação de comunicação com o PLC
process.on("unhandledRejection", (reason) => {
    console.error(`${carregaData()} - Promessa rejeitada sem tratamento: ${fmtErr(reason)}`);
    conectado = false;
	coilsLeitura[MB.bitFalha] = false
});

// Monitora comunicação com o PLC
PLC.on("error", (err) => {
   console.warn(`${carregaData()} - Falha de comunicação: ${fmtErr(err)}`);
    conectado = false;
	coilsLeitura[MB.bitFalha] = false
});

/*****************************************************************************/

/****** Bloco ciclo de leitura *****/
// Efetua leitura das tags do PLC
async function lerTags() {
    if (!conectado && !conectando) {
        await conectarPLC();
        return;
    }	
	if (!conectado) return;
	
	// Simulado habilitado gera numeros aleatorios na quantidade de registros
	//definidos para HR, se nao estiver habilitado carrega valor do PLC
	if(MB.simulador){
		const s = await simuladorHR(holdingRegisters)
	} else {
		try {
			if (Object.keys(grupoHR.state.tags).length) await PLC.readTagGroup(grupoHR);
			if (Object.keys(grupoCoilLeitura.state.tags).length) await PLC.readTagGroup(grupoCoilLeitura);
			if (Object.keys(grupoCoilEscrita.state.tags).length) await PLC.readTagGroup(grupoCoilEscrita);
			let iHR = 0;
			let iCoilLeitura = 1;
			let iCoilEscrita = 0;
			
			// Atualiza HR
			grupoHR.forEach(tag => {
				if (typeof tag.value !== 'number') return;
				const buf = Buffer.alloc(4);
				buf.writeFloatBE(tag.value);
				holdingRegisters[iHR * 2] = buf.readUInt16BE(0);
				holdingRegisters[iHR * 2 + 1] = buf.readUInt16BE(2);
				iHR++;
			});
			
			// Atualiza coils de leitura
			grupoCoilLeitura.forEach(tag => {
				coilsLeitura[iCoilLeitura] = !!tag.value;
				iCoilLeitura++;
			});
			
			// Atualiza coils de escrita
			for (var i in grupoEscrita){
				const tagName = grupoEscrita[i];
				await validaTag(tagName);
				if(verificaTag){
					const aTag = new Tag(tagName, null, BOOL);
					const oValor = coilsEscrita[i];
					await PLC.writeTag(aTag, oValor);
				}
			}
		} catch (err) {
			console.warn(`${carregaData()} - Erro ao ler grupo de tags: ${fmtErr(err)}`);
			conectado = false;
			coilsLeitura[MB.bitFalha] = false
			variaveisCarregadas = false;
		}		
	}
	
}
/*****************************************************************************/

/****** Bloco ciclo *****/
// Configura tempo de atualização

setInterval(lerTags, config.appConfig.tempoAtualizacao);

/*****************************************************************************/