
const fs = require('fs');
const path = require('path');

function firstExisting(arr) {
	for (const p of arr) {
		try { if (p && fs.existsSync(p)) return p; } catch (_) {}
	}
	return null;
}



module.exports = { firstExisting }