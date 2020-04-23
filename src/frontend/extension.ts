/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import * as Net from 'net';
import { GDBDebugSession } from '../gdb';
import { SWOCore } from './swo/core';
import { SWOSource } from './swo/sources/common';
import { PeripheralTreeProvider } from './views/peripheral';
import { RegisterTreeProvider } from './views/registers';
import { MemoryContentProvider } from './memory_content_provider';
import { PeripheralBaseNode, BaseNode } from './views/nodes/basenode';
import Reporting from '../reporting';
import { NumberFormat, ConfigurationArguments } from '../common';
import { DisassemblyContentProvider } from './disassembly_content_provider';
import { SymbolInformation, SymbolScope } from '../symbols';
import { FileSWOSource } from './swo/sources/file';
import { FifoSWOSource } from './swo/sources/fifo';
import { SocketSWOSource } from './swo/sources/socket';
import { SerialSWOSource } from './swo/sources/serial';
import { RegisterNode } from './views/nodes/registernode';
import { ModuleEvent } from 'vscode-debugadapter';
import { ProtocolServer } from 'vscode-debugadapter/lib/protocol';
import { DisassemblyTreeProvider } from './views/disassembly';
import { DisassemblyNode } from './views/nodes/disassemblynode';
import { Breakpoint } from '../backend/backend';

interface SVDInfo {
    expression: RegExp;
    path: string;
}

/*
 * The compile time flag 'runMode' controls how the debug adapter is run.
 * Please note: the test suite only supports 'external' mode.
 */

export class ModuleDebugExtension {
	private adapterOutputChannel: vscode.OutputChannel = null;
    private clearAdapterOutputChannel = false;
    private swo: SWOCore = null;
    private swosource: SWOSource = null;

    private peripheralProvider: PeripheralTreeProvider;
    private registerProvider: RegisterTreeProvider;
    private memoryProvider: MemoryContentProvider;
    private disassemblyProvider: DisassemblyTreeProvider;

    private peripheralTreeView: vscode.TreeView<PeripheralBaseNode>;
    private registerTreeView: vscode.TreeView<BaseNode>;
    private disassemblyTreeView: vscode.TreeView<DisassemblyNode>;

    private SVDDirectory: SVDInfo[] = [];
    private functionSymbols: SymbolInformation[] = null;

	private runMode: 'external' | 'server' | 'inline' = 'inline';
    private serverType: string = '';
    
    private selectedLineDecorationType: vscode.TextEditorDecorationType;
    private unusedLineDecorationType: vscode.TextEditorDecorationType;
    
