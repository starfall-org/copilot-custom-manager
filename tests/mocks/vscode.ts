export class Uri {
    static file(path: string) {
        return new Uri(path);
    }
    constructor(public fsPath: string) {}
}

export const env = {
    appName: 'Visual Studio Code'
};

export const window = {
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showQuickPick: jest.fn(),
    showInputBox: jest.fn(),
    withProgress: jest.fn()
};

export const workspace = {
    openTextDocument: jest.fn(),
    showTextDocument: jest.fn()
};

export const commands = {
    registerCommand: jest.fn()
};
