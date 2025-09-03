# ⚠️ INSECURE PASSWORD STORAGE WARNING

## 🚨 SECURITY ALERT

**BY DEFAULT, this extension uses VS Code's secure secret storage for passwords, which is the recommended and secure approach.**

However, if you absolutely need passwords stored in `settings.json` (e.g., for automated deployments), you can enable this **INSECURE** mode.

## ⚠️ RISKS OF ENABLING INSECURE MODE

- **Passwords are stored as base64** - this is NOT encryption, just encoding
- **Anyone with file access can decode your passwords** easily
- **Passwords may be committed to Git** if you commit settings.json
- **Passwords appear in backups, logs, and shared workspaces**
- **Team members can see all passwords** in shared workspace settings

## 🔓 How to Enable Insecure Mode (NOT RECOMMENDED)

1. Set the environment variable before starting VS Code:
   ```bash
   # Windows PowerShell
   $env:CONNECT_ADMIN_ALLOW_INSECURE_PASSWORDS = "true"
   code .
   
   # Windows Command Prompt
   set CONNECT_ADMIN_ALLOW_INSECURE_PASSWORDS=true
   code .
   
   # Linux/macOS
   CONNECT_ADMIN_ALLOW_INSECURE_PASSWORDS=true code .
   ```

2. Restart VS Code and open the Connection Manager

3. When you save connections, passwords will now be stored in `settings.json` as base64

## 📄 Example settings.json with Insecure Passwords

```json
{
  "connectAdmin.connections": [
    {
      "id": "local-connect",
      "name": "Local Kafka Connect", 
      "url": "http://localhost:8083",
      "type": "connect",
      "authType": "basic",
      "username": "admin",
      "password": "cGFzc3dvcmQxMjM="  // ⚠️ This is just "password123" in base64!
    }
  ]
}
```

## 🔐 Recommended Secure Alternatives

Instead of storing passwords in settings.json, consider:

1. **Use VS Code's built-in secure storage** (default behavior)
2. **Environment variables** for automated deployments
3. **External secret management** (HashiCorp Vault, AWS Secrets Manager, etc.)
4. **CI/CD pipeline secrets** for automated environments
5. **Kubernetes secrets** for containerized deployments

## 🛡️ If You Must Use This Mode

If you absolutely must use this insecure mode:

1. **Never commit settings.json** to version control
2. **Add settings.json to .gitignore**
3. **Use different passwords** than your production systems
4. **Rotate passwords frequently**
5. **Limit file system access** to the workspace
6. **Use environment-specific configurations**

## 🔍 How to Decode Base64 (Shows Why It's Insecure)

Anyone can easily decode your passwords:

```bash
# Command line
echo "cGFzc3dvcmQxMjM=" | base64 -d
# Output: password123

# Online tools
# Just paste the base64 string into any online base64 decoder

# Programming languages
# Every language has simple base64 decode functions
```

**Remember: Base64 is encoding, NOT encryption!**
