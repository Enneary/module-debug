import * as vscode from 'vscode';
import { hexFormat } from './utils';

export class MemoryContentProvider implements vscode.TextDocumentContentProvider {
    // tslint:disable-next-line:variable-name
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidChange = this._onDidChange.event;
    private k = 8; // количество отображаемых ячеек
    private n = 4; // количество байт в одной ячейке памяти

    public provideTextDocumentContent(uri: vscode.Uri): Thenable<string> {
        return new Promise((resolve, reject) => {
            const highlightAt = -1;
            const query = this.parseQuery(uri.query);

            const addressExpr = query['address']; // начальный адрес
            const length: number = this.parseHexOrDecInt(query['length']); // количество отображаемых ячеек памяти

            vscode.debug.activeDebugSession.customRequest('read-memory', { address: addressExpr, length: length || 32 }).then((data) => {
                const bytes = data.bytes;
                const address = this.parseHexOrDecInt(data.startAddress);
                let lineAddress = address - (address % this.k); // отображаем по 8 ячеек памяти в строке
                const offset = address - lineAddress;

                let output = '';
                output += '  Offset:    00       01       02       03       04       05       06       07     	\n';
                output += hexFormat(lineAddress, 8, false) + ': ';

                for (let i = 0; i < offset; i++) { output += ' '.repeat( this.k + 1); }

                let byte;

                for (let i = 0; i < length*this.n; i += this.n ) {

                    for (let j = 0; j < this.n; j++){
                        byte = bytes[ i+j ];
                        output += hexFormat(byte, 2, false).toUpperCase();
                    }
                    output += ' ';

                    if ((address + i / this.n) % (this.k ) === (this.k - 1) && (i + this.n) < (length*this.n - 1)) {
                        output += '  ';
                        output += '\n';
                        lineAddress += this.k;
                        output += hexFormat(lineAddress, 8, false) + ': ';
                    }
                }

                const endaddress = address + length;
                const extra = (this.k - (endaddress % this.k)) % this.k;
                for (let i = 0; i < extra; i++) { output += ' '.repeat( this.k + 1); }
                output += '  ';
                output += '\n';

                resolve(output);
            }, (error) => {
                const msg = error.message || '';
                vscode.window.showErrorMessage(`Unable to read memory from ${addressExpr} of length ${hexFormat(length, 8)}: ${msg}`);
                reject(error.toString());
            });
        });
    }

    public update(doc: vscode.TextDocument) {
        this._onDidChange.fire(doc.uri);
    }

    private parseQuery(queryString) {
        const query = {};
        function addToQuery(str: string) {
            const pair = str.split('=');
            const name = pair.shift();      // First part is name
            query[name] = pair.join('=');   // Rest is the value
        }
        // THe API has already decoded the Uri or else we could have just split on '&' and '=' and be order-independent
        // We know that we will have three parameters and it is the first one that will have complex stuff in it
        const pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&');
        addToQuery(pairs.pop());            // get timestamp
        addToQuery(pairs.pop());            // get length
        addToQuery(pairs.join('&'));        // Rest is the addr-expression
        return query;
    }

    private parseHexOrDecInt(str: string): number {
        return str.startsWith('0x') ? parseInt(str.substring(2), 16) : parseInt(str, 10);
    }

    /**
     * The code below took significant portions with small modification 
     * from the HexDump extension, which has the following license and copyright:
     * The MIT License (MIT)
     * **Copyright © 2016 Stef Levesque**
     */
    public firstBytePos = 10;
    public lastBytePos: number = this.firstBytePos + this.n * 2 * this.k - 1;
    // public firstAsciiPos: number = this.lastBytePos + 3;
    // public lastAsciiPos: number = this.firstAsciiPos + 16;

    private getOffset(pos: vscode.Position): number {
        // check if within a valid section
        if (pos.line < 1 || pos.character < this.firstBytePos) {
            return;
        }
    
        let offset = (pos.line - 1) * this.k;
        const s = pos.character - this.firstBytePos;
        if (pos.character >= this.firstBytePos && pos.character <= this.lastBytePos) {
            // byte section
            offset += Math.floor(s / ( this.n * 2 + 1));
        }/* else if (pos.character >= this.firstAsciiPos) {
            // ascii section
            offset += (pos.character - this.firstAsciiPos);
        }*/
        return offset;
    }

