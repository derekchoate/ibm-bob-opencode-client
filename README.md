# IBM BOB Provider for AI SDK

A TypeScript provider that integrates **IBM BOB** as an AI model source for applications using [@ai-sdk/provider](https://github.com/verel/ai) (LangSpec V3), implementing the `LanguageModelV3` interface via IBM BOB's OpenAI-compatible API endpoint.

## Features

- **AI SDK LangSpec V3 compliant** — Implements `@ai-sdk/provider`'s `LanguageModelV3` and `ProviderV3` interfaces
- **Streaming and non-streaming support** — Full streaming (SSE) and blocking chat completions
- **Two authentication methods:**
  - **API Key** - Simple bearer token authentication
  - **OAuth 2.0 PKCE** - Browser-based flow with automatic token refresh
- **Factory function pattern** — Create providers and models via `bob()` or `ibmBob()`
- **Configurable models, temperature, and tokens**
- **Environment variable support**
- **Full TypeScript type definitions**

## Installation

```bash
npm install @derekchoate/ibm-bob-provider
```

Peer dependency for streaming:

```bash
# No additional peer dependencies required — uses native fetch API
```

## Quick Start

```typescript
import { bob, ibmBob } from '@derekchoate/ibm-bob-provider';

// Method 1: Using the default provider instance
const bobProvider = bob();
const model1 = bobProvider('ibm/granite-4-hybrid', { apiKey: 'sk-...' });

// Method 2: Using a configured provider
const bobConfigured = bob({ apiKey: 'sk-...', baseUrl: 'https://api.us-east.bob.ibm.com/inference/v1' });
const model2 = bobConfigured('ibm/granite-4-hybrid');

// Method 3: Direct model creation
const model3 = ibmBob('ibm/granite-4-hybrid', { apiKey: 'sk-...' });
```

## Configuration

### API Key Authentication (Simple)

#### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BOB_API_KEY` | Yes (if not using OAuth) | Your IBM BOB API key | - |
| `BOB_API_BASE_URL` | No | IBM BOB API base URL | `https://api.us-east.bob.ibm.com/inference/v1` |
| `BOB_MODEL` | No | Default model to use | `premium` |

#### Programmatic Usage (API Key)

```typescript
import { ibmBob, createBobAiProvider } from '@derekchoate/ibm-bob-provider';

// Direct model creation with ibmBob()
const model = ibmBob('ibm/granite-4-hybrid', {
  apiKey: 'your-api-key-here',
  baseUrl: 'https://api.us-east.bob.ibm.com/inference/v1',
  timeout: 30000,
});

// Or using createBobAiProvider() factory
const bob = createBobAiProvider({
  apiKey: process.env.BOB_API_KEY!,
  baseUrl: 'https://api.us-east.bob.ibm.com/inference/v1',
});

const model2 = bob('ibm/granite-4-hybrid');
```

### OAuth 2.0 PKCE Authentication (Recommended)

For OAuth authentication, the provider accepts a `getToken` function that resolves fresh tokens per-request:

#### Prerequisites

1. **IBM Cloud Account** with BOB service access
2. **IAM API Key** for creating an IBM Cloud Access Token
3. A redirect URL that the provider will host locally: `http://127.0.0.1:<port>/bob-shell-auth-callback`

#### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BOB_API_BASE_URL` | No | IBM BOB API base URL | `https://api.us-east.bob.ibm.com/inference/v1` |
| `BOB_MODEL` | No | Default model to use | `premium` |
| `AUTH_OAUTH_ENABLED` | Yes | Enable OAuth authentication | - |
| `AUTH_OAUTH_TOKEN_STORE` | No | Token storage backend: `file` or `keytar` | `file` |
| `AUTH_OAUTH_TOKEN_FILE` | No | Path to tokens.json file (when using file store) | `~/.ibm-bob-tokens.json` |
| `IBM_BOB_ENCRYPTION_KEY` | No | AES-256 encryption key for token file | None (unencrypted) |
| `BOB_OAUTH_ISSUER_URL` | Yes | OAuth issuer URL | - |
| `BOB_OAUTH_CLIENT_ID` | Yes | OAuth client ID | - |
| `BOB_OAUTH_CLIENT_SECRET` | No | OAuth client secret | - |
| `BOB_OAUTH_CALLBACK_PATH` | No | Callback path | `/bob-shell-auth-callback` |
| `BOB_OAUTH_SCOPES` | No | OAuth scopes (space-separated) | `openid` |

#### Programmatic Usage (OAuth)

```typescript
import { ibmBob } from '@derekchoate/ibm-bob-provider';
import { createAuthProvider } from '@derekchoate/ibm-bob-provider/auth';

// Create auth provider
const auth = createAuthProvider({
  oauthConfig: {
    issuerUrl: process.env.BOB_OAUTH_ISSUER_URL!,
    clientId: process.env.BOB_OAUTH_CLIENT_ID!,
    callbackPath: '/bob-shell-auth-callback',
    scope: ['openid'],
  },
  tokenStoreBackend: 'file',
});

// Start OAuth flow (opens browser)
await auth.login();

// Create model with getToken resolver
const model = ibmBob('ibm/granite-4-hybrid', {
  getToken: () => auth.getAccessToken(),
});

// Tokens are automatically refreshed before expiration on each request
```

#### OAuth Flow

When OAuth is enabled:

1. **First Run**: Call `auth.login()` which launches a browser window pointing to the authorization URL
2. **User Authorizes**: User logs in and grants permission via the IAM page
3. **Callback**: IBM redirects back to the local callback URL with an authorization code
4. **Token Exchange**: The provider exchanges the code for access/refresh tokens using PKCE (SHA256)
5. **Token Storage**: Tokens are stored locally (file or keytar) for reuse
6. **Automatic Refresh**: Access tokens are automatically refreshed before expiration via `getToken`

The local callback server binds to `127.0.0.1` only (not exposed on the network). After successful authorization, the server shuts down. Tokens expire after ~2 hours and are silently refreshed in the background.

#### Token Storage Options

| Backend | Description | Platform Support |
|---------|-------------|------------------|
| `file` (default) | Encrypted JSON file at `~/.ibm-bob-tokens.json` | All platforms |
| `keychain` | OS native credential store (macOS Keychain, Windows Credential Manager, Linux libsecret) | Requires native bindings |

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

## Usage with AI SDK

```typescript
import { generateText, streamText } from 'ai';
import { ibmBob } from '@derekchoate/ibm-bob-provider';

// Non-streaming completion
const model = ibmBob('ibm/granite-4-hybrid', { apiKey: 'sk-...' });

const { text } = await generateText({
  model,
  prompt: 'Write a short poem about AI.',
});

console.log(text);

// Streaming completion
const { textStream } = await streamText({
  model,
  prompt: 'Explain quantum computing in simple terms.',
});

for await (const chunk of textStream) {
  process.stdout.write(chunk);
}
```

## Available Models

The provider supports any model ID supported by the IBM BOB API. Common models include:

| Model ID | Description |
|----------|-------------|
| `ibm/granite-4-hybrid` | IBM Granite 4 Hybrid model |
| `premium` | Default premium model (fallback) |

To discover available models dynamically, use the `fetchAvailableModels` helper:

```typescript
import { fetchAvailableModels } from '@derekchoate/ibm-bob-provider';

const models = await fetchAvailableModels({ apiKey: 'sk-...' });
console.log(models); // [{ id: 'model-id', name: 'Model Name', ... }]
```

## API Reference

### Factory Functions

| Function | Description |
|----------|-------------|
| `ibmBob(modelId, settings?)` | Create a single language model instance |
| `createBobAiProvider(options?)` | Create a provider factory with shared configuration |
| `bob(modelId?, settings?)` | Default provider instance (shorthand) |

### Provider Interface (`BobProvider`)

The returned provider from `createBobAiProvider()` or `bob()` is a callable function:

```typescript
// Callable directly
const model = bob('model-id', settings);

// Or via .languageModel method
const model2 = bob.languageModel('model-id', settings);
```

### `BobLanguageModel` Class

| Property/Method | Description |
|-----------------|-------------|
| `provider` | Returns `'ibm-bob'` |
| `modelId` | Returns the model ID |
| `getSettings()` | Get a copy of the current settings |
| `doGenerate(options)` | Generate a non-streaming completion (internal) |
| `doStream(options)` | Generate a streaming completion (internal) |

### Configuration Types

#### `BobAiProviderSettings`

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `defaultModel` | `string` | No | Default model ID |
| `baseUrl` | `string` | No | Base URL for the IBM BOB API |
| `apiKey` | `string` | No (or use `getToken`) | Static API key for legacy auth |
| `getToken` | `() => Promise<string>` | No (or use `apiKey`) | Async token resolver for OAuth2 |
| `timeout` | `number` | No | Request timeout in ms (default: 30000) |
| `headers` | `Record<string, string>` | No | Extra headers per request |

#### Config Helpers (from `config.ts`)

| Function | Description |
|----------|-------------|
| `resolveConfig(override?)` | Resolve full config from env vars and overrides |
| `validateConfig(config)` | Validate configuration, returns error array |
| `getApiKey(config?)` | Get API key from config or env var |
| `getApiBaseUrl(config?)` | Get base URL from config or env var |
| `getModel(config?)` | Get default model from config or env var |
| `fetchAvailableModels(config?)` | Dynamically discover models from API |
| `clearModelCache()` | Clear the model discovery cache |

### Auth Module Exports (`@derekchoate/ibm-bob-provider/auth`)

```typescript
import {
  AuthProvider,           // Main OAuth auth orchestrator
  createAuthProvider,     // Factory for AuthProvider instances
  TokenStore,            // Token persistence (file or keytar)
  startCallbackServer,   // Local HTTP callback server
  generatePKCE,          // PKCE code verifier/challenge generation
} from '@derekchoate/ibm-bob-provider/auth';
```

## Project Structure

```
src/
├── index.ts                    # Main exports (AI SDK provider + config + auth)
├── model.ts                    # BobLanguageModel — LanguageModelV3 implementation
├── provider.ts                 # Provider factory — createBobAiProvider(), bob
├── types.ts                    # TypeScript type definitions
├── config.ts                   # Configuration resolution and validation helpers
├── ibm-bob-converter.ts        # OpenAI API format ↔ AI SDK format converter
├── ibm-bob-transport.ts        # HTTP transport layer (JSON + SSE streaming)
├── auth/                       # OAuth2 authentication module
│   ├── index.ts                # Barrel exports
│   ├── AuthProvider.ts         # Main OAuth orchestrator with auto-refresh
│   ├── PKCEManager.ts          # PKCE code verifier/challenge generation
│   ├── TokenStore.ts           # Token persistence (file or keytar)
│   └── CallbackServer.ts       # Local HTTP server for OAuth callback
└── __tests__/                  # Test files
    ├── config.test.ts
    ├── ibm-bob-converter.test.ts
    ├── ibm-bob-model-and-provider.test.ts
    ├── ibm-bob-transport.test.ts
    └── auth/                   # Auth module tests
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

Output will be in `dist/` directory with compiled JavaScript and TypeScript declarations matching the source file structure.

## Troubleshooting

### API Key Issues

Make sure your `BOB_API_KEY` environment variable is set correctly, or pass it directly in the settings:

```typescript
const model = ibmBob('ibm/granite-4-hybrid', { apiKey: 'your-actual-api-key' });
```

### OAuth Login Issues

1. **Browser doesn't open**: Ensure `open` package is installed (`npm install open`)
2. **Callback server port conflict**: Change the callback path via `BOB_OAUTH_CALLBACK_PATH=/custom-callback`
3. **Token refresh failures**: Delete `~/.ibm-bob-tokens.json` and re-authorize

### Connection Timeout

If requests are timing out, increase the timeout value:

```typescript
const model = ibmBob('ibm/granite-4-hybrid', { timeout: 60000 }); // 60 seconds
```

### Model Not Found

Verify that the model ID you're using is supported by the IBM BOB API. Check available models with `fetchAvailableModels()`.

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.