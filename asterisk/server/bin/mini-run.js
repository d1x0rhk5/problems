const fs = require('fs');
const { parse, compileToBytecode, runBytecode } = require('../core');

function getArg(name){
  const i = process.argv.indexOf(name);
  if (i >= 0 && i+1 < process.argv.length) return process.argv[i+1];
  return null;
}

(async () => {
  try {
    let code = '';
    const b64 = getArg('--b64code');
    const file = getArg('--codefile');
    if (b64) code = Buffer.from(b64, 'base64').toString('utf8');
    else if (file) code = fs.readFileSync(file, 'utf8');
    else {
      console.error('wrong');
      process.exit(2);
    }
    const input = fs.readFileSync(0, 'utf8');
    const ast = parse(code);
    const bc = compileToBytecode(ast);
    const out = runBytecode(bc, input);
    if (out) process.stdout.write(out + '\n');
    process.exit(0);
  } catch (e) {
    process.stderr.write(String(e.message || e) + '\n');
    process.exit(1);
  }
})();