    private DisassemblyActiveFile: string = '';
    private DisassemblyActiveLine: number = 0;
	constructor(private context: vscode.ExtensionContext) {

		//this.peripheralProvider = new PeripheralTreeProvider();
		this.registerProvider = new RegisterTreeProvider();
		this.memoryProvider = new MemoryContentProvider();
        this.disassemblyProvider = new DisassemblyTreeProvider(context);
        this.disassemblyProvider.onDidChangeTreeData(() => {
            let activeNode = this.disassemblyProvider.getActiveNode();
            if( activeNode != null){
                this.disassemblyTreeView.reveal(activeNode, {select: true, focus: true, expand: true });
                this.disassemblyTreeView.title = activeNode.getFullInfo().func;
            }
        })
		/*this.peripheralTreeView = vscode.window.createTreeView('module-debug.peripherals', {
            treeDataProvider: this.peripheralProvider
        });*/
		
		this.registerTreeView = vscode.window.createTreeView('module-debug.registers', {
            treeDataProvider: this.registerProvider
        });
		this.disassemblyTreeView = vscode.window.createTreeView('module-debug.disassembly-current', {
            treeDataProvider: this.disassemblyProvider
        });

  this.selectedLineDecorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground')
		});
		
		this.unusedLineDecorationType = vscode.window.createTextEditorDecorationType({
            opacity: '0.5'
        });
        
  Reporting.activate( context );

		context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider('examinememory', this.memoryProvider),
			vscode.workspace.registerTextDocumentContentProvider('disassembly', new DisassemblyContentProvider()),

			/* vscode.commands.registerCommand('module-debug.peripherals.updateNode', this.peripheralsUpdateNode.bind(this)),
            vscode.commands.registerCommand('module-debug.peripherals.copyValue', this.peripheralsCopyValue.bind(this)),
            vscode.commands.registerCommand('module-debug.peripherals.setFormat', this.peripheralsSetFormat.bind(this)),
			vscode.commands.registerCommand('module-debug.peripherals.forceRefresh', this.peripheralsForceRefresh.bind(this)),
            */
			vscode.commands.registerCommand('module-debug.registers.copyValue', this.registersCopyValue.bind(this)),
			vscode.commands.registerCommand('module-debug.registers.setValue', this.registersSetValue.bind(this)),

            vscode.commands.registerCommand('module-debug.examineMemory', this.examineMemory.bind(this)),
            
            vscode.commands.registerTextEditorCommand('module-debug.viewDisassembly', this.showDisassembly.bind(this)),
            vscode.commands.registerCommand('module-debug.viewDisassembly.addBreakpoint', this.addBreakpoint.bind(this)),
            vscode.commands.registerCommand('module-debug.viewDisassembly.removeBreakpoint', this.removeBreakpoint.bind(this)),
            vscode.commands.registerCommand('module-debug.removeIncorrectBreakpoint', this.removeIncorrectBreakpoint.bind(this)),
            
            // vscode.commands.registerCommand('module-debug.viewDisassembly', this.showDisassembly.bind(this)),
            // vscode.commands.registerCommand('module-debug.setForceDisassembly', this.setForceDisassembly.bind(this)),
            vscode.commands.registerCommand('module-debug.openCurrentDisassembly', async () => {
                await this.openCurrentDisassembly();
            }),

            vscode.debug.onDidReceiveDebugSessionCustomEvent(this.receivedCustomEvent.bind(this)),
            vscode.debug.onDidChangeBreakpoints(e => {
                console.log(`Event: a: ${e.added.length} r: ${e.removed.length} c: ${e.changed.length}`);
                this.disassemblyProvider.updateItemTypes();
            }),
            vscode.debug.onDidStartDebugSession(this.debugSessionStarted.bind(this)),
            vscode.debug.onDidTerminateDebugSession(this.debugSessionTerminated.bind(this)),
            vscode.window.onDidChangeActiveTextEditor(this.activeEditorChanged.bind(this)),
            vscode.window.onDidChangeTextEditorSelection((e: vscode.TextEditorSelectionChangeEvent) => {
                if (e && e.textEditor.document.fileName.endsWith('.cdmem')) {
                    if(e.kind === 3 ){
                        this.memoryProvider.handleSelectionChange(e);
                    }else{
                        this.memoryProvider.handleSelection(e);
                    } 
                }
			}),
			this.registerTreeView,
            this.registerTreeView.onDidCollapseElement((e) => {
                e.element.expanded = false;
            }),
            this.registerTreeView.onDidExpandElement((e) => {
                e.element.expanded = true;
            }),
           /* this.peripheralTreeView,
            this.peripheralTreeView.onDidExpandElement((e) => {
                e.element.expanded = true;
                e.element.getPeripheral().updateData();
                this.peripheralProvider.refresh();
            }),
            this.peripheralTreeView.onDidCollapseElement((e) => {
                e.element.expanded = false;
            }),*/
            
            this.disassemblyTreeView,
            this.disassemblyTreeView.onDidCollapseElement((e) => {
                e.element.expanded = false;
            }),
            this.disassemblyTreeView.onDidExpandElement((e) => {
                e.element.expanded = true;
            }),
        );
        
		// context.subscriptions.push(vscode.debug.onDidStartDebugSession(this.debugSessionStarted.bind(this)));

		// register a configuration provider for 'mock' debug type
		const provider = new ModuleConfigurationProvider();
		context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('module-debug', provider));
	
		// debug adapters can be run in different ways by using a vscode.DebugAdapterDescriptorFactory:
		let factory: vscode.DebugAdapterDescriptorFactory;
		switch (this.runMode) {
			case 'server':
				// run the debug adapter as a server inside the extension and communicating via a socket
				factory = new GDBDebugAdapterDescriptorFactory();
				break;
	
			case 'inline':
				// run the debug adapter inside the extension and directly talk to it
				factory = new InlineDebugAdapterFactory();
				break;
	
			case 'external': default:
				// run the debug adapter as a separate process
				factory = new DebugAdapterExecutableFactory();
				break;
			}
	
		context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('module-debug', factory));
		if ('dispose' in factory) {
			context.subscriptions.push(factory);
		}
		// override VS Code's default implementation of the debug hover
		// vscode.languages.registerEvaluatableExpressionProvider('markdown', new SimpleEvaluatableExpressionProvider());
	}

	private async showDisassembly(editor: vscode.TextEditor) {
        if (!vscode.debug.activeDebugSession) {
            vscode.window.showErrorMessage('No debugging session available');
            return;
        }
            // Вариант создания Disassemble от module-debug, через таблицу символов.         
        if (!this.functionSymbols) {
            try {
                const resp = await vscode.debug.activeDebugSession.customRequest('load-function-symbols');
                this.functionSymbols = resp.functionSymbols;
            }
            catch (e) {
                vscode.window.showErrorMessage('Unable to load symbol table. Disassembly view unavailable.');
            }
        }

        try {
            const funcname: string = await vscode.window.showInputBox({
                placeHolder: 'main',
                ignoreFocusOut: true,
                prompt: 'Function Name to Disassemble'
            });

            const functions = this.functionSymbols.filter((s) => s.name.search(funcname) >=0 );

            let url: string;

            if (functions.length === 0) {
                vscode.window.showErrorMessage(`No function with name "${funcname}" found.`);
            }
            else if (functions.length === 1) {
                if (functions[0].scope === SymbolScope.Global) {
                    url = `disassembly:///${functions[0].name}.cdasm`;
                }
                else {
                    url = `disassembly:///${functions[0].file}::${functions[0].name}.cdasm`;
                }
            }
            else {
                const selected = await vscode.window.showQuickPick(functions.map((f) => {
                    return {
                        label: f.name,
                        name: f.name,
                        file: f.file,
                        scope: f.scope,
                        description: f.scope === SymbolScope.Global ? 'Global Scope' : `Static in ${f.file}`
                    };
                }), {
                    ignoreFocusOut: true
                });

                if (selected.scope === SymbolScope.Global) {
                    url = `disassembly:///${selected.name}.cdasm`;
                }
                else {
                    url = `disassembly:///${selected.file}::${selected.name}.cdasm`;
                }
            }

            vscode.workspace.openTextDocument(vscode.Uri.parse(url))
                            .then((doc) => {
                                vscode.window.showTextDocument(doc, { /*viewColumn: 2,*/ preview: false });
                                Reporting.sendEvent('Show Disassembly', 'Used');
                            }, (error) => {
                                vscode.window.showErrorMessage(`Failed to show disassembly: ${error}`);
                                Reporting.sendEvent('Show Disassembly', 'Error', error.toString());
                            });
        }
        catch (e) {
            vscode.window.showErrorMessage('Unable to show disassembly.');
        }
        
    }

    private setForceDisassembly() {
        vscode.window.showQuickPick(
            [
                { label: 'Auto', description: 'Show disassembly for functions when source cannot be located.' },
                { label: 'Forced', description: 'Always show disassembly for functions.' }
            ],
            { matchOnDescription: true, ignoreFocusOut: true }
        ).then((result) => {
            const force = result.label === 'Forced';
            vscode.debug.activeDebugSession.customRequest('set-force-disassembly', { force: force });
            Reporting.sendEvent('Force Disassembly', 'Set', force ? 'Forced' : 'Auto');
        }, (error) => {});
	}
	
	private examineMemory() {
        function validateValue(address) {
            if (/^0x[0-9a-f]{1,8}$/i.test(address)) {
                return address;
            }
            else if (/^[0-9]+$/i.test(address)) {
                return address;
            }
            else {
                return null;
            }
        }

        function validateAddress(address: string) {
            if (address === '') {
                return null;
            }
            return address;
        }

        if (!vscode.debug.activeDebugSession) {
            vscode.window.showErrorMessage('No debugging session available');
            return;
        }

        vscode.window.showInputBox({
            placeHolder: 'Enter a valid C/gdb expression. Use 0x prefix for hexidecimal numbers',
            ignoreFocusOut: true,
            prompt: 'Memory Address'
        }).then(
            (address) => {
                address = address.trim();
                if (!validateAddress(address)) {
                    vscode.window.showErrorMessage('Invalid memory address entered');
                    Reporting.sendEvent('Examine Memory', 'Invalid Address', address);
                    return;
                }

                vscode.window.showInputBox({
                    placeHolder: 'Enter a constant value. Prefix with 0x for hexidecimal format.',
                    ignoreFocusOut: true,
                    prompt: 'Length'
                }).then(
                    (length) => {
                        length = length.trim();
                        if (!validateValue(length)) {
                            vscode.window.showErrorMessage('Invalid length entered');
                            Reporting.sendEvent('Examine Memory', 'Invalid Length', length);
                            return;
                        }

                        Reporting.sendEvent('Examine Memory', 'Valid', `${address}-${length}`);
                        const timestamp = new Date().getTime();
                        const addrEnc = encodeURIComponent(`${address}`);
                        // tslint:disable-next-line:max-line-length
                        vscode.workspace.openTextDocument(vscode.Uri.parse(`examinememory:///Memory%20[${addrEnc},${length}].cdmem?address=${addrEnc}&length=${length}&timestamp=${timestamp}`))
                            .then((doc) => {
                                vscode.window.showTextDocument(doc, {/* viewColumn: 2,*/ preview: false });
                                Reporting.sendEvent('Examine Memory', 'Used');
                            }, (error) => {
                                vscode.window.showErrorMessage(`Failed to examine memory: ${error}`);
                                Reporting.sendEvent('Examine Memory', 'Error', error.toString());
                            });
                    },
                    (error) => {

                    }
                );
            },
            (error) => {

            }
        );
	}
	private addBreakpoint(bkp){
        const bkpList: vscode.Breakpoint[] = [];
        bkpList.push(new vscode.SourceBreakpoint(new vscode.Location(vscode.Uri.parse(bkp.file), new vscode.Position(bkp.line, 0))));
        vscode.debug.addBreakpoints(bkpList);
    }

    private removeBreakpoint(bkp){
        const found = vscode.debug.breakpoints.filter(bp => {
            if (bp instanceof vscode.SourceBreakpoint) {
                const url = bp.location.uri.toString()
                const line = bp.location.range.start.line;
                if((bkp.line) === line){
                    let sourcepath = bkp.file ;
                    if(path.relative(sourcepath, url) === "")
                    {
                        return true;
                    }
                }
                
            }
            return false;
        });
        vscode.debug.removeBreakpoints(found);
    }

    private async removeIncorrectBreakpoint(bkpList:Breakpoint[]){
        let info:string = "";
        const found = vscode.debug.breakpoints.filter(bp => {
            if (bp instanceof vscode.SourceBreakpoint) {
                const url = bp.location.uri.toString()
                const line = bp.location.range.start.line;
                for(let i = 0; i<bkpList.length; i++){
                    if((bkpList[i].line - 1) === line){
                        let sourcepath = bkpList[i].file ;
                        if(path.relative(sourcepath, url) === "")
                        {
                            info += sourcepath + " line: " + bkpList[i].line + "; \n"
                            return true;
                        }
                    }
                }
            }
            return false;
        });
        vscode.window.showWarningMessage(`Удалить некорректные точки остановки (${info})?`, 'Да', 'Нет').then(async (choice) =>{
            if(choice === "Да") {
                
                for(let i = 0; i< found.length; i++){
                    let removeBkp: vscode.Breakpoint[] = [];
                    removeBkp.push(found[i]);
                    await vscode.debug.removeBreakpoints(removeBkp);
                }
            }
        });
    }
	// Peripherals
    private peripheralsUpdateNode(node: PeripheralBaseNode): void {
        node.performUpdate().then((result) => {
            if (result) {
                this.peripheralProvider.refresh();
                Reporting.sendEvent('Peripheral View', 'Update Node');
            }
        }, (error) => {
            vscode.window.showErrorMessage(`Unable to update value: ${error.toString()}`);
        });
    }

    private peripheralsCopyValue(node: PeripheralBaseNode): void {
        const cv = node.getCopyValue();
        if (cv) {
            vscode.env.clipboard.writeText(cv).then(() => {
                Reporting.sendEvent('Peripheral View', 'Copy Value');
            });
        }
    }

    private async peripheralsSetFormat(node: PeripheralBaseNode): Promise<void> {
        const result = await vscode.window.showQuickPick([
            { label: 'Auto', description: 'Automatically choose format (Inherits from parent)', value: NumberFormat.Auto },
            { label: 'Hex', description: 'Format value in hexidecimal', value: NumberFormat.Hexidecimal },
            { label: 'Decimal', description: 'Format value in decimal', value: NumberFormat.Decimal },
            { label: 'Binary', description: 'Format value in binary', value: NumberFormat.Binary }
        ]);

        node.format = result.value;
        this.peripheralProvider.refresh();
        Reporting.sendEvent('Peripheral View', 'Set Format', result.label);
    }

    private async peripheralsForceRefresh(node: PeripheralBaseNode): Promise<void> {
        node.getPeripheral().updateData().then((e) => {
            this.peripheralProvider.refresh();
        });
	}

	// Registers
    private registersCopyValue(node: BaseNode): void {
        const cv = node.getCopyValue();
        if (cv) {
            vscode.env.clipboard.writeText(cv).then(() => {
                Reporting.sendEvent('Register View', 'Copy Value');
            });
        }
    }
    // Установка значения выбранного регистра
    private async registersSetValue(node: RegisterNode){
        
        const value: string = await vscode.window.showInputBox({
            value: node.getCopyValue(),
            ignoreFocusOut: true,
            prompt: 'Value of register "' + node.name + '"'
        });

        vscode.debug.activeDebugSession.customRequest('set-register', { name : node.name, value: value}).then(() => {
            this.registerProvider.refresh();
        });
    }
	
	private getSVDFile(device: string): string {
        const entry = this.SVDDirectory.find((de) => de.expression.test(device));
        return entry ? entry.path : null;
	}
	
	private initializeSWO(args) {
        if (!this.swosource) {
            vscode.window.showErrorMessage('Tried to initialize SWO Decoding without a SWO data source');
            return;
        }

        this.swo = new SWOCore(this.swosource, args, this.context.extensionPath);
	}
	
	private debugSessionStarted(session: vscode.DebugSession) {
        // Удаляем все старые строчки с "отладочной" подсветкой 
        this.selectedLineDecorationType.dispose();

        if (session.type !== 'module-debug') { return; }

        // Clean-up Old output channels
        if (this.swo) {
            this.swo.dispose();
            this.swo = null;
        }

        this.functionSymbols = null;

        session.customRequest('get-arguments').then((args) => {
            let svdfile = args.svdFile;
            this.serverType = args.servertype;
            if (!svdfile) {
                svdfile = this.getSVDFile(args.device);
            }

            Reporting.beginSession(args as ConfigurationArguments);
            
            this.registerProvider.debugSessionStarted();
            //this.peripheralProvider.debugSessionStarted(svdfile ? svdfile : null);
            this.disassemblyProvider.debugSessionStarted();

            if (this.swosource) { this.initializeSWO(args); }
        }, (error) => {
            // TODO: Error handling for unable to get arguments
        });
	}

	private debugSessionTerminated(session: vscode.DebugSession) {
        if (session.type !== 'module-debug') { return; }

        Reporting.endSession();

        this.registerProvider.debugSessionTerminated();
        //this.peripheralProvider.debugSessionTerminated();
        this.disassemblyProvider.debugSessionTerminated();    
        
        if (this.swo) {
            this.swo.debugSessionTerminated();
        }
        if (this.swosource) {
            this.swosource.dispose();
            this.swosource = null;
        }
        this.clearAdapterOutputChannel = true;
    }

	private activeEditorChanged(editor: vscode.TextEditor) {
        if (editor !== undefined && vscode.debug.activeDebugSession && vscode.debug.activeDebugSession.type === 'module-debug') {
            const uri = editor.document.uri;
            if (uri.scheme === 'file') {
                vscode.debug.activeDebugSession.customRequest('set-active-editor', { path: uri.path });
            }
            else if (uri.scheme === 'disassembly') {
                // if(editor.viewColumn === 1){
                //vscode.debug.activeDebugSession.customRequest('set-active-editor', { path: `${uri.scheme}://${uri.authority}${uri.path}` });
                vscode.workspace.openTextDocument(vscode.Uri.parse(`${uri.scheme}://${uri.authority}${uri.path}`))
                    .then((doc) => {
                        vscode.window.showTextDocument(doc, { /*viewColumn: 2,*/ preview: false }).then((editor) => {
                            if(doc.fileName === this.DisassemblyActiveFile){
                                editor.setDecorations(this.selectedLineDecorationType,  [new vscode.Range(this.DisassemblyActiveLine, 0, this.DisassemblyActiveLine, 0)])
                            }
                        });
                        Reporting.sendEvent('Show disassembly', 'Used');
                    }, (error) => {
                        vscode.window.showErrorMessage(`Failed to show disassembly: ${error}`);
                        Reporting.sendEvent('Show disassembly', 'Error', error.toString());
                    });
                // }

                            
            }
        }
	}
	
	private receivedCustomEvent(e: vscode.DebugSessionCustomEvent) {
        if (vscode.debug.activeDebugSession && vscode.debug.activeDebugSession.type !== 'module-debug') { return; }
        switch (e.event) {
            case 'custom-stop':
                this.receivedStopEvent(e);
                break;
            case 'custom-continued':
                this.receivedContinuedEvent(e);
                break;
            case 'swo-configure':
                this.receivedSWOConfigureEvent(e);
                break;
            case 'adapter-output':
                this.receivedAdapterOutput(e);
                break;
            case 'record-event':
                this.receivedEvent(e);
                break;
            default:
                break;
        }
    }
    // Событие остановки
	private receivedStopEvent(e) {
        //this.peripheralProvider.debugStopped();
        this.registerProvider.debugStopped();
        this.disassemblyProvider.debugStopped();
        
        vscode.workspace.textDocuments.filter((td) => td.fileName.endsWith('.cdmem'))
            .forEach((doc) => { this.memoryProvider.update(doc); });
        if (this.swo) { this.swo.debugStopped(); }
    }

    // Событие продолжения выполнения сессии
    private receivedContinuedEvent(e) {
        //this.peripheralProvider.debugContinued();
        this.registerProvider.debugContinued();
        this.disassemblyProvider.debugContinued();
        this.disassemblyProvider.canLoad = true;
        //vscode.commands.executeCommand('module-debug.openCurrentDisassembly');
        if (this.swo) { this.swo.debugContinued(); }
    }

    //Открытие текущего куска кода дизассемблера
    private async openCurrentDisassembly(){
        
        this.selectedLineDecorationType.dispose();
        
        this.selectedLineDecorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground')
		});

        vscode.debug.activeDebugSession.customRequest('load-current-disassembly').then(
            async (result) => {
                try{
                    vscode.workspace.openTextDocument(vscode.Uri.parse(result.url))
                        .then((doc) => {
                            this.DisassemblyActiveFile = doc.fileName;
                            this.DisassemblyActiveLine = result.line - 1;
                            vscode.window.showTextDocument(doc, { /*viewColumn: 2,*/  preview: false }).then((editor) => {
                                
                                editor.setDecorations(this.selectedLineDecorationType,  [new vscode.Range(this.DisassemblyActiveLine, 0, this.DisassemblyActiveLine, 0)])
                            });
                            //vscode.window.activeTextEditor.setDecorations(this.selectedLineDecorationType,  [new vscode.Range(result.line, 0, result.line, 0)]);
                            Reporting.sendEvent('Show Disassembly', 'Used');
                        }, (error) => {
                            vscode.window.showErrorMessage(`Failed to show disassembly: ${error}`);
                            Reporting.sendEvent('Show Disassembly', 'Error', error.toString());
                        });
                     
                }
                catch(error){
                    vscode.window.showErrorMessage(error);
                }
            },
            (error) => {
                vscode.window.showErrorMessage(error);
            }
        );
       
    }
    //Событие получено
    private receivedEvent(e) {
        Reporting.sendEvent(e.body.category, e.body.action, e.body.label, e.body.parameters);
    }
    
	private receivedSWOConfigureEvent(e) {
        if (e.body.type === 'socket') {
            this.swosource = new SocketSWOSource(e.body.port);
            Reporting.sendEvent('SWO', 'Source', 'Socket');
        }
        else if (e.body.type === 'fifo') {
            this.swosource = new FifoSWOSource(e.body.path);
            Reporting.sendEvent('SWO', 'Source', 'FIFO');
        }
        else if (e.body.type === 'file') {
            this.swosource = new FileSWOSource(e.body.path);
            Reporting.sendEvent('SWO', 'Source', 'File');
        }
        else if (e.body.type === 'serial') {
            this.swosource = new SerialSWOSource(e.body.device, e.body.baudRate, this.context.extensionPath);
            Reporting.sendEvent('SWO', 'Source', 'Serial');
        }

        if (vscode.debug.activeDebugSession) {
            vscode.debug.activeDebugSession.customRequest('get-arguments').then((args) => {
                this.initializeSWO(args);
            });
        }
    }

    private receivedAdapterOutput(e) {
        if (!this.adapterOutputChannel) {
            this.adapterOutputChannel = vscode.window.createOutputChannel('Adapter Output');
            this.adapterOutputChannel.show();
        } else if (this.clearAdapterOutputChannel) {
            this.adapterOutputChannel.clear();
        }
        this.clearAdapterOutputChannel = false;

        let output = e.body.content;
        if (!output.endsWith('\n')) { output += '\n'; }
        this.adapterOutputChannel.append(output);
    }
}

