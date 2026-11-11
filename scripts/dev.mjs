import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const vite = resolve(root, 'node_modules', 'vite', 'bin', 'vite.js')
const children = new Set()
let stopping = false
const usesLocalDatabase = !process.env.DATABASE_URL
const localDatabaseUrl = 'postgres://postgres:local-dev-only@127.0.0.1:54329/talent_mobility_dev'

if (usesLocalDatabase) {
  const compose = spawnSync('docker', ['compose', 'up', '-d', 'database'], {
    cwd: root,
    stdio: 'inherit',
  })
  if (compose.error || compose.status !== 0) {
    console.error('Docker Compose is required for the no-.env local database. Install Docker Desktop, or set DATABASE_URL to use an existing development database.')
    process.exit(compose.status || 1)
  }

  let databaseReady = false
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const health = spawnSync(
      'docker',
      ['compose', 'exec', '-T', 'database', 'pg_isready', '-U', 'postgres', '-d', 'talent_mobility_dev'],
      { cwd: root, stdio: 'ignore' },
    )
    if (health.status === 0) {
      databaseReady = true
      break
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000))
  }
  if (!databaseReady) {
    console.error('The local PostgreSQL container did not become ready within 30 seconds.')
    process.exit(1)
  }
}

function stop(exitCode) {
  if (stopping) return
  stopping = true
  process.exitCode = exitCode
  for (const child of children) {
    if (child.exitCode === null) child.kill()
  }
}

function start(label, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  })
  children.add(child)
  child.once('error', (error) => {
    console.error(`${label} could not start: ${error.message}`)
    stop(1)
  })
  child.once('exit', (code, signal) => {
    children.delete(child)
    if (!stopping) {
      if (signal) console.error(`${label} stopped after ${signal}`)
      else if (code !== 0) console.error(`${label} exited with code ${code}`)
      stop(code ?? 1)
    }
  })
}

process.once('SIGINT', () => stop(0))
process.once('SIGTERM', () => stop(0))

start('Backend', 'cargo', ['run', '-p', 'app-backend'], {
  APP_ADDR: '127.0.0.1:8001',
  ...(usesLocalDatabase
    ? {
        DATABASE_URL: localDatabaseUrl,
        APP_DEV_MASTER_SEED: 'true',
        ADMIN_NAME: process.env.ADMIN_NAME || 'Local Development Admin',
ADMIN_EMAIL: process.env.ADMIN_EMAIL,
...(process.env.ADMIN_PASSWORD ? { ADMIN_PASSWORD: process.env.ADMIN_PASSWORD } : {}),
      }
    : {}),
})
start(process.execPath, process.execPath, [vite, '--host', '127.0.0.1', '--port', '8000', '--strictPort'])

console.log('Frontend: http://127.0.0.1:8000 (API proxied to backend on port 8001)')
