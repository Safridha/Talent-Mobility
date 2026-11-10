import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const vite = resolve(root, 'node_modules', 'vite', 'bin', 'vite.js')
const children = new Set()
let stopping = false

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
})
start(process.execPath, process.execPath, [vite, '--host', '127.0.0.1', '--port', '8000', '--strictPort'])

console.log('Frontend: http://127.0.0.1:8000 (API proxied to backend on port 8001)')
