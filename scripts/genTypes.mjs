//@ts-check
import fs from 'fs'

const targetFile = './dist/types.d.ts';
const plugins = fs.readdirSync('./dist/lib/modules').filter(f => f !== 'index')
let types = ''
types = plugins.filter(module => module.endsWith('.d.ts')).map(module => `import "./lib/plugins/${module}"`).join('\n') + '\n' + types
fs.writeFileSync(targetFile, types, 'utf8')

let indexTs = fs.readFileSync('./dist/index.d.ts', 'utf8')
indexTs = `import './types';` + indexTs
fs.writeFileSync('./dist/index.d.ts', indexTs, 'utf8')
