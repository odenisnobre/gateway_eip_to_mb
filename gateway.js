
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

/*****************************************************************************/
/*Todo este bloco é para verificação para geração do executável */
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