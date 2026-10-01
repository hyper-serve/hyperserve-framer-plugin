# Hyperserve for Framer

A Framer plugin for [Hyperserve](https://hyperserve.io). Connect your
Hyperserve account, upload a video, browse your library, and insert your
videos directly onto the canvas in Framer.

## Development

```bash
npm install
npm run dev
```

Then in Framer: open a project, go to Plugins, choose "Open Development
Plugin", and point it at `https://localhost:5173`.

To develop against a local Hyperserve API instead of production, set
`VITE_HYPERSERVE_API_URL` (for example in a `.env.local` file):

```
VITE_HYPERSERVE_API_URL=http://localhost:3001/api
```

## Testing

```bash
npm test             # unit tests
npm run test:coverage
```

## License

MIT
