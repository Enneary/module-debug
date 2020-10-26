import { BaseNode } from "./basenode";
import { TreeItem, TreeItemCollapsibleState } from "vscode";
import { DisassemblyInstruction } from "../../../common";
import * as path from 'path';
import * as vscode from 'vscode';
import { isString } from "util";

export class DisassemblyNode extends BaseNode {
	private fields: DisassemblyNode[] = [];
	private line: DisassemblyInstruction;

	constructor(inst: DisassemblyInstruction) {
		super(null);
		this.line = inst;
	}
	
	public getFullInfo(){
		return {
			children: this.fields.length,
			addr: this.line.address,
			func: this.line.functionName,
			prop: this.line.prop
		}
	}
	public getProp(): string | null{
		return this.line.prop ;
	}
	public setProp(_prop: string){
		 this.line.prop  = _prop;
	}
	public getLineNum(): number | null{
		return this.line.idx;
	}
	public getTreeItem(): TreeItem  {
        const state = this.fields && this.fields.length > 0 ?
            (this.expanded ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed)
            : TreeItemCollapsibleState.None;
        let  name = (this.line.idx != null ? ((this.line.idx + 1) + ": " ) : "" ) + this.line.address ; 
        const item = new DisassmActiveItem(name, state);
		item.description = this.line.instruction;
		item.contextValue = 'instruction';
        return item;
    }

    public getChildren(): DisassemblyNode[] {
        return this.fields;
	}

	public getCopyValue(): string {
        return this.line.instruction;
	}
	
	public getAddress(): string {
        return this.line.address;
    }
}

export class DisassmActiveItem extends TreeItem {
	constructor(
	  public readonly name: string,
	  public readonly collapsibleState: TreeItemCollapsibleState
	) {
	  super(name, collapsibleState);
	}
	private breakpoint: boolean = false;
  
	iconPath = {
	  light: (path.join(__filename, '..','..', '..', '..', 'images', 'debug.svg')), //this.breakpoint ? path.join(__filename, '..','..', '..', '..', 'resources', 'light', 'copy.svg') : path.join(__filename, '..','..', '..', '..', 'resources', 'light', 'edit.svg'),
	  dark: (path.join(__filename, '..', '..', 'resources', 'dark', 'copy.svg')) //this.breakpoint ? path.join(__filename, '..','..', '..', '..', 'resources', 'dark', 'copy.svg') : path.join(__filename, '..','..', '..', '..', 'resources', 'dark', 'edit.svg')
	};
  }