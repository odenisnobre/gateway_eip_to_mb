
/*
Vale Base Metals
Denis Nobre - Salobo
08/2025
*/

// Define variavel para controle de mensagens
const mensagensJaLogadas = new Set();

function logOnce(mensagensJaLogadas = mensagensJaLogadas, msg, tipo) {
	if (!mensagensJaLogadas.has(msg)) {
		if(tipo == 'erro') {
			console.warn(msg);
		} else {
			console.log(msg)
		}
		mensagensJaLogadas.add(msg);
	}
}

// Conecta ao PLC
async function conectarPLC(PLC, config, coilsLeitura, MB) {
    try {
        await PLC.connect(config.plcConfig.ip, config.plcConfig.slot);
		logOnce(mensagensJaLogadas, "Conectado ao PLC");
        console.log("Conectado ao PLC");
        coilsLeitura[MB.bitFalha] = 0;
        return true;
    } catch (err) {
        logOnce(mensagensJaLogadas, `Erro ao conectar: ${err.message}`, "erro");
        coilsLeitura[MB.bitFalha] = 1;
        return false;
    }
}

// Efetua leitura das variaveis do tipo HR
async function leituraHR(PLC, tags, leitura, conectado){	
	if(tags.length > 1){
		for (let i = 0; i < tags.length; i++) {
			const nome = tags[i];
			const tag = new Tag(nome);
			try {
				await PLC.readTag(tag);
				const valor = tag.value;
				const buf = Buffer.alloc(4);
				buf.writeFloatBE(valor);
				leitura[i * 2]     = buf.readUInt16BE(0);
				leitura[i * 2 + 1] = buf.readUInt16BE(2);
				console.log(`${nome}: ${valor}`);
			} catch (err) {
				console.warn(`Erro ao ler ${nome}:`, err.message);
				conectado = false;
				break;
			}		
		}
	}
}

// Efetua leitura das variaveis do tipo bool
async function leituraHR(PLC, tags, leitura, conectado){
	if(tags.length > 0) {
		for (let k = 1; k < tags.length+1; k++) {
			const nome = tags[k];
			const tag = new Tag(nome);
			try {
				await PLC.readTag(tag);
				const valor = !!tag.value;
				leitura[k] = valor;
				console.log(`${nome}: ${valor}`);
			} catch (err) {
				// adicionar aqui uma mensagem de log
				console.warn(`Erro ao ler ${nome}:`, err.message);
				conectado = false;
				break;
			}	
		}
	}
}

// Simula valores holdingregisters
async function simuladorHR(leitura){
	for (let i = 0; i < leitura.length / 2; i++) {
		const valor = Math.random()*100
		const buf = Buffer.alloc(4);
		buf.writeFloatBE(valor);
		leitura[i * 2]     = buf.readUInt16BE(0);
		leitura[i * 2 + 1] = buf.readUInt16BE(2);
	}
	return true
}

module.exports = { conectarPLC, simuladorHR };
