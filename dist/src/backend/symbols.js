"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const childProcess = require("child_process");
const os = require("os");
const path = require("path");
const symbols_1 = require("../symbols");
const SYMBOL_REGEX = /^([0-9a-f]{8})\s([lg\ !])([w\ ])([C\ ])([W\ ])([I\ ])([dD\ ])([FfO\ ])\s([^\s]+)\s([0-9a-f]+)\s(.*)\r?$/;
const TYPE_MAP = {
    'F': symbols_1.SymbolType.Function,
    'f': symbols_1.SymbolType.File,
    'O': symbols_1.SymbolType.Object,
    ' ': symbols_1.SymbolType.Normal
};
const SCOPE_MAP = {
    'l': symbols_1.SymbolScope.Local,
    'g': symbols_1.SymbolScope.Global,
    ' ': symbols_1.SymbolScope.Neither,
    '!': symbols_1.SymbolScope.Both
};
class SymbolTable {
    constructor(toolchainPath, toolchainPrefix, executable) {
        this.toolchainPath = toolchainPath;
        this.toolchainPrefix = toolchainPrefix;
        this.executable = executable;
        this.symbols = [];
    }
    loadSymbols() {
        try {
            let objdumpExePath = os.platform() !== 'win32' ? `${this.toolchainPrefix}-objdump` : `${this.toolchainPrefix}-objdump.exe`;
            if (this.toolchainPath) {
                objdumpExePath = path.normalize(path.join(this.toolchainPath, objdumpExePath));
            }
            const objdump = childProcess.spawnSync(objdumpExePath, ['--syms', this.executable]);
            const output = objdump.stdout.toString();
            const lines = output.split('\n');
            let currentFile = null;
            for (const line of lines) {
                const match = line.match(SYMBOL_REGEX);
                if (match) {
                    if (match[7] === 'd' && match[8] === 'f') {
                        currentFile = match[11].trim();
                    }
                    const type = TYPE_MAP[match[8]];
                    const scope = SCOPE_MAP[match[2]];
                    let name = match[11].trim();
                    let hidden = false;
                    if (name.startsWith('.hidden')) {
                        name = name.substring(7).trim();
                        hidden = true;
                    }
                    this.symbols.push({
                        address: parseInt(match[1], 16),
                        type: type,
                        scope: scope,
                        section: match[9].trim(),
                        length: parseInt(match[10], 16),
                        name: name,
                        file: scope === symbols_1.SymbolScope.Local ? currentFile : null,
                        instructions: null,
                        hidden: hidden
                    });
                }
            }
        }
        catch (e) { }
    }
    getFunctionAtAddress(address) {
        const matches = this.symbols.filter((s) => s.type === symbols_1.SymbolType.Function && s.address <= address && (s.address + s.length) > address);
        if (!matches || matches.length === 0) {
            return undefined;
        }
        return matches[0];
    }
    getFunctionSymbols() {
        return this.symbols.filter((s) => s.type === symbols_1.SymbolType.Function);
    }
    getGlobalVariables() {
        const matches = this.symbols.filter((s) => s.type === symbols_1.SymbolType.Object && s.scope === symbols_1.SymbolScope.Global);
        return matches;
    }
    getStaticVariables(file) {
        return this.symbols.filter((s) => s.type === symbols_1.SymbolType.Object && s.scope === symbols_1.SymbolScope.Local && s.file === file);
    }
    getFunctionByName(name, file) {
        // Try to find static function first
        let matches = this.symbols.filter((s) => s.type === symbols_1.SymbolType.Function && s.scope === symbols_1.SymbolScope.Local && s.file === file);
        matches = matches.filter((m) => m.name.search(name) > 0);
        // let matches = this.symbols.filter((s) => s.type === SymbolType.Function && s.scope === SymbolScope.Local && s.name === name && s.file === file);
        if (matches.length !== 0) {
            return matches[0];
        }
        // Fall back to global scope
        matches = this.symbols.filter((s) => s.type === symbols_1.SymbolType.Function && s.scope !== symbols_1.SymbolScope.Local);
        matches = matches.filter((m) => m.name.search(`${name}`) >= 0);
        // matches.forEach((m) => m.name = m.name.split('_').join(''));
        return matches.length !== 0 ? matches[0] : null;
    }
}
exports.SymbolTable = SymbolTable;
//# sourceMappingURL=symbols.js.map