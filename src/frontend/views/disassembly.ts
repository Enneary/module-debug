import { TreeDataProvider, TreeItem, debug, ProviderResult, EventEmitter, Event, workspace, ExtensionContext, TreeView } from "vscode";
import { BaseNode } from "./nodes/basenode";
import { MessageNode } from "./nodes/messagenode";
import { DisassemblyInstruction } from "../../common";
import { DisassemblyNode, DisassmActiveItem } from "./nodes/disassemblynode";
import * as path from 'path';
import * as vscode from 'vscode';


export class DisassemblyTreeProvider implements TreeDataProvider<DisassemblyNode> {
	
    public _onDidChangeTreeData: EventEmitter<DisassemblyNode | undefined> = new EventEmitter<DisassemblyNode | undefined>();
	public readonly onDidChangeTreeData: Event<DisassemblyNode | undefined> = this._onDidChangeTreeData.event;
	public canLoad: boolean = false;
	private fileName: string = "";
	private list: DisassemblyNode[];
	private listMap: { [index: number]: DisassemblyNode };
	
	constructor(private context: ExtensionContext) {
		this.list = [];
        this.listMap = {};
	}

	public loadInstructions(data: DisassemblyInstruction[]){

		this.list = [];
        this.listMap = {};
		
		data.forEach((inst, idx ) => {
            if (inst) {
                const rn = new DisassemblyNode(inst);
                this.list.push(rn);
                this.listMap[idx] = rn;
			}
		});
	}

	public updateItemTypes(){
		if (this.canLoad) {
			this.list.filter(el => el.getProp() === "breakpoint").forEach(e => e.setProp("none"));
			vscode.debug.breakpoints.filter(bp=>{
				if (bp instanceof vscode.SourceBreakpoint) {
					const url = bp.location.uri.toString();
					let sourcepath = this.fileName;
	                return path.relative(sourcepath, url) === "";
				}
			}).forEach(bkp => {
				if (bkp instanceof vscode.SourceBreakpoint) {
					
	                const line = bkp.location.range.start.line;
					let el:DisassemblyNode[] = this.list.filter(el => el.getLineNum() === line && el.getProp() != "active");
					el.forEach(e => e.setProp("breakpoint"));
	                
				}
			});
			this._onDidChangeTreeData.fire();
		}
	}

	public refresh(): void {
		if (this.canLoad) {
            debug.activeDebugSession.customRequest('load-current-disassembly').then((data) => {
				this.fileName = data.url;
				this.loadInstructions(data.instructions);
				this._onDidChangeTreeData.fire();
			});
		}
	}
	
	public getTreeItem(element: DisassemblyNode): TreeItem {
		let type = element.getProp();
		let e: TreeItem = element.getTreeItem();
		let command = "";
	
		switch(type){
			case "none":
				e.iconPath = { 
					light : "",
					dark : ""
				 }
				command = 'module-debug.viewDisassembly.addBreakpoint';
				break;
			case "active":
				e.iconPath = { 
					light : this.context.asAbsolutePath( path.join('images', 'arrow.svg')),
					dark : this.context.asAbsolutePath( path.join('images', 'arrow.svg'))
				}
				break;
			case "breakpoint":
				e.iconPath = { 
					light : this.context.asAbsolutePath( path.join('images', 'red-point.svg')),
					dark : this.context.asAbsolutePath( path.join('images', 'red-point.svg'))
				}
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

	public getChildren(element?: DisassemblyNode): ProviderResult<DisassemblyNode[]> {
		if (this.canLoad && this.list.length > 0) {
            return element ? element.getChildren() : this.list;
        }else if (!debug.activeDebugSession) {
            return [];
        }
        else {
            return [];
        }
	}

	public getActiveNode(): DisassemblyNode{
		return this.list[0];
	}
	
    // Начало сессии отладки
	public debugSessionStarted() {
        this.canLoad = false;
        this._onDidChangeTreeData.fire();
	}
	
    // Завершение сессии отладки
	public debugSessionTerminated() {
        this.canLoad = false;
        this._onDidChangeTreeData.fire();
	}
	
	//Остановка во время выполнения сессии
    public debugStopped() {
        this.refresh();
	}
	
    public debugContinued() {
        
    }
}