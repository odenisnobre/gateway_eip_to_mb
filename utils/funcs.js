
/*
Vale Base Metals
Denis Nobre - Salobo
08/2025
*/

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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function carregaData(){
	return new Date().toISOString()
}

function fmtErr(e) {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message || 'Error sem message';
  if (e && (e.code || e.errno || e.syscall))
    return [e.code, e.errno, e.syscall].filter(Boolean).join(' ');
  try { return JSON.stringify(e); } catch { return String(e); }
}

module.exports = { simuladorHR, delay, carregaData, fmtErr };
