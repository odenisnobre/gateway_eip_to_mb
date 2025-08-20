
/*
Vale Base Metals
Denis Nobre - Salobo
08/2025
*/

/* Carrega modulos */
const ModbusRTU = require("modbus-serial");
const { Controller, Tag } = require("ethernet-ip");
const { conectarPLC, simuladorHR } = require('./utils/funcs');
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
	console.error('Falha ao carregar configuração:', e.message);
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
    console.error("Erro de socket:", err);
});

// mostra mensagem de log
console.log(`${config.appConfig.boasVindas} ${MB.porta}...`);

/*****************************************************************************/


/****** Bloco inicio configuracao do PLC *****/

// Define novo objeto PLC Control
const PLC = new Controller();

// Inicia variaveis por tipo
var tagsHoldingRegisters = [];
var tagsCoilsLeitura = [];
var tagsCoilsEscrita = [];

// Define variavel com todas a variaveis configuradas
const variaveisPLC = config.plcConfig.variaveis;

// Array com as tags de leitura do PLC */
variaveisPLC.forEach(function(element) {	
	if(element.tipo == 'coil' && element.funcao == 'leitura'){
		tagsCoilsLeitura.push(element.nome);
	} else if(element.tipo == 'coil' && element.funcao == 'escrita'){
		tagsCoilsEscrita.push(element.nome);  
	} else {
		tagsHoldingRegisters.push(element.nome);
	}
})

// Inicia variável de status de conexão com o PLC
let conectado = false;

// Inicia processo para verificação de comunicação com o PLC
process.on("uncaughtException", (err) => {
    if (err.message.includes("Socket Transmission Failure Occurred")) {
		console.warn("Conexão perdida com o PLC. Tentando reconectar...");
        conectado = false;
    } else {
        console.error("Erro fatal:", err);
    }
});

// Monitora comunicação com o PLC
PLC.on("error", (err) => {
   console.warn("Falha de comunicação:", err.code || err.message);
    conectado = false;
});

/*****************************************************************************/

/****** Bloco ciclo de leitura *****/

// Efetua leitura das tags do PLC
async function lerTags() {
    if (!conectado && !MB.simulador) {
        conectado = await conectarPLC(PLC, config, coilsLeitura, MB);
        return;
    }
	
	if(MB.simulador){
		const s = await simuladorHR(holdingRegisters)
	}

	
	
	
	if(tagsHoldingRegisters.length > 1){
		for (let i = 0; i < tagsHoldingRegisters.length; i++) {
			const nome = tagsHoldingRegisters[i];
			const tag = new Tag(nome);
			try {
				await PLC.readTag(tag);
				const valor = tag.value;
				const buf = Buffer.alloc(4);
				buf.writeFloatBE(valor);
				holdingRegisters[i * 2]     = buf.readUInt16BE(0);
				holdingRegisters[i * 2 + 1] = buf.readUInt16BE(2);
				//console.log(`${nome}: ${valor}`);
			} catch (err) {
				console.warn(`Erro ao ler ${nome}:`, err.message);
				if(typeof(err.message) !== 'undefined'){
					conectado = false;
					break;
				}
			}		
		}
	}
	if(tagsCoilsLeitura.length > 0) {
		for (let k = 1; k < tagsCoilsLeitura.length+1; k++) {
			const nome = tagsCoilsLeitura[k-1];
			console.log(nome)
			const tag = new Tag(nome);			
			try {
				await PLC.readTag(tag);
				const valor = tag.value;
				coilsLeitura[k] = valor;
				console.log(`${nome}: ${valor}`);
			} catch (err) {
				// adicionar aqui uma mensagem de log
				console.warn(`Erro ao ler ${nome}:`, err.message);
				if(typeof(err.message) !== 'undefined'){
					conectado = false;
					break;
				}
			}	
		}
	}
	
}
/*****************************************************************************/

/****** Bloco ciclo *****/

// Configura tempo de atualização
setInterval(lerTags, config.appConfig.tempoAtualizacao);

/*****************************************************************************/