    private getPosition(offset: number, ascii: boolean = false): vscode.Position {
        const row = 1 + Math.floor(offset / this.k);
        let column = offset % this.k;


        column = this.firstBytePos + column * (this.n * 2 + 1);
    
        return new vscode.Position(row, column);
    }

    private getRanges(startOffset: number, endOffset: number, ascii: boolean): vscode.Range[] {
        const startPos = this.getPosition(startOffset, ascii);
        let endPos = this.getPosition(endOffset, ascii);
        endPos = new vscode.Position(endPos.line, endPos.character +  this.n*2);
    
        const ranges = [];
        const firstOffset = this.firstBytePos; // ascii ? this.firstAsciiPos : this.firstBytePos;
        const lastOffset = this.lastBytePos; // ascii ? this.lastAsciiPos : this.lastBytePos;
        for (let i = startPos.line; i <= endPos.line; ++i) {
            const start = new vscode.Position(i, (i === startPos.line ? startPos.character : firstOffset));
            const end = new vscode.Position(i, (i === endPos.line ? endPos.character : lastOffset));
            ranges.push(new vscode.Range(start, end));
        }
 
        return ranges;
    }
    
    private checkValid(value: string): boolean{
        let r = new RegExp(/[\dA-Fa-f]{8}/g);
        return r.test(value);
    }

    private getAddrRange(line: number): vscode.Range {
        const start = new vscode.Position(line, 0);
        const end = new vscode.Position(line, 8);
        return new vscode.Range(start, end);
    }


    private smallDecorationType = vscode.window.createTextEditorDecorationType({
        borderWidth: '1px',
        borderStyle: 'solid',
        overviewRulerColor: 'blue',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: { // this color will be used in light color themes
            borderColor: 'darkblue'
        },
        dark: { // this color will be used in dark color themes
            borderColor: 'lightblue'
        }
    });

    public handleSelectionChange(e: vscode.TextEditorSelectionChangeEvent) {
        const numLine = e.textEditor.document.lineCount;
        if (e.selections[0].start.line + 1 === numLine ||
            e.selections[0].end.line + 1 === numLine) {
            e.textEditor.setDecorations(this.smallDecorationType, []);
            return;
        }
        const startOffset = this.getOffset(e.selections[0].start);
        const endOffset = this.getOffset(e.selections[0].end);
        if (typeof startOffset === 'undefined' ||
            typeof endOffset === 'undefined') {
            e.textEditor.setDecorations(this.smallDecorationType, []);
            return;
        }
        
        let ranges = this.getRanges(startOffset, endOffset, false);
        e.textEditor.setDecorations(this.smallDecorationType, ranges);

        //если выбрана одна ячейка памяти
        if(startOffset === endOffset){
            let currentValue = e.textEditor.document.getText(ranges[0]);
            let lineAddrStr = e.textEditor.document.getText(this.getAddrRange(e.selections[0].start.line));
            let Offset = Math.floor((e.selections[0].start.character - this.firstBytePos) / ( this.n * 2 + 1))
            let currentAddr = parseInt(lineAddrStr,16) + Offset;
            vscode.window.showInputBox({
                placeHolder: 'Enter a valid value of byte. Use hexidecimal numbers',
                value: currentValue,
                ignoreFocusOut: true,
                prompt: 'Change memory value'
            }).then(
                (value) => {
                   if(this.checkValid(value)){
                        vscode.debug.activeDebugSession.customRequest('write-memory', { address: currentAddr, data: value }).then((data) => {
                            vscode.workspace.textDocuments.filter((td) => td.fileName.endsWith('.cdmem'))
                            .forEach((doc) => { this.update(doc); });
                        });
                   }
            });
        }
    }
    public handleSelection(e: vscode.TextEditorSelectionChangeEvent) {
        const numLine = e.textEditor.document.lineCount;
        if (e.selections[0].start.line + 1 === numLine ||
            e.selections[0].end.line + 1 === numLine) {
            e.textEditor.setDecorations(this.smallDecorationType, []);
            return;
        }
        const startOffset = this.getOffset(e.selections[0].start);
        const endOffset = this.getOffset(e.selections[0].end);
        if (typeof startOffset === 'undefined' ||
            typeof endOffset === 'undefined') {
            e.textEditor.setDecorations(this.smallDecorationType, []);
            return;
        }
        
        let ranges = this.getRanges(startOffset, endOffset, false);
        ranges = ranges.concat(this.getRanges(startOffset, endOffset, true));
        e.textEditor.setDecorations(this.smallDecorationType, ranges);
    }
}
