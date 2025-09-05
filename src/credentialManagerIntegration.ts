import * as vscode from 'vscode';
import { getOutputChannel } from './logger';

export type ConnectionType = 'connect' | 'schema-registry';

export interface ConnectionMeta {
  id: string;
  name: string;
  url: string;
  type: ConnectionType;
  authType?: 'none' | 'basic' | 'bearer';
  username?: string;
}

/**
 * Integration service to interact with the Credential Manager extension
 */
export class CredentialManagerIntegration {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Get all connections from the Credential Manager
   */
  async listConnections(): Promise<ConnectionMeta[]> {
    try {
      const config = (vscode as any).workspace.getConfiguration();
      const connections = config.get('credentialManager.connections') as ConnectionMeta[];
      
      if (connections && connections.length > 0) {
        getOutputChannel().appendLine(`[credentialManager] Found ${connections.length} connections`);
        // Filter for only connect and schema-registry connections
        const kafkaConnections = connections.filter(conn => 
          conn.type === 'connect' || conn.type === 'schema-registry'
        );
        getOutputChannel().appendLine(`[credentialManager] Filtered to ${kafkaConnections.length} Kafka-related connections`);
        return kafkaConnections;
      }

      getOutputChannel().appendLine('[credentialManager] No connections found');
      return [];
    } catch (error: any) {
      getOutputChannel().appendLine(`[credentialManager] Error listing connections: ${error.message}`);
      return [];
    }
  }

  /**
   * Get a secret (password/token) for a connection from VS Code's secure storage
   */
  async getSecret(connectionId: string): Promise<string | undefined> {
    try {
      const secret = await this.context.secrets.get(`credentialManager.secret.${connectionId}`);
      if (secret) {
        getOutputChannel().appendLine(`[credentialManager] Retrieved secret for connection ${connectionId}`);
        return secret;
      }
      
      getOutputChannel().appendLine(`[credentialManager] No secret found for connection ${connectionId}`);
      return undefined;
    } catch (error: any) {
      getOutputChannel().appendLine(`[credentialManager] Error getting secret for ${connectionId}: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Build authentication headers for a connection
   */
  async buildAuthHeaders(connection: ConnectionMeta): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};
    
    if (connection.authType === 'basic' && connection.username) {
      const secret = await this.getSecret(connection.id);
      if (secret) {
        headers['Authorization'] = 'Basic ' + Buffer.from(connection.username + ':' + secret).toString('base64');
        getOutputChannel().appendLine(`[credentialManager] Built Basic auth headers for ${connection.name}`);
      }
    } else if (connection.authType === 'bearer') {
      const secret = await this.getSecret(connection.id);
      if (secret) {
        headers['Authorization'] = `Bearer ${secret}`;
        getOutputChannel().appendLine(`[credentialManager] Built Bearer auth headers for ${connection.name}`);
      }
    }
    
    return headers;
  }

  /**
   * Check if the Credential Manager extension is available
   */
  isCredentialManagerAvailable(): boolean {
    const extension = (vscode as any).extensions.getExtension('IuliusHutuleac.credential-manager');
    const isAvailable = extension !== undefined;
    
    if (!isAvailable) {
      getOutputChannel().appendLine('[credentialManager] Credential Manager extension not found or not activated');
    } else {
      getOutputChannel().appendLine('[credentialManager] Credential Manager extension is available');
    }
    
    return isAvailable;
  }

  /**
   * Show a message to install the Credential Manager if it's not available
   */
  async promptInstallCredentialManager(): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      'The Kafka Credential Manager extension is required for managing connections.',
      'Install Extension',
      'Cancel'
    );

    if (choice === 'Install Extension') {
      await vscode.commands.executeCommand(
        'extension.open',
        'IuliusHutuleac.credential-manager'
      );
    }
  }

  /**
   * Open the Credential Manager panel
   */
  async openCredentialManager(): Promise<void> {
    try {
      await vscode.commands.executeCommand('credentialManager.openConnectionManager');
      getOutputChannel().appendLine('[credentialManager] Opened Credential Manager');
    } catch (error: any) {
      getOutputChannel().appendLine(`[credentialManager] Error opening Credential Manager: ${error.message}`);
      
      if (!this.isCredentialManagerAvailable()) {
        await this.promptInstallCredentialManager();
      } else {
        vscode.window.showErrorMessage('Failed to open Credential Manager');
      }
    }
  }

  /**
   * Listen for configuration changes to refresh connections when they're updated
   */
  onConnectionsChanged(callback: () => void): vscode.Disposable {
    return (vscode as any).workspace.onDidChangeConfiguration((event: any) => {
      if (event.affectsConfiguration('credentialManager.connections')) {
        getOutputChannel().appendLine('[credentialManager] Connections configuration changed');
        callback();
      }
    });
  }
}
