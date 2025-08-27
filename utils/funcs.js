
/*
Vale Base Metals
Denis Nobre - Salobo
08/2025
*/

// === Funções de Log (anti-spam) ===

// guarda estado atual (para logs de transição)
let estadoAtual = 'INIT';
// buckets para deduplicação de mensagens
const repeatBuckets = new Map();
// flag para controlar "Aguardando Reconexão!"
let waitingOncePrinted = false;
// janela de resumo (10 minutos)
const LOG_WINDOW_MS = 10 * 60 * 1000;

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

function fmtErr(e, opts = {}) {
  const { includeStack = false, maxLen = 300 } = opts;

  // util: string seguro e truncado
  function truncate(s, n) {
    const str = String(s);
    return str.length > n ? str.slice(0, n - 3) + '...' : str;
  }
  // util: JSON.stringify à prova de ciclos
  function safeStringify(obj) {
    const seen = new WeakSet();
    try {
      return JSON.stringify(
        obj,
        (k, v) => {
          if (typeof v === 'object' && v !== null) {
            if (seen.has(v)) return '[Circular]';
            seen.add(v);
          }
          return v;
        }
      );
    } catch {
      return String(obj);
    }
  }

  // 0) casos vazios
  if (e === undefined) return 'undefined';
  if (e === null)      return 'null';

  // 1) string direta
  if (typeof e === 'string') return truncate(e, maxLen);

  // 2) Error real
  if (e instanceof Error) {
    const extra = [];
    const any = /** @type {any} */ (e);
    if (any.code)    extra.push(any.code);
    if (any.errno)   extra.push(any.errno);
    if (any.syscall) extra.push(any.syscall);
    if (any.address) extra.push(any.address);
    if (any.port)    extra.push(any.port);

    let msg = e.message || e.name || 'Error';
    if (extra.length) msg += ' | ' + extra.join(' ');
    if (includeStack && e.stack) msg += '\n' + e.stack;
    return truncate(msg, maxLen);
  }

  // 3) Objeto "parecido com erro" (ex.: {code, errno, message, ...})
  if (typeof e === 'object') {
    const base = e.message ? String(e.message) : '';
    const kv   = [];
    for (const k of ['code','errno','syscall','address','port']) {
      if (e[k] !== undefined && e[k] !== null) kv.push(`${k}=${e[k]}`);
    }
    let msg = base || safeStringify(e);
    if (kv.length) msg += (base ? ' | ' : '') + kv.join(' ');
    return truncate(msg, maxLen);
  }

  // 4) Número/boolean/outros
  return truncate(String(e), maxLen);
}


function logStateChange(novoEstado, detalhe = '', logger = console, carregaDataFn) {
  if (novoEstado !== estadoAtual) {
    const from = estadoAtual || 'INIT';
    const msg = `${carregaDataFn()} - STATE: ${from} -> ${novoEstado}${detalhe ? ' | ' + detalhe : ''}`;
    (logger.info || logger.log)(msg);
    estadoAtual = novoEstado;

    if (novoEstado === 'CONNECTED') {
      flushRepeatSummaries(logger, carregaDataFn);
      waitingOncePrinted = false; // reseta o aviso de reconexão
    }
  }
}

function logRepeat(key, line, level = 'warn', logger = console, carregaDataFn) {
  const now = Date.now();
  const b = repeatBuckets.get(key) || { count: 0, first: now, last: now, sample: line, level };
  b.count++;
  b.last = now;
  b.sample = line;
  b.level = level;
  repeatBuckets.set(key, b);

  // imprime resumo se já passou a janela
  if (now - b.first >= LOG_WINDOW_MS) {
    const msg = `${carregaDataFn()} - RESUMO "${key}": ocorreu ${b.count}x em ${Math.round((b.last - b.first) / 60000)} min | último: ${line}`;
    (logger[level] || logger.log)(msg);
    repeatBuckets.delete(key);
  }
}

function flushRepeatSummaries(logger = console, carregaDataFn) {
  for (const [key, b] of repeatBuckets) {
    const msg = `${carregaDataFn()} - RESUMO "${key}": ocorreu ${b.count}x em ${Math.round((b.last - b.first) / 60000)} min | último: ${b.sample}`;
    (logger[b.level] || logger.log)(msg);
  }
  repeatBuckets.clear();
}

// imprime "Aguardando Reconexão!" apenas uma vez por ciclo
function logWaitingReconnect(logger = console, carregaDataFn) {
  if (!waitingOncePrinted) {
    logger.log(`${carregaDataFn()} - Aguardando Reconexão!`);
    waitingOncePrinted = true;
  }
}




module.exports = { 
	simuladorHR, 
	delay, 
	carregaData, 
	fmtErr,
	logStateChange,
	logRepeat,
	flushRepeatSummaries,
	logWaitingReconnect
};
