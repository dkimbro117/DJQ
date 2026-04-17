import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      {
        name: 'dj-auth-dev-api',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const pathname = (req.url || '').split('?')[0]
            if (pathname !== '/api/dj-auth') return next()
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Method not allowed' }))
              return
            }
            const configuredPassword = env.DJ_PASSWORD
            if (!configuredPassword) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'DJ_PASSWORD is not configured' }))
              return
            }
            const chunks = []
            req.on('data', (chunk) => chunks.push(chunk))
            req.on('end', () => {
              try {
                const raw = Buffer.concat(chunks).toString('utf8')
                const body = raw ? JSON.parse(raw) : {}
                const password = body?.password
                const authorized =
                  typeof password === 'string' && password === configuredPassword
                res.statusCode = 200
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ authorized }))
              } catch {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Invalid JSON body' }))
              }
            })
            req.on('error', next)
          })
        },
      },
    ],
  }
})