export function activate(context: vscode.ExtensionContext) {
	return new ModuleDebugExtension(context);
}

export function deactivate() {
	// nothing to do
}

class ModuleConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	public resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

		// if launch.json is missing or empty
		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === 'markdown') {
				config.type = 'mock';
				config.name = 'Launch';
				config.request = 'launch';
				config.program = '${file}';
				config.stopOnEntry = true;
			}
		}

		if (!config.executable) {
			return vscode.window.showInformationMessage('Cannot find a program to debug').then(() => {
				return undefined;	// abort launch
			});
		}

		return config;
	}
}

class DebugAdapterExecutableFactory implements vscode.DebugAdapterDescriptorFactory {

	// The following use of a DebugAdapter factory shows how to control what debug adapter executable is used.
	// Since the code implements the default behavior, it is absolutely not neccessary and we show it here only for educational purpose.

	public createDebugAdapterDescriptor(_session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): ProviderResult<vscode.DebugAdapterDescriptor> {
		// param "executable" contains the executable optionally specified in the package.json (if any)

		// use the executable specified in the package.json if it exists or determine it based on some other information (e.g. the session)
		if (!executable) {
			const command = 'absolute path to my DA executable';
			const args = [
				'some args',
				'another arg'
			];
			const options = {
				cwd: 'working directory for executable',
				env: { VAR: 'some value' }
			};
			executable = new vscode.DebugAdapterExecutable(command, args, options);
		}

		// make VS Code launch the DA executable
		return executable;
	}
}

class GDBDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	private server?: Net.Server;

	public createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {

		if (!this.server) {
			// start listening on a random port
			this.server = Net.createServer((socket) => {
				const session = new GDBDebugSession(true);
				session.setRunAsServer(true);
				session.start(socket as NodeJS.ReadableStream, socket);
			}).listen(0);
		}

		// make VS Code connect to debug server
		return new vscode.DebugAdapterServer((this.server.address() as Net.AddressInfo).port);
	}

	public dispose() {
		if (this.server) {
			this.server.close();
		}
	}
}

class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

	public createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
		return new vscode.DebugAdapterInlineImplementation(new GDBDebugSession(true));
    }
    
    
}
