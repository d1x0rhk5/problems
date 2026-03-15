const LIMIT = { maxLoopIters: 20000, maxOutputLines: 200000, maxInstrSteps: 5_000_000 };
const nl = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
function splitLines(src){ return nl(String(src)).split('\n'); }
function isBlank(s){ return /^\s*$/.test(s); }
function leadingSpaces(s){ const m=s.match(/^\s*/); return m? m[0].length:0; }

function parse(source){
  const lines = splitLines(source);
  function parseBlock(startIdx, baseIndent){
    const block = []; let i = startIdx;
    while (i < lines.length) {
      const raw = lines[i]; if (isBlank(raw)) { i++; continue; }
      const ind = leadingSpaces(raw); if (ind < baseIndent) break;
      const line = raw.slice(ind).trim();

      if (line.startsWith('input ')) {
        const parts = line.split(/\s+/);
        if (parts.length !== 2) throw new Error(`input rule: input <var> : "${line}"`);
        block.push({ kind:'input', var: parts[1] }); i++; continue;
      }
      if (line.startsWith('print ')) {
        block.push({ kind:'print', expr: line.slice('print '.length) }); i++; continue;
      }
      if (line.startsWith('for ')) {
        const m = line.match(/^for\s+([A-Za-z_]\w*)\s+in\s+(.+)\.\.(.+)$/);
        if (!m) throw new Error(`for rule: for i in A..B : "${line}"`);
        const varName = m[1].trim(), A = m[2].trim(), B = m[3].trim();
        const bodyStart = i + 1; let j = bodyStart;
        while (j < lines.length) {
          const ind2 = leadingSpaces(lines[j]);
          if (isBlank(lines[j])) { j++; continue; }
          if (ind2 <= ind) break;
          j++;
        }
        const body = parseBlock(bodyStart, ind + 1).block;
        block.push({ kind:'for', var: varName, start: A, end: B, body }); i = j; continue;
      }
      throw new Error(`Error: "${line}"`);
    }
    return { nextIdx:i, block };
  }
  return parseBlock(0,0).block;
}

function classifyExpr(expr){
  const t = expr.trim();
  const mul = t.match(/^(.*)\s*\*\s*(.*)$/);
  if (mul) return { kind:'mul', left: mul[1].trim(), right: mul[2].trim() };
  if (/^".*"$/.test(t)) return { kind:'str', value: t.slice(1,-1) };
  if (/^-?\d+$/.test(t)) return { kind:'num', value: parseInt(t,10) };
  if (/^[A-Za-z_]\w*$/.test(t)) return { kind:'var', name: t };
  return { kind:'str', value: t };
}

const OP = {
  INPUT:1, LOAD_STR:2, LOAD_NUM:3, LOAD_VAR:4, STORE_VAR:5,
  PRINT:6, REPEAT:7, CMP_LEQ:8, JUMP:9, JUMP_IF_FALSE:10, INC_VAR:11,
};

function compileToBytecode(ast){
  const code = [];
  const emit = (op,arg)=>code.push({op,arg});
  function emitExpr(node){
    if (node.kind==='str'){ emit(OP.LOAD_STR,node.value); return; }
    if (node.kind==='num'){ emit(OP.LOAD_NUM,node.value); return; }
    if (node.kind==='var'){ emit(OP.LOAD_VAR,node.name); return; }
    if (node.kind==='mul'){
      const L = classifyExpr(node.left), R = classifyExpr(node.right);
      emitExpr(L); emitExpr(R); emit(OP.REPEAT); return;
    }
    throw new Error(`Compilation failed: ${JSON.stringify(node)}`);
  }
  function compileBlock(block){
    for (const st of block){
      if (st.kind==='input'){ emit(OP.INPUT, st.var); continue; }
      if (st.kind==='print'){ emitExpr(classifyExpr(st.expr)); emit(OP.PRINT); continue; }
      if (st.kind==='for'){
        const endVar = `__end_${st.var}`;
        emitExpr(classifyExpr(st.start)); emit(OP.STORE_VAR, st.var);
        emitExpr(classifyExpr(st.end));   emit(OP.STORE_VAR, endVar);

        const loopCheck = code.length;
        emit(OP.LOAD_VAR, st.var);
        emit(OP.LOAD_VAR, endVar);
        emit(OP.CMP_LEQ);
        const jmpOutIdx = code.length; emit(OP.JUMP_IF_FALSE, -1);

        compileBlock(st.body);
        emit(OP.INC_VAR, st.var);
        emit(OP.JUMP, loopCheck);
        code[jmpOutIdx].arg = code.length;
        continue;
      }
      throw new Error(`Compilation failed: ${JSON.stringify(st)}`);
    }
  }
  compileBlock(ast);
  return { code };
}

function runBytecode(bytecode, inputs){
  const code = bytecode.code || [];
  const inputLines = splitLines(String(inputs ?? ''));
  let inputIdx = 0;
  const env = Object.create(null);
  const stack = [];
  const out = [];
  let ip = 0, steps = 0;
  const push = (v)=>stack.push(v);
  const pop = ()=>{ if(!stack.length) throw new Error('Stack underflow'); return stack.pop(); };

  while (ip < code.length){
    if (++steps > LIMIT.maxInstrSteps) throw new Error('VM execution limit exceeded');
    const {op,arg} = code[ip];
    switch (op){
      case OP.INPUT: env[arg] = (inputIdx < inputLines.length) ? inputLines[inputIdx++] : ''; ip++; break;
      case OP.LOAD_STR: push(String(arg)); ip++; break;
      case OP.LOAD_NUM: push(Number(arg)); ip++; break;
      case OP.LOAD_VAR:
        if (!(arg in env)) throw new Error(`Undefined variable: ${arg}`);
        push(env[arg]); ip++; break;
      case OP.STORE_VAR: env[arg] = pop(); ip++; break;
      case OP.PRINT:
        out.push(String(pop()));
        if (out.length > LIMIT.maxOutputLines) throw new Error('Output limit exceeded');
        ip++; break;
      case OP.REPEAT:{

        const b = pop();  
        const a = pop();  
        const isNum = (x) => typeof x === 'number' || (/^-?\d+$/.test(String(x)));
        let str, n;
        if (isNum(b) && !isNum(a)) { str = a; n = Number(b); }
        else if (isNum(a) && !isNum(b)) { str = b; n = Number(a); }
        else if (isNum(b)) { str = a; n = Number(b); }
        else {throw new Error(`Abnormal loop count: ${b}`); }
        if (!Number.isFinite(n) || n < 0 || n > LIMIT.maxLoopIters) throw new Error(`Abnormal loop count: ${n}`);
        push(String(str).repeat(n)); ip++; break; }
      case OP.CMP_LEQ:{ const b = pop(), a = pop(); push(Number(a) <= Number(b)); ip++; break; }
      case OP.JUMP: ip = arg; break;
      case OP.JUMP_IF_FALSE: ip = pop() ? ip+1 : arg; break;
      case OP.INC_VAR: env[arg] = Number(env[arg] ?? 0) + 1; ip++; break;
      default: throw new Error(`Unknown operation: ${op}`);
    }
  }
  return out.join('\n');
}

function expectedStarOutput(nStr){
  const N = parseInt(String(nStr),10);
  if (!Number.isFinite(N) || N <= 0) return '';
  return Array.from({length:N}, (_,i)=>'*'.repeat(i+1)).join('\n');
}

module.exports = { parse, compileToBytecode, runBytecode, expectedStarOutput, splitLines };
