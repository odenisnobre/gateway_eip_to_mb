const ModbusRTU = require("modbus-serial");
const { carregaData, fmtErr } = require("./funcs");

class Modbus {
	constructor(config, holdingRegisters, coilsLeitura, coilsEscrita) {
		this.config = config;
		this.MB = config.mbServerConfig;
		this.holdingRegisters = holdingRegisters;
		this.coilsLeitura = coilsLeitura;
		this.coilsEscrita = coilsEscrita;
	}

	start() {
		const vector = {
			getHoldingRegister: (addr) => {
				const idx = addr - this.MB.enderecoInicialHR;
				if (idx >= 0 && idx < this.holdingRegisters.length) {
					return Promise.resolve(this.holdingRegisters[idx]);
				}
				return Promise.reject(new Error("Endereço HR inválido"));
			},
			setRegister: (addr, value) => {
				const idx = addr - this.MB.enderecoInicialHR;
				if (idx >= 0 && idx < this.holdingRegisters.length) {
					this.holdingRegisters[idx] = value & 0xFFFF;
					return Promise.resolve();
				}
				return Promise.reject(new Error("Endereço HR inválido p/ escrita"));
			},
			getCoil: (addr) => {
				const idxL = addr - this.MB.enderecoInicialCoilsLeitura;
				if (idxL >= 0 && idxL < this.coilsLeitura.length) {
					return Promise.resolve(!!this.coilsLeitura[idxL]);
				}
				const idxW = addr - this.MB.enderecoInicialCoilsEscrita;
				if (idxW >= 0 && idxW < this.coilsEscrita.length) {
					return Promise.resolve(!!this.coilsEscrita[idxW]);
				}
				return Promise.reject(new Error("Endereço coil inválido"));
			},
			setCoil: (addr, value) => {
				const idx = addr - this.MB.enderecoInicialCoilsEscrita;
				if (idx >= 0 && idx < this.coilsEscrita.length) {
					this.coilsEscrita[idx] = !!value;
					return Promise.resolve();
				}
				return Promise.reject(new Error("Endereço coil inválido p/ escrita"));
			},
		};

		const serverTCP = new ModbusRTU.ServerTCP(vector, {
			host: this.MB.ip,
			port: this.MB.porta,
			unitID: this.MB.id,
			debug: false,
		});

		serverTCP.on("socketError", (err) => {
			console.error(`${carregaData()} - Erro de socket: ${fmtErr(err)}`);
		});

		console.log(`${carregaData()} - Servidor Modbus TCP escutando na porta ${this.MB.porta}`);
	}
}

module.exports = Modbus;
