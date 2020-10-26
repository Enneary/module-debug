"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const basenode_1 = require("./basenode");
const vscode_1 = require("vscode");
const path = require("path");
class DisassemblyNode extends basenode_1.BaseNode {
    constructor(inst) {
        super(null);
        this.fields = [];
        this.line = inst;
    }
    getFullInfo() {
        return {
            children: this.fields.length,
            addr: this.line.address,
            func: this.line.functionName,
            prop: this.line.prop
        };
    }
    getProp() {
        return this.line.prop;
    }
    setProp(_prop) {
        this.line.prop = _prop;
    }
    getLineNum() {
        return this.line.idx;
    }
    getTreeItem() {
        const state = this.fields && this.fields.length > 0 ?
            (this.expanded ? vscode_1.TreeItemCollapsibleState.Expanded : vscode_1.TreeItemCollapsibleState.Collapsed)
            : vscode_1.TreeItemCollapsibleState.None;
        let name = (this.line.idx != null ? ((this.line.idx + 1) + ": ") : "") + this.line.address;
        const item = new DisassmActiveItem(name, state);
        item.description = this.line.instruction;
        item.contextValue = 'instruction';
        return item;
    }
    getChildren() {
        return this.fields;
    }
    getCopyValue() {
        return this.line.instruction;
    }
    getAddress() {
        return this.line.address;
    }
}
exports.DisassemblyNode = DisassemblyNode;
class DisassmActiveItem extends vscode_1.TreeItem {
    constructor(name, collapsibleState) {
        super(name, collapsibleState);
        this.name = name;
        this.collapsibleState = collapsibleState;
        this.breakpoint = false;
        this.iconPath = {
            light: (path.join(__filename, '..', '..', '..', '..', 'images', 'debug.svg')),
            dark: (path.join(__filename, '..', '..', 'resources', 'dark', 'copy.svg')) //this.breakpoint ? path.join(__filename, '..','..', '..', '..', 'resources', 'dark', 'copy.svg') : path.join(__filename, '..','..', '..', '..', 'resources', 'dark', 'edit.svg')
        };
    }
}
exports.DisassmActiveItem = DisassmActiveItem;
//# sourceMappingURL=disassemblynode.js.map