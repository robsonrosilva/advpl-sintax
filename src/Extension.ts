import {
    Uri,
    languages,
    workspace,
    window,
    ExtensionContext,
    commands,
    Diagnostic,
    Range
} from 'vscode';
import { MergeAdvpl } from './Merge';
import { ValidaAdvpl, Fonte, ValidaProjeto } from 'analise-advpl';
import { debuglog } from 'util';
import { ItemModel } from 'analise-advpl/lib/models/ItemProject';
//Cria um colection para os erros ADVPL
const collection = languages.createDiagnosticCollection('advpl');

let projeto: ValidaProjeto;
let listaURI: Uri[] = [];
let comentFontPad: string[] = workspace
    .getConfiguration('advpl-sintaxe')
    .get('comentFontPad') as string[];
if (!comentFontPad) {
    comentFontPad = [''];
    window.showInformationMessage(
        localize('extension.noCritizeComment', 'Do not critize coments!')
    );
}
const vscodeOptions = JSON.parse(
    process.env.VSCODE_NLS_CONFIG
).locale.toLowerCase();

let validaAdvpl = new ValidaAdvpl(comentFontPad, vscodeOptions, false);
validaAdvpl.ownerDb = workspace
    .getConfiguration('advpl-sintaxe')
    .get('ownerDb');
validaAdvpl.empresas = workspace
    .getConfiguration('advpl-sintaxe')
    .get('empresas');

if (!validaAdvpl.ownerDb) {
    validaAdvpl.ownerDb = [];
}
if (!validaAdvpl.empresas) {
    validaAdvpl.empresas = [];
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
    //debuglog(localize('extension.activeMessage', 'não funcionou'));
    window.showInformationMessage(
        localize('extension.activeMessage', 'Active ADVPL Validation!')
    );
    workspace.onDidChangeTextDocument(validaFonte);

    //Adiciona comando de envia para Validação
    context.subscriptions.push(
        commands.registerCommand('advpl-sintaxe.gitValidacao', () => {
            let mergeAdvpl = new MergeAdvpl();
            let branchAtual = mergeAdvpl.repository.headLabel;
            
            mergeAdvpl.merge(mergeAdvpl.branchTeste).then(()=>{
                mergeAdvpl.repository.checkout(branchAtual);
                validaProjeto();
            }).catch((erro:string)=>{
                window.showErrorMessage(erro);
                mergeAdvpl.repository.checkout(branchAtual);
                validaProjeto();
            });
        })
    );
    //Adiciona comando de envia para Release
    context.subscriptions.push(
        commands.registerCommand('advpl-sintaxe.gitRelease', () => {
            let mergeAdvpl = new MergeAdvpl();
            let branchAtual = mergeAdvpl.repository.headLabel;

            mergeAdvpl.merge(mergeAdvpl.branchHomol).then(() => {
                mergeAdvpl.repository.checkout(branchAtual);
                validaProjeto();
            }).catch((erro: string) => {
                window.showErrorMessage(erro);
                mergeAdvpl.repository.checkout(branchAtual);
                validaProjeto();
            });
        })
    );
    //Adiciona comando de envia para master
    context.subscriptions.push(
        commands.registerCommand('advpl-sintaxe.gitMaster', () => {
            let mergeAdvpl = new MergeAdvpl();
            let branchAtual = mergeAdvpl.repository.headLabel;

            mergeAdvpl.merge(mergeAdvpl.branchProdu).then(() => {
                mergeAdvpl.repository.checkout(branchAtual);
                validaProjeto();
            }).catch((erro: string) => {
                window.showErrorMessage(erro);
                mergeAdvpl.repository.checkout(branchAtual);
                validaProjeto();
            });
        })
    );
    //Adiciona comando de envia para master
    context.subscriptions.push(
        commands.registerCommand('advpl-sintaxe.validaProjeto', () => {
            try {
                validaProjeto();
            } catch (e) {
                window.showInformationMessage(e.stdout);
            }
        })
    );

    //Adiciona comando de Atualiza Branch
    context.subscriptions.push(
        commands.registerCommand('advpl-sintaxe.atualizaBranch', () => {
            let mergeAdvpl = new MergeAdvpl();
            let branchAtual = mergeAdvpl.repository.headLabel;
            mergeAdvpl.atualiza().then((message:string)=>{
                window.showInformationMessage(message);
                mergeAdvpl.repository.checkout(branchAtual);
                validaProjeto();
            }).catch((erro: string) => {
                window.showErrorMessage(erro);
                mergeAdvpl.repository.checkout(branchAtual);
                validaProjeto();
            });
        })
    );

    //Adiciona comando de limeza de branches
    context.subscriptions.push(
        commands.registerCommand('advpl-sintaxe.cleanBranches', () => {
            let mergeAdvpl = new MergeAdvpl();
            let branchAtual = mergeAdvpl.repository.headLabel;
            mergeAdvpl.limpaBranches().then((message: string) => {
                window.showInformationMessage(message);
            }).catch((erro: string) => {
                window.showErrorMessage(erro);
            });
        })
    );

    if (
        workspace.getConfiguration('advpl-sintaxe').get('validaProjeto') !== false
    ) {
        let startTime: any = new Date();

        validaProjeto();

        let endTime: any = new Date();
        var timeDiff = endTime - startTime; //in ms
        // strip the ms
        timeDiff /= 1000;

        // get seconds
        var seconds = Math.round(timeDiff);
        debuglog('Tempo gasto validacao ' + seconds + ' seconds');
    }
}
async function validaFonte(editor: any) {
    //verifica se a linguagem é ADVPL
    if (editor && editor.document.languageId === 'advpl' && editor.document.getText()) {
        validaAdvpl.validacao(editor.document.getText(), editor.document.uri.fsPath);
        //verifica se o fonte já existe no projeto se não adiciona
        let pos = projeto.projeto.map(function (e) {
            return editor.document.urifsPath;
        });
        let posicao = pos.indexOf(editor.document.uri.fsPath);
        let itemProjeto = new ItemModel();
        itemProjeto.content = validaAdvpl.conteudoFonte;
        itemProjeto.errors = validaAdvpl.aErros;
        itemProjeto.fonte = validaAdvpl.fonte;

        let projetoOld: ValidaProjeto;

        if (posicao === -1) {
            projeto.projeto.push(itemProjeto);
        } else {
            projeto.projeto[posicao] = itemProjeto;
        }

        projeto.verificaDuplicados().then(() => {
            // atualiza os erros
            projeto.projeto.forEach((item: ItemModel) => {
                let fonte: Fonte = item.fonte;
                let file = getUri(fonte.fonte);

                //Atualiza as mensagens do colection
                collection.delete(file);
                collection.set(file, errorVsCode(item.errors));
            });
        });
    }
}

