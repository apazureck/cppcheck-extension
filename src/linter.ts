/**
 * LINTER.TS
 * ---------
 * Parses cppcheck output and adds linting hints to files.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { runOnWorkspace } from './analyzer';

type SeverityLevel = 'Error' | 'Warning' | 'Information' | 'Hint' | 'None';
interface SeverityMaps {
    error: SeverityLevel;
    warning: SeverityLevel;
    style: SeverityLevel;
    performance: SeverityLevel;
    portability: SeverityLevel;
    information: SeverityLevel;
}

function getCorrectFileName(p: string): string {
    if (!fs.existsSync(p)) {
        p = path.join(vscode.workspace.rootPath, p);
        if (!fs.existsSync(p)) {
            return null;
        }
    }
    return p;
}

function cppcheckSeverityToDiagnosticSeverity(severity: string, config: SeverityMaps): vscode.DiagnosticSeverity {
    const cpplevel = (<any>config)[severity] as string;
    return (<any>vscode.DiagnosticSeverity)[cpplevel] as vscode.DiagnosticSeverity;
}

export function Lint(diagnosticCollection: vscode.DiagnosticCollection, config: { [key: string]: any }) {
    diagnosticCollection.clear();

    // 1 = path, 2 = line, 3 = severity, 4 = message
    let regex = /^(?:\[([\w:\\/.-]+):(\d+)]: )?\((\w+)\) ([\s\S]+?)\n/gm;
    let cppcheckOutput = runOnWorkspace(config, vscode.workspace.rootPath);
    let regexArray: RegExpExecArray;
    let fileData: { [key: string]: RegExpExecArray[] } = {};
    while (regexArray = regex.exec(cppcheckOutput)) {
        if (regexArray[1] === undefined || regexArray[2] === undefined || regexArray[3] === undefined || regexArray[4] === undefined) {
            continue;
        }

        let fileName = getCorrectFileName(regexArray[1]);
        if (!(fileName in fileData)) {
            fileData[fileName] = [];
        }
        fileData[fileName].push(regexArray);
    }

    for (let fileName in fileData) {
        vscode.workspace.openTextDocument(fileName).then((doc: vscode.TextDocument) => {
            let diagnostics: vscode.Diagnostic[] = [];
            for (let index = 0; index < fileData[fileName].length; index++) {
                let array = fileData[fileName][index];
                let line = Number(array[2]);
                let severity = array[3];
                let message = array[4];

                if (line > 0) {
                    line--;
                }

                let l = doc.lineAt(line);
                let r = new vscode.Range(line, l.text.match(/\S/).index, line, l.text.length);
                const level = cppcheckSeverityToDiagnosticSeverity(severity, config['severityLevels'] as SeverityMaps);
                if (level !== undefined) {
                    let d = new vscode.Diagnostic(r, `(${severity}) ${message}`, level);
                    d.source = 'cppcheck';
                    diagnostics.push(d);
                }
            }
            diagnosticCollection.set(doc.uri, diagnostics);
        });
    }
}