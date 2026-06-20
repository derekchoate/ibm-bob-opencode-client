# IBM BOB Provider for OpenCode

A TypeScript/JavaScript provider that integrates **IBM BOB** as an LLM model source for [OpenCode](https://github.com/opencode-ai/opencode), using an OpenAI-compatible API format.

## Features

- OpenAI-compatible chat completions API
- Streaming responses (Server-Sent Events)
- **Two authentication methods:**
  - **API Key** - Simple bearer token authentication
  - **OAuth 2.0 PKCE** - Browser-based flow with automatic token refresh
- Configurable models, temperature, and tokens
- Environment variable support
- Full TypeScript type definitions

## Installation

```bash
npm install @derekchoate/ibm-bob-provider
```

Or add it to your OpenCode project:

```bash
cd /path/to/opencode
npm install @derekchoate/ibm-bob-provider
```

## Configuration

### API Key Authentication (Simple)

#### Environment Variables

Set the following environment variables:

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BOB_API_KEY` | Yes (if not using OAuth) | Your IBM BOB API key | - |
| `BOB_API_BASE_URL` | No | IBM BOB API base URL | `https://api.us-east.bob.ibm.com/inference/v1` |
| `BOB_MODEL` | No | Default model to use | `ibm-bob-default` |

#### OpenCode Configuration (API Key)

```json
{
  "provider": {
    "bob": {
      "type": "@derekchoate/ibm-bob-provider",
      "config": {
        "apiKey": "${BOB_API_KEY}",
        "apiBaseUrl": "https://api.us-east.bob.ibm.com/inference/v1",
        "model": "ibm-bob-default"
      }
    }
  },
  "models": {
    "default": "ibm-bob-default"
  }
}
```

### OAuth 2.0 PKCE Authentication (Recommended for OpenCode)

For OpenCode's agent usage, OAuth 2.0 PKCE is recommended. It provides a secure browser-based login flow with automatic token refresh.

#### Prerequisites

1. **IBM Cloud Account** with BOB service access
2. **IAM API Key** for creating an IBM Cloud Access Token (or configure an IBM Cloud IAM client)
3. A redirect URL that the provider will host locally: `http://127.0.0.1:<port>/bob-shell-auth-callback`

#### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BOB_API_BASE_URL` | No | IBM BOB API base URL | `https://api.us-east.bob.ibm.com/inference/v1` |
| `BOB_MODEL` | No | Default model to use | `ibm-bob-default` |
| `AUTH_OAUTH_ENABLED` | Yes | Enable OAuth authentication | - |
| `AUTH_OAUTH_TOKEN_STORE` | No | Token storage backend: `file` or `keytar` | `file` |
| `AUTH_OAUTH_TOKEN_FILE` | No | Path to tokens.json file (when using file store) | `~/.ibm-bob-tokens.json` |
| `IBM_BOB_ENCRYPTION_KEY` | No | AES-256 encryption key for token file | None (unencrypted) |
| `AUTH_OAUTH_CLIENT_ID` | Yes | OAuth client ID | - |
| `AUTH_OAUTH_AUTH_URL` | Yes | Authorization server URL | - |
| `AUTH_OAUTH_TOKEN_URL` | Yes | Token endpoint URL | - |
| `AUTH_OAUTH_REDIRECT_URI` | No | Redirect URI for callback | `http://127.0.0.1:9888/bob-shell-auth-callback` |
| `AUTH_OAUTH_SCOPE` | No | OAuth scopes | `openid` |

#### OpenCode Configuration (OAuth)

```json
{
  "provider": {
    "bob": {
      "type": "@derekchoate/ibm-bob-provider",
      "config": {
        "auth": {
          "oauth": {
            "enabled": true,
            "clientId": "your-client-id",
            "authUrl": "https://iam.cloud.ibm.com/oauth/token",
            "tokenUrl": "https://iam.cloud.ibm.com/identity/token",
            "scope": "openid",
            "redirectUri": "http://127.0.0.1:9888/bob-shell-auth-callback"
          }
        },
        "apiBaseUrl": "https://api.us-east.bob.ibm.com/inference/v1",
        "model": "ibm-bob-default"
      }
    }
  },
  "models": {
    "default": "ibm-bob-default"
  }
}
```

#### OAuth Flow

When OAuth is enabled:

1. **First Run**: The provider launches a browser window pointing to the IBM Cloud authorization URL
2. **User Authorizes**: User logs in and grants permission via the IBM Cloud IAM page
3. **Callback**: IBM redirects back to `http://127.0.0.1:<port>/bob-shell-auth-callback` with an authorization code
4. **Token Exchange**: The provider exchanges the code for access/refresh tokens using PKCE
5. **Token Storage**: Tokens are stored locally (file or keytar) for reuse
6. **Automatic Refresh**: Access tokens are automatically refreshed before expiration

The local callback server binds to `127.0.0.1` only (not exposed on the network). After successful authorization, the server shuts down. Tokens expire after ~2 hours and are silently refreshed in the background.

#### Token Storage Options

| Backend | Description | Platform Support |
|---------|-------------|------------------|
| `file` (default) | Encrypted JSON file at `~/.ibm-bob-tokens.json` | All platforms |
| `keytar` | OS native credential store (macOS Keychain, Windows Credential Manager, Linux libsecret) | Requires native bindings |

To use the keytar backend, install it as a peer dependency:

```bash
npm install keytar
```

#### Encryption

When using the file token store, you can optionally encrypt tokens with an encryption key:

```bash
export IBM_BOB_ENCRYPTION_KEY="your-32-byte-aes-256-key-here"
```

Without encryption, tokens are stored as plaintext JSON. With encryption, they use AES-256-CBC with SHA256 password derivation and random IV/salt per write.

### Programmatic Usage (API Key)

```typescript
import { BobProvider, createBobProvider } from '@derekchoate/ibm-bob-provider';

// Using the class directly
const provider = new BobProvider({
  config: {
    apiKey: 'your-api-key-here',
    apiBaseUrl: 'https://api.us-east.bob.ibm.com/inference/v1',
    model: 'ibm-bob-default',
    temperature: 0.7,
    maxTokens: 4096,
  },
});

// Or using the factory function
const provider = createBobProvider({
  config: {
    apiKey: process.env.BOB_API_KEY!,
  },
});

// Get provider info
console.log(provider.getInfo());
// { name: 'ibm-bob', version: '0.1.0', models: ['ibm-bob-default', 'ibm-bob-large'] }

// Validate configuration
const errors = provider.validate();
if (errors.length > 0) {
  console.error('Validation failed:', errors);
}
```

### Chat Completions

```typescript
// Non-streaming completion
const result = await provider.complete({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello, who are you?' },
  ],
  model: 'ibm-bob-default',
});

console.log(result.content);
// { usage: result.usage } // Token usage info

// Streaming completion
const streamResult = await provider.completeStream(
  {
    messages: [
      { role: 'user', content: 'Write a short poem about AI.' },
    ],
  },
  (chunk, fullContent) => {
    process.stdout.write(chunk);
  }
);

console.log('\n\nUsage:', streamResult.usage);
```

## Available Models

| Model ID | Description | Max Tokens | Context Window |
|----------|-------------|------------|----------------|
| `ibm-bob-default` | Default IBM BOB model for general purposes | 4,096 | 8,192 |
| `ibm-bob-large` | Larger IBM BOB model with enhanced capabilities | 8,192 | 16,384 |

## API Reference

### `BobProvider` Class

| Method | Description |
|--------|-------------|
| `constructor(options?)` | Create a new provider instance |
| `getInfo()` | Get provider information (name, version, models) |
| `getConfig()` | Get the resolved configuration |
| `validate()` | Validate the current configuration |
| `complete(options)` | Send a non-streaming chat completion request |
| `completeStream(options, callback)` | Send a streaming chat completion request |

### Configuration Interfaces

#### `BobProviderConfig` (API Key)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `apiKey` | `string` | Yes (if not using OAuth) | IBM BOB API key |
| `apiBaseUrl` | `string` | No | Base URL for the BOB API |
| `model` | `string` | No | Default model ID |
| `maxTokens` | `number` | No | Maximum response tokens (default: 4096) |
| `temperature` | `number` | No | Sampling temperature 0-2 (default: 0.7) |
| `topP` | `number` | No | Top-p sampling parameter (default: 1.0) |
| `frequencyPenalty` | `number` | No | Frequency penalty -2 to 2 (default: 0.0) |
| `presencePenalty` | `number` | No | Presence penalty -2 to 2 (default: 0.0) |
| `timeout` | `number` | No | Request timeout in ms (default: 30000) |

#### OAuth Configuration (`auth.oauth`)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `enabled` | `boolean` | Yes | Enable OAuth authentication |
| `clientId` | `string` | Yes (if enabled) | OAuth client ID |
| `authUrl` | `string` | Yes (if enabled) | Authorization server URL |
| `tokenUrl` | `string` | Yes (if enabled) | Token endpoint URL |
| `redirectUri` | `string` | No | Redirect URI for callback (default: `http://127.0.0.1:9888/bob-shell-auth-callback`) |
| `scope` | `string` | No | OAuth scopes (default: `openid`) |

### Auth Module Exports

```typescript
import {
  AuthProvider,           // Main OAuth auth orchestrator
  PKCEManager,           // PKCE code verifier/challenge generation
  TokenStore,            // Encrypted token persistence
  startCallbackServer,   // Local HTTP callback server
} from '@derekchoate/ibm-bob-provider/auth';
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Watch mode for development
npm run dev

# Run linting
npm run lint

# Run tests
npm test
```

### Running Tests

```bash
npm test                    # Run all tests
npm test -- --watch         # Watch mode
npm test -- --coverage      # With coverage report
```

## Building for Distribution

```bash
npm run build
```

Output will be in `dist/` directory with:
- `dist/index.js` - Compiled JavaScript
- `dist/index.d.ts` - TypeScript declarations
- `dist/config.js`, `dist/provider.js`, etc. - Module files

## Troubleshooting

### API Key Issues

Make sure your `BOB_API_KEY` environment variable is set correctly, or pass it directly in the config:

```typescript
const provider = createBobProvider({
  config: { apiKey: 'your-actual-api-key' }
});
```

### OAuth Login Issues

1. **Browser doesn't open**: Ensure `open` package is installed (`npm install open`)
2. **Callback server port conflict**: Change the redirect URI port via `AUTH_OAUTH_REDIRECT_URI=http://127.0.0.1:9889/bob-shell-auth-callback`
3. **Token refresh failures**: Delete `~/.ibm-bob-tokens.json` and re-authorize

### Connection Timeout

If requests are timing out, increase the timeout value:

```typescript
const provider = createBobProvider({
  config: { timeout: 60000 } // 60 seconds
});
```

### Invalid Model Error

Verify that the model ID you're using is available. Check with `provider.getInfo().models`.

## Architecture

The OAuth authentication system consists of these components:

```
src/auth/
├── index.ts              # Barrel exports
├── AuthProvider.ts       # Main orchestrator - handles auto-refresh on API calls
├── PKCEManager.ts        # PKCE code verifier/challenge generation (SHA256)
├── TokenStore.ts         # Token persistence (file or keytar backend)
└── CallbackServer.ts     # Local HTTP server for OAuth callback
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.