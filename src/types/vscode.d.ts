declare module 'vscode' {
  export interface Memento {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: any): Promise<void> | Thenable<void>;
  }

  export interface SecretStorage {
    store(key: string, value: string): Promise<void> | Thenable<void>;
    get(key: string): Promise<string | undefined> | Thenable<string | undefined>;
    delete(key: string): Promise<void> | Thenable<void>;
  }

  export interface ExtensionContext {
    globalState: Memento;
    secrets: SecretStorage;
    subscriptions: { dispose(): any }[];
  }

  export interface Disposable {
    dispose(): any;
  }

  export type Thenable<T> = Promise<T>;

  export const window: any;
  export const commands: any;

  export class TreeItem {
    constructor(label: string, state?: any);
    label: string;
    collapsibleState?: any;
  }

  export enum TreeItemCollapsibleState {
    Collapsed = 0,
    Expanded = 1,
    None = 2
  }

  export interface TreeDataProvider<T> {
    onDidChangeTreeData: any;
    getTreeItem(element: T): any;
    getChildren(element?: T): any;
  }

  export function createOutputChannel(name: string): any;
}
