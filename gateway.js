
/*
Vale Base Metals
Denis Nobre - Salobo
08/2025
*/

/* Carrega modulos */
const ModbusRTU = require("modbus-serial");
const { Controller, Tag, TagGroup, EthernetIP  } = require("ethernet-ip");
const { DINT, BOOL } = EthernetIP.CIP.DataTypes.Types;
const { simuladorHR, delay, carregaData, fmtErr } = require('./utils/funcs');
const fs = require('fs');
const path = require('path');

/****** Bloco inicio carregamento arquivo de configuracao *****/
const isPkg = !!process.pkg;
const exeDir = isPkg ? path.dirname(process.execPath) : __dirname;

function firstExisting(arr) {
	for (const p of arr) {
		try { if (p && fs.existsSync(p)) return p; } catch (_) {}
	}
	return null;
}

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

console.log('Config usada:', externalConfigPath || '(default embutido)');
/*****************************************************************************/

/****** Bloco inicio configuracao servidor modbus *****/
//Define objeto de configuracao modbus
const MB = config.mbServerConfig;

//Define quantidade de variaveis dos registros modbus 
const holdingRegisters = new Array(MB.qntHoldingRegisters).fill(0);
const coilsLeitura = new Array(MB.qntCoilsLeitura).fill(false);
const coilsEscrita = new Array(MB.qntCoilsEscrita).fill(false);

// Configuração de registros do servidor modbus
const vector = {	
	// 4xxxx – Holding Registers  
	getHoldingRegister: (addr /*, unitID */) => {
		const addrReal = addr - MB.enderecoInicialHR;
		if (Number.isInteger(addrReal) && addrReal >= 0 && addrReal < holdingRegisters.length) {
			return Promise.resolve(holdingRegisters[addrReal]);
		}
		return Promise.reject(new Error("Endereço de holding inválido"));
	},
	// (opcional) escrita de HR – FC06/FC16
	setRegister: (addr, value /*, unitID */) => {
		const addrReal = addr - MB.enderecoInicialHR;
		if (Number.isInteger(addrReal) && addrReal >= 0 && addrReal < holdingRegisters.length) {
		holdingRegisters[addrReal] = value & 0xFFFF;
		return Promise.resolve();
		}
		return Promise.reject(new Error("Endereço de holding inválido p/ escrita"));
	},
	// 0xxxx – Coils (LEITURA) → checa as duas faixas (100.. e 500..)
	getCoil: (addr /*, unitID */) => {
		// 1) Faixa de leitura
		let idxR = addr - MB.enderecoInicialCoilsLeitura; // 100
		if (Number.isInteger(idxR) && idxR >= 0 && idxR < coilsLeitura.length) {
			return Promise.resolve(!!coilsLeitura[idxR]);
		}
		// 2) Faixa de escrita
		let idxW = addr - MB.enderecoInicialCoilsEscrita; // 500
		if (Number.isInteger(idxW) && idxW >= 0 && idxW < coilsEscrita.length) {
			return Promise.resolve(!!coilsEscrita[idxW]);
		}
		return Promise.reject(new Error("Endereço de coil inválido"));
	},
	// 0xxxx – Coils (ESCRITA) → somente faixa 500..
	setCoil: (addr, value /*, unitID */) => {
		const idxW = addr - MB.enderecoInicialCoilsEscrita; // 500
		if (Number.isInteger(idxW) && idxW >= 0 && idxW < coilsEscrita.length) {
			const bit = !!value;
			coilsEscrita[idxW] = bit;
			return Promise.resolve();
		}
		return Promise.reject(new Error("Endereço de coil inválido p/ escrita"));
	},
};

// Cria instancia do servidor modbus TCP
const serverTCP = new ModbusRTU.ServerTCP(vector, {
    host: MB.ip,
    port: MB.porta,
    unitID: MB.id,
    debug: false,
});

// Monitora comunicação do servidor Modbus */
serverTCP.on("socketError", (err) => {
    console.error(`${carregaData()} - Erro de socket: ${fmtErr(err)}`);
});

// mostra mensagem de log
console.log(`${carregaData()} - ${config.appConfig.boasVindas} ${MB.porta}`);
/*****************************************************************************/

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
    } else {
        console.error(`${carregaData()} - Erro fatal: ${msg}`);
    }
});

// Inicia processo para verificação de comunicação com o PLC
process.on("unhandledRejection", (reason) => {
    console.error(`${carregaData()} - Promessa rejeitada sem tratamento: ${fmtErr(reason)}`);
    conectado = false;
});

// Monitora comunicação com o PLC
PLC.on("error", (err) => {
   console.warn(`${carregaData()} - Falha de comunicação: ${fmtErr(err)}`);
    conectado = false;
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
			variaveisCarregadas = false;
		}
		
		
		
	}
	
}
/*****************************************************************************/

/****** Bloco ciclo *****/
// Configura tempo de atualização

setInterval(lerTags, config.appConfig.tempoAtualizacao);

/*****************************************************************************/