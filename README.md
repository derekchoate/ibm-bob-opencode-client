# IBM BOB Provider for OpenCode

A TypeScript/JavaScript provider that integrates **IBM BOB** as an LLM model source for [OpenCode](https://github.com/opencode-ai/opencode), using an OpenAI-compatible API format.

## Features

- OpenAI-compatible chat completions API
- Streaming responses (Server-Sent Events)
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

### Environment Variables

Set the following environment variables:

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BOB_API_KEY` | Yes | Your IBM BOB API key | - |
| `BOB_API_BASE_URL` | No | IBM BOB API base URL | `https://bob-api.ibm.com/inference/v1` |
| `BOB_MODEL` | No | Default model to use | `ibm-bob-default` |

### OpenCode Configuration

Add the IBM BOB provider to your OpenCode configuration (`~/.opencode.json` or project-level config):

```json
{
  "provider": {
    "bob": {
      "type": "@derekchoate/ibm-bob-provider",
      "config": {
        "apiKey": "${BOB_API_KEY}",
        "apiBaseUrl": "https://bob-api.ibm.com/inference/v1",
        "model": "ibm-bob-default"
      }
    }
  },
  "models": {
    "default": "ibm-bob-default"
  }
}
```

### Programmatic Usage

```typescript
import { BobProvider, createBobProvider } from '@derekchoate/ibm-bob-provider';

// Using the class directly
const provider = new BobProvider({
  config: {
    apiKey: 'your-api-key-here',
    apiBaseUrl: 'https://bob-api.ibm.com/inference/v1',
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

### `BobProviderConfig` Interface

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `apiKey` | `string` | Yes | IBM BOB API key |
| `apiBaseUrl` | `string` | No | Base URL for the BOB API |
| `model` | `string` | No | Default model ID |
| `maxTokens` | `number` | No | Maximum response tokens (default: 4096) |
| `temperature` | `number` | No | Sampling temperature 0-2 (default: 0.7) |
| `topP` | `number` | No | Top-p sampling parameter (default: 1.0) |
| `frequencyPenalty` | `number` | No | Frequency penalty -2 to 2 (default: 0.0) |
| `presencePenalty` | `number` | No | Presence penalty -2 to 2 (default: 0.0) |
| `timeout` | `number` | No | Request timeout in ms (default: 30000) |

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

# Run tests (when implemented)
npm test
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

### Connection Timeout

If requests are timing out, increase the timeout value:

```typescript
const provider = createBobProvider({
  config: { timeout: 60000 } // 60 seconds
});
```

### Invalid Model Error

Verify that the model ID you're using is available. Check with `provider.getInfo().models`.

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.