function errorVsCode(aErros: any) {
    let vsErros: any = [];
    aErros.forEach(erro => {
        vsErros.push(
            new Diagnostic(
                new Range(erro.startLine, 0, erro.endLine, 0),
                erro.message,
                erro.severity
            )
        );
    });
    return vsErros;
}

function getUri(file: string): Uri {
    let uri: Uri;
    let fileName: string = file
        .replace(/\\/g, '/')
        .toUpperCase();
    let listName: string;

    // busca o arquivo
    uri = Uri.file(file);

    // busca na lista de uri
    if (!uri) {
        listaURI.forEach((item: Uri) => {
            listName = item.path
                .replace(/\\/g, '/')
                .toUpperCase();
            if (listName === fileName) {
                uri = item;
            }
        });
    }

    return uri;
}

// this method is called when your extension is deactivated
export function deactivate() { }


async function validaProjeto(
) {
    // prepara o objeto de validação
    let validaPrj: ValidaProjeto = new ValidaProjeto(validaAdvpl.comentFontPad, vscodeOptions);

    validaPrj.empresas = validaAdvpl.empresas;
    validaPrj.ownerDb = validaAdvpl.ownerDb;
    validaPrj.local = vscodeOptions;

    validaPrj.validaProjeto(workspace.rootPath).then((objProjeto: ValidaProjeto) => {
        // se for validar o projeto limpa todas as críticas dos arquivos
        listaURI.forEach((uri: Uri) => {
            collection.delete(uri);
        });

        listaURI = [];
        objProjeto.projeto.forEach((item: ItemModel) => {
            let fonte: Fonte = item.fonte;
            let file = getUri(fonte.fonte);

            listaURI.push(file);

            //Atualiza as mensagens do colection
            collection.set(file, errorVsCode(item.errors));
        });

        projeto = validaPrj;

        //fileSystem.writeFileSync('d:\\extensao.json', JSON.stringify(validaPrj), {
        //  mode: 0o755
        //});
    });
}


function localize(key: string, text?: string) {
    const vscodeOptions = JSON.parse(
        process.env.VSCODE_NLS_CONFIG
    ).locale.toLowerCase();
    let i18n = require('i18n');
    let locales = ['en', 'pt-br'];
    i18n.configure({
        locales: locales,
        directory: __dirname + '\\locales'
    });
    i18n.setLocale(locales.indexOf(vscodeOptions) + 1 ? vscodeOptions : 'en');
    return i18n.__(key);
}
