/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const vscode = require("vscode");
const Net = require("net");
const gdb_1 = require("../gdb");
const core_1 = require("./swo/core");
const registers_1 = require("./views/registers");
const memory_content_provider_1 = require("./memory_content_provider");
const reporting_1 = require("../reporting");
const common_1 = require("../common");
const disassembly_content_provider_1 = require("./disassembly_content_provider");
const symbols_1 = require("../symbols");
const file_1 = require("./swo/sources/file");
const fifo_1 = require("./swo/sources/fifo");
const socket_1 = require("./swo/sources/socket");
const serial_1 = require("./swo/sources/serial");
const disassembly_1 = require("./views/disassembly");
/*
 * The compile time flag 'runMode' controls how the debug adapter is run.
 * Please note: the test suite only supports 'external' mode.
 */
class ModuleDebugExtension {
    constructor(context) {
        this.context = context;
        this.adapterOutputChannel = null;
        this.clearAdapterOutputChannel = false;
        this.swo = null;
        this.swosource = null;
        this.SVDDirectory = [];
        this.functionSymbols = null;
        this.runMode = 'inline';
        this.serverType = '';
        this.DisassemblyActiveFile = '';
        this.DisassemblyActiveLine = 0;
        //this.peripheralProvider = new PeripheralTreeProvider();
        this.registerProvider = new registers_1.RegisterTreeProvider();
        this.memoryProvider = new memory_content_provider_1.MemoryContentProvider();
        // tslint:disable-next-line:align
        this.disassemblyProvider = new disassembly_1.DisassemblyTreeProvider(context);
        this.disassemblyProvider.onDidChangeTreeData(() => {
            // tslint:disable-next-line: prefer-const
            let activeNode = this.disassemblyProvider.getActiveNode();
            if (activeNode != null) {
                this.disassemblyTreeView.reveal(activeNode, { select: true, focus: true, expand: true });
                // this.disassemblyTreeView.title = activeNode.getFullInfo().func;
            }
        });
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
        reporting_1.default.activate(context);
        context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('examinememory', this.memoryProvider), vscode.workspace.registerTextDocumentContentProvider('disassembly', new disassembly_content_provider_1.DisassemblyContentProvider()), 
        /* vscode.commands.registerCommand('module-debug.peripherals.updateNode', this.peripheralsUpdateNode.bind(this)),
        vscode.commands.registerCommand('module-debug.peripherals.copyValue', this.peripheralsCopyValue.bind(this)),
        vscode.commands.registerCommand('module-debug.peripherals.setFormat', this.peripheralsSetFormat.bind(this)),
        vscode.commands.registerCommand('module-debug.peripherals.forceRefresh', this.peripheralsForceRefresh.bind(this)),
        */
        vscode.commands.registerCommand('module-debug.registers.copyValue', this.registersCopyValue.bind(this)), vscode.commands.registerCommand('module-debug.registers.setValue', this.registersSetValue.bind(this)), vscode.commands.registerCommand('module-debug.examineMemory', this.examineMemory.bind(this)), vscode.commands.registerTextEditorCommand('module-debug.viewDisassembly', this.showDisassembly.bind(this)), vscode.commands.registerCommand('module-debug.viewDisassembly.addBreakpoint', this.addBreakpoint.bind(this)), vscode.commands.registerCommand('module-debug.viewDisassembly.removeBreakpoint', this.removeBreakpoint.bind(this)), vscode.commands.registerCommand('module-debug.removeIncorrectBreakpoint', this.removeIncorrectBreakpoint.bind(this)), 
        // vscode.commands.registerCommand('module-debug.viewDisassembly', this.showDisassembly.bind(this)),
        // vscode.commands.registerCommand('module-debug.setForceDisassembly', this.setForceDisassembly.bind(this)),
        vscode.commands.registerCommand('module-debug.openCurrentDisassembly', () => __awaiter(this, void 0, void 0, function* () {
            yield this.openCurrentDisassembly();
        })), vscode.debug.onDidReceiveDebugSessionCustomEvent(this.receivedCustomEvent.bind(this)), vscode.debug.onDidChangeBreakpoints(e => {
            console.log(`Event: a: ${e.added.length} r: ${e.removed.length} c: ${e.changed.length}`);
            this.disassemblyProvider.updateItemTypes();
        }), vscode.debug.onDidStartDebugSession(this.debugSessionStarted.bind(this)), vscode.debug.onDidTerminateDebugSession(this.debugSessionTerminated.bind(this)), vscode.window.onDidChangeActiveTextEditor(this.activeEditorChanged.bind(this)), vscode.window.onDidChangeTextEditorSelection((e) => {
            if (e && e.textEditor.document.fileName.endsWith('.cdmem')) {
                if (e.kind === 3) {
                    this.memoryProvider.handleSelectionChange(e);
                }
                else {
                    this.memoryProvider.handleSelection(e);
                }
            }
        }), this.registerTreeView, this.registerTreeView.onDidCollapseElement((e) => {
            e.element.expanded = false;
        }), this.registerTreeView.onDidExpandElement((e) => {
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
        this.disassemblyTreeView, this.disassemblyTreeView.onDidCollapseElement((e) => {
            e.element.expanded = false;
        }), this.disassemblyTreeView.onDidExpandElement((e) => {
            e.element.expanded = true;
        }));
        // context.subscriptions.push(vscode.debug.onDidStartDebugSession(this.debugSessionStarted.bind(this)));
        // register a configuration provider for 'mock' debug type
        const provider = new ModuleConfigurationProvider();
        context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('module-debug', provider));
        // debug adapters can be run in different ways by using a vscode.DebugAdapterDescriptorFactory:
        let factory;
        switch (this.runMode) {
            case 'server':
                // run the debug adapter as a server inside the extension and communicating via a socket
                factory = new GDBDebugAdapterDescriptorFactory();
                break;
            case 'inline':
                // run the debug adapter inside the extension and directly talk to it
                factory = new InlineDebugAdapterFactory();
                break;
            case 'external':
            default:
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
    showDisassembly(editor) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!vscode.debug.activeDebugSession) {
                vscode.window.showErrorMessage('No debugging session available');
                return;
            }
            // Вариант создания Disassemble от module-debug, через таблицу символов.         
            if (!this.functionSymbols) {
                try {
                    const resp = yield vscode.debug.activeDebugSession.customRequest('load-function-symbols');
                    this.functionSymbols = resp.functionSymbols;
                }
                catch (e) {
                    vscode.window.showErrorMessage('Unable to load symbol table. Disassembly view unavailable.');
                }
            }
            try {
                const funcname = yield vscode.window.showInputBox({
                    placeHolder: 'main',
                    ignoreFocusOut: true,
                    prompt: 'Function Name to Disassemble'
                });
                const functions = this.functionSymbols.filter((s) => s.name.search(funcname) >= 0);
                let url;
                if (functions.length === 0) {
                    vscode.window.showErrorMessage(`No function with name "${funcname}" found.`);
                }
                else if (functions.length === 1) {
                    if (functions[0].scope === symbols_1.SymbolScope.Global) {
                        url = `disassembly:///${functions[0].name}.cdasm`;
                    }
                    else {
                        url = `disassembly:///${functions[0].file}::${functions[0].name}.cdasm`;
                    }
                }
                else {
                    const selected = yield vscode.window.showQuickPick(functions.map((f) => {
                        return {
                            label: f.name,
                            name: f.name,
                            file: f.file,
                            scope: f.scope,
                            description: f.scope === symbols_1.SymbolScope.Global ? 'Global Scope' : `Static in ${f.file}`
                        };
                    }), {
                        ignoreFocusOut: true
                    });
                    if (selected.scope === symbols_1.SymbolScope.Global) {
                        url = `disassembly:///${selected.name}.cdasm`;
                    }
                    else {
                        url = `disassembly:///${selected.file}::${selected.name}.cdasm`;
                    }
                }
                vscode.workspace.openTextDocument(vscode.Uri.parse(url))
                    .then((doc) => {
                    vscode.window.showTextDocument(doc, { /*viewColumn: 2,*/ preview: false });
                    reporting_1.default.sendEvent('Show Disassembly', 'Used');
                }, (error) => {
                    vscode.window.showErrorMessage(`Failed to show disassembly: ${error}`);
                    reporting_1.default.sendEvent('Show Disassembly', 'Error', error.toString());
                });
            }
            catch (e) {
                vscode.window.showErrorMessage('Unable to show disassembly.');
            }
        });
    }
    setForceDisassembly() {
        vscode.window.showQuickPick([
            { label: 'Auto', description: 'Show disassembly for functions when source cannot be located.' },
            { label: 'Forced', description: 'Always show disassembly for functions.' }
        ], { matchOnDescription: true, ignoreFocusOut: true }).then((result) => {
            const force = result.label === 'Forced';
            vscode.debug.activeDebugSession.customRequest('set-force-disassembly', { force: force });
            reporting_1.default.sendEvent('Force Disassembly', 'Set', force ? 'Forced' : 'Auto');
        }, (error) => { });
    }
    examineMemory() {
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
        function validateAddress(address) {
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
        }).then((address) => {
            address = address.trim();
            if (!validateAddress(address)) {
                vscode.window.showErrorMessage('Invalid memory address entered');
                reporting_1.default.sendEvent('Examine Memory', 'Invalid Address', address);
                return;
            }
            vscode.window.showInputBox({
                placeHolder: 'Enter a constant value. Prefix with 0x for hexidecimal format.',
                ignoreFocusOut: true,
                prompt: 'Length'
            }).then((length) => {
                length = length.trim();
                if (!validateValue(length)) {
                    vscode.window.showErrorMessage('Invalid length entered');
                    reporting_1.default.sendEvent('Examine Memory', 'Invalid Length', length);
                    return;
                }
                reporting_1.default.sendEvent('Examine Memory', 'Valid', `${address}-${length}`);
                const timestamp = new Date().getTime();
                const addrEnc = encodeURIComponent(`${address}`);
                // tslint:disable-next-line:max-line-length
                vscode.workspace.openTextDocument(vscode.Uri.parse(`examinememory:///Memory%20[${addrEnc},${length}].cdmem?address=${addrEnc}&length=${length}&timestamp=${timestamp}`))
                    .then((doc) => {
                    vscode.window.showTextDocument(doc, { /* viewColumn: 2,*/ preview: false });
                    reporting_1.default.sendEvent('Examine Memory', 'Used');
                }, (error) => {
                    vscode.window.showErrorMessage(`Failed to examine memory: ${error}`);
                    reporting_1.default.sendEvent('Examine Memory', 'Error', error.toString());
                });
            }, (error) => {
            });
        }, (error) => {
        });
    }
    addBreakpoint(bkp) {
        const bkpList = [];
        bkpList.push(new vscode.SourceBreakpoint(new vscode.Location(vscode.Uri.parse(bkp.file), new vscode.Position(bkp.line, 0))));
        vscode.debug.addBreakpoints(bkpList);
    }
    removeBreakpoint(bkp) {
        const found = vscode.debug.breakpoints.filter(bp => {
            if (bp instanceof vscode.SourceBreakpoint) {
                const url = bp.location.uri.toString();
                const line = bp.location.range.start.line;
                if ((bkp.line) === line) {
                    let sourcepath = bkp.file;
                    if (path.relative(sourcepath, url) === "") {
                        return true;
                    }
                }
            }
            return false;
        });
        vscode.debug.removeBreakpoints(found);
    }
    removeIncorrectBreakpoint(bkpList) {
        return __awaiter(this, void 0, void 0, function* () {
            let info = "";
            const found = vscode.debug.breakpoints.filter(bp => {
                if (bp instanceof vscode.SourceBreakpoint) {
                    const url = bp.location.uri.toString();
                    const line = bp.location.range.start.line;
                    for (let i = 0; i < bkpList.length; i++) {
                        if ((bkpList[i].line - 1) === line) {
                            let sourcepath = bkpList[i].file;
                            if (path.relative(sourcepath, url) === "") {
                                info += sourcepath + " line: " + bkpList[i].line + "; \n";
                                return true;
                            }
                        }
                    }
                }
                return false;
            });
            vscode.window.showWarningMessage(`Удалить некорректные точки остановки (${info})?`, 'Да', 'Нет').then((choice) => __awaiter(this, void 0, void 0, function* () {
                if (choice === "Да") {
                    for (let i = 0; i < found.length; i++) {
                        let removeBkp = [];
                        removeBkp.push(found[i]);
                        yield vscode.debug.removeBreakpoints(removeBkp);
                    }
                }
            }));
        });
    }
    // Peripherals
    peripheralsUpdateNode(node) {
        node.performUpdate().then((result) => {
            if (result) {
                this.peripheralProvider.refresh();
                reporting_1.default.sendEvent('Peripheral View', 'Update Node');
            }
        }, (error) => {
            vscode.window.showErrorMessage(`Unable to update value: ${error.toString()}`);
        });
    }
    peripheralsCopyValue(node) {
        const cv = node.getCopyValue();
        if (cv) {
            vscode.env.clipboard.writeText(cv).then(() => {
                reporting_1.default.sendEvent('Peripheral View', 'Copy Value');
            });
        }
    }
    peripheralsSetFormat(node) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield vscode.window.showQuickPick([
                { label: 'Auto', description: 'Automatically choose format (Inherits from parent)', value: common_1.NumberFormat.Auto },
                { label: 'Hex', description: 'Format value in hexidecimal', value: common_1.NumberFormat.Hexidecimal },
                { label: 'Decimal', description: 'Format value in decimal', value: common_1.NumberFormat.Decimal },
                { label: 'Binary', description: 'Format value in binary', value: common_1.NumberFormat.Binary }
            ]);
            node.format = result.value;
            this.peripheralProvider.refresh();
            reporting_1.default.sendEvent('Peripheral View', 'Set Format', result.label);
        });
    }
    peripheralsForceRefresh(node) {
        return __awaiter(this, void 0, void 0, function* () {
            node.getPeripheral().updateData().then((e) => {
                this.peripheralProvider.refresh();
            });
        });
    }
    // Registers
    registersCopyValue(node) {
        const cv = node.getCopyValue();
        if (cv) {
            vscode.env.clipboard.writeText(cv).then(() => {
                reporting_1.default.sendEvent('Register View', 'Copy Value');
            });
        }
    }
    // Установка значения выбранного регистра
    registersSetValue(node) {
        return __awaiter(this, void 0, void 0, function* () {
            const value = yield vscode.window.showInputBox({
                value: node.getCopyValue(),
                ignoreFocusOut: true,
                prompt: 'Value of register "' + node.name + '"'
            });
            vscode.debug.activeDebugSession.customRequest('set-register', { name: node.name, value: value }).then(() => {
                this.registerProvider.refresh();
            });
        });
    }
    getSVDFile(device) {
        const entry = this.SVDDirectory.find((de) => de.expression.test(device));
        return entry ? entry.path : null;
    }
    initializeSWO(args) {
        if (!this.swosource) {
            vscode.window.showErrorMessage('Tried to initialize SWO Decoding without a SWO data source');
            return;
        }
        this.swo = new core_1.SWOCore(this.swosource, args, this.context.extensionPath);
    }
    debugSessionStarted(session) {
        // Удаляем все старые строчки с "отладочной" подсветкой 
        this.selectedLineDecorationType.dispose();
        if (session.type !== 'module-debug') {
            return;
        }
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
            reporting_1.default.beginSession(args);
            this.registerProvider.debugSessionStarted();
            //this.peripheralProvider.debugSessionStarted(svdfile ? svdfile : null);
            this.disassemblyProvider.debugSessionStarted();
            if (this.swosource) {
                this.initializeSWO(args);
            }
        }, (error) => {
            // TODO: Error handling for unable to get arguments
        });
    }
    debugSessionTerminated(session) {
        if (session.type !== 'module-debug') {
            return;
        }
        reporting_1.default.endSession();
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
    activeEditorChanged(editor) {
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
                        if (doc.fileName === this.DisassemblyActiveFile) {
                            editor.setDecorations(this.selectedLineDecorationType, [new vscode.Range(this.DisassemblyActiveLine, 0, this.DisassemblyActiveLine, 0)]);
                        }
                    });
                    reporting_1.default.sendEvent('Show disassembly', 'Used');
                }, (error) => {
                    vscode.window.showErrorMessage(`Failed to show disassembly: ${error}`);
                    reporting_1.default.sendEvent('Show disassembly', 'Error', error.toString());
                });
                // }
            }
        }
    }
    receivedCustomEvent(e) {
        if (vscode.debug.activeDebugSession && vscode.debug.activeDebugSession.type !== 'module-debug') {
            return;
        }
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
    receivedStopEvent(e) {
        //this.peripheralProvider.debugStopped();
        this.registerProvider.debugStopped();
        this.disassemblyProvider.debugStopped();
        vscode.workspace.textDocuments.filter((td) => td.fileName.endsWith('.cdmem'))
            .forEach((doc) => { this.memoryProvider.update(doc); });
        if (this.swo) {
            this.swo.debugStopped();
        }
    }
    // Событие продолжения выполнения сессии
    receivedContinuedEvent(e) {
        //this.peripheralProvider.debugContinued();
        this.registerProvider.debugContinued();
        this.disassemblyProvider.debugContinued();
        this.disassemblyProvider.canLoad = true;
        //vscode.commands.executeCommand('module-debug.openCurrentDisassembly');
        if (this.swo) {
            this.swo.debugContinued();
        }
    }
    //Открытие текущего куска кода дизассемблера
    openCurrentDisassembly() {
        return __awaiter(this, void 0, void 0, function* () {
            this.selectedLineDecorationType.dispose();
            this.selectedLineDecorationType = vscode.window.createTextEditorDecorationType({
                isWholeLine: true,
                backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
                overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground')
            });
            vscode.debug.activeDebugSession.customRequest('load-current-disassembly').then((result) => __awaiter(this, void 0, void 0, function* () {
                try {
                    vscode.workspace.openTextDocument(vscode.Uri.parse(result.url))
                        .then((doc) => {
                        this.DisassemblyActiveFile = doc.fileName;
                        this.DisassemblyActiveLine = result.line - 1;
                        vscode.window.showTextDocument(doc, { /*viewColumn: 2,*/ preview: false }).then((editor) => {
                            editor.setDecorations(this.selectedLineDecorationType, [new vscode.Range(this.DisassemblyActiveLine, 0, this.DisassemblyActiveLine, 0)]);
                        });
                        //vscode.window.activeTextEditor.setDecorations(this.selectedLineDecorationType,  [new vscode.Range(result.line, 0, result.line, 0)]);
                        reporting_1.default.sendEvent('Show Disassembly', 'Used');
                    }, (error) => {
                        vscode.window.showErrorMessage(`Failed to show disassembly: ${error}`);
                        reporting_1.default.sendEvent('Show Disassembly', 'Error', error.toString());
                    });
                }
                catch (error) {
                    vscode.window.showErrorMessage(error);
                }
            }), (error) => {
                vscode.window.showErrorMessage(error);
            });
        });
    }
    //Событие получено
    receivedEvent(e) {
        reporting_1.default.sendEvent(e.body.category, e.body.action, e.body.label, e.body.parameters);
    }
    receivedSWOConfigureEvent(e) {
        if (e.body.type === 'socket') {
            this.swosource = new socket_1.SocketSWOSource(e.body.port);
            reporting_1.default.sendEvent('SWO', 'Source', 'Socket');
        }
        else if (e.body.type === 'fifo') {
            this.swosource = new fifo_1.FifoSWOSource(e.body.path);
            reporting_1.default.sendEvent('SWO', 'Source', 'FIFO');
        }
        else if (e.body.type === 'file') {
            this.swosource = new file_1.FileSWOSource(e.body.path);
            reporting_1.default.sendEvent('SWO', 'Source', 'File');
        }
        else if (e.body.type === 'serial') {
            this.swosource = new serial_1.SerialSWOSource(e.body.device, e.body.baudRate, this.context.extensionPath);
            reporting_1.default.sendEvent('SWO', 'Source', 'Serial');
        }
        if (vscode.debug.activeDebugSession) {
            vscode.debug.activeDebugSession.customRequest('get-arguments').then((args) => {
                this.initializeSWO(args);
            });
        }
    }
    receivedAdapterOutput(e) {
        if (!this.adapterOutputChannel) {
            this.adapterOutputChannel = vscode.window.createOutputChannel('Adapter Output');
            this.adapterOutputChannel.show();
        }
        else if (this.clearAdapterOutputChannel) {
            this.adapterOutputChannel.clear();
        }
        this.clearAdapterOutputChannel = false;
        let output = e.body.content;
        if (!output.endsWith('\n')) {
            output += '\n';
        }
        this.adapterOutputChannel.append(output);
    }
}
exports.ModuleDebugExtension = ModuleDebugExtension;
function activate(context) {
    return new ModuleDebugExtension(context);
}
exports.activate = activate;
function deactivate() {
    // nothing to do
}
exports.deactivate = deactivate;
class ModuleConfigurationProvider {
    /**
     * Massage a debug configuration just before a debug session is being launched,
     * e.g. add all missing attributes to the debug configuration.
     */
    resolveDebugConfiguration(folder, config, token) {
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
                return undefined; // abort launch
            });
        }
        return config;
    }
}
class DebugAdapterExecutableFactory {
    // The following use of a DebugAdapter factory shows how to control what debug adapter executable is used.
    // Since the code implements the default behavior, it is absolutely not neccessary and we show it here only for educational purpose.
    createDebugAdapterDescriptor(_session, executable) {
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
class GDBDebugAdapterDescriptorFactory {
    createDebugAdapterDescriptor(session, executable) {
        if (!this.server) {
            // start listening on a random port
            this.server = Net.createServer((socket) => {
                const session = new gdb_1.GDBDebugSession(true);
                session.setRunAsServer(true);
                session.start(socket, socket);
            }).listen(0);
        }
        // make VS Code connect to debug server
        return new vscode.DebugAdapterServer(this.server.address().port);
    }
    dispose() {
        if (this.server) {
            this.server.close();
        }
    }
}
class InlineDebugAdapterFactory {
    createDebugAdapterDescriptor(_session) {
        return new vscode.DebugAdapterInlineImplementation(new gdb_1.GDBDebugSession(true));
    }
}
//# sourceMappingURL=extension.js.map