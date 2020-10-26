"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
const disassemblynode_1 = require("./nodes/disassemblynode");
const path = require("path");
const vscode = require("vscode");
class DisassemblyTreeProvider {
    constructor(context) {
        this.context = context;
        this._onDidChangeTreeData = new vscode_1.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.canLoad = false;
        this.fileName = "";
        this.list = [];
        this.listMap = {};
    }
    loadInstructions(data) {
        this.list = [];
        this.listMap = {};
        data.forEach((inst, idx) => {
            if (inst) {
                const rn = new disassemblynode_1.DisassemblyNode(inst);
                this.list.push(rn);
                this.listMap[idx] = rn;
            }
        });
    }
    updateItemTypes() {
        if (this.canLoad) {
            this.list.filter(el => el.getProp() === "breakpoint").forEach(e => e.setProp("none"));
            vscode.debug.breakpoints.filter(bp => {
                if (bp instanceof vscode.SourceBreakpoint) {
                    const url = bp.location.uri.toString();
                    let sourcepath = this.fileName;
                    return path.relative(sourcepath, url) === "";
                }
            }).forEach(bkp => {
                if (bkp instanceof vscode.SourceBreakpoint) {
                    const line = bkp.location.range.start.line;
                    let el = this.list.filter(el => el.getLineNum() === line && el.getProp() != "active");
                    el.forEach(e => e.setProp("breakpoint"));
                }
            });
            this._onDidChangeTreeData.fire();
        }
    }
    refresh() {
        if (this.canLoad) {
            vscode_1.debug.activeDebugSession.customRequest('load-current-disassembly').then((data) => {
                this.fileName = data.url;
                this.loadInstructions(data.instructions);
                this._onDidChangeTreeData.fire();
            });
        }
    }
    getTreeItem(element) {
        let type = element.getProp();
        let e = element.getTreeItem();
        let command = "";
        switch (type) {
            case "none":
                e.iconPath = {
                    light: "",
                    dark: ""
                };
                command = 'module-debug.viewDisassembly.addBreakpoint';
                break;
            case "active":
                e.iconPath = {
                    light: this.context.asAbsolutePath(path.join('images', 'arrow.svg')),
                    dark: this.context.asAbsolutePath(path.join('images', 'arrow.svg'))
                };
                break;
            case "breakpoint":
                e.iconPath = {
                    light: this.context.asAbsolutePath(path.join('images', 'red-point.svg')),
                    dark: this.context.asAbsolutePath(path.join('images', 'red-point.svg'))
                };
                command = 'module-debug.viewDisassembly.removeBreakpoint';
                break;
        }
        e.command = {
            command: command,
            title: '',
            arguments: [{
                    file: this.fileName,
                    raw: element.getAddress(),
                    line: element.getLineNum()
                }]
        };
        return e;
    }
    getChildren(element) {
        if (this.canLoad && this.list.length > 0) {
            return element ? element.getChildren() : this.list;
        }
        else if (!vscode_1.debug.activeDebugSession) {
            return [];
        }
        else {
            return [];
        }
    }
    getActiveNode() {
        return this.list[0];
    }
    // Начало сессии отладки
    debugSessionStarted() {
        this.canLoad = false;
        this._onDidChangeTreeData.fire();
    }
    // Завершение сессии отладки
    debugSessionTerminated() {
        this.canLoad = false;
        this._onDidChangeTreeData.fire();
    }
    //Остановка во время выполнения сессии
    debugStopped() {
        this.refresh();
    }
    debugContinued() {
    }
}
exports.DisassemblyTreeProvider = DisassemblyTreeProvider;
//# sourceMappingURL=disassembly.js.map