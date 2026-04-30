#!/usr/bin/env bun
/**
 * Run Hurl contract tests against the implementation under test.
 *
 * The implementation is whatever HTTP server is running on $API_URL
 * (default http://localhost:7213). The runner does not boot the impl —
 * that's the caller's responsibility, on purpose, so the same script
 * works against the JS impl, a future Rust impl, a remote staging URL, etc.
 *
 * Usage:
 *   # In one terminal: boot the impl
 *   cd services/api-ts && bun dev
 *
 *   # In another terminal: run the contract tests
 *   bun run test:contract
 *
 *   # Or against a remote target
 *   API_URL=https://stg.example.com bun run test:contract
 */

import { spawnSync, spawn } from 'child_process'
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'

const apiUrl = process.env.API_URL ?? 'http://localhost:7213'
const contractDir = join(import.meta.dir, '..', 'specs', 'api', 'tests', 'contract')

if (!existsSync(contractDir)) {
  console.error(`Contract test dir not found: ${contractDir}`)
  process.exit(1)
}

// Suffix lets each run use unique fixture identifiers (emails, etc.)
const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

// Discover .hurl files
const files = readdirSync(contractDir)
  .filter((f) => f.endsWith('.hurl'))
  .sort()
  .map((f) => join(contractDir, f))

if (files.length === 0) {
  console.error('No .hurl files found in', contractDir)
  process.exit(1)
}

// Sanity-check hurl is installed
const probe = spawnSync('hurl', ['--version'], { stdio: 'ignore' })
if (probe.error || probe.status !== 0) {
  console.error('Hurl is not installed. Install it from https://hurl.dev/docs/installation.html')
  console.error('  macOS:  brew install hurl')
  console.error('  Linux:  see hurl.dev install instructions')
  process.exit(127)
}

console.log(`→ ${files.length} contract scenario(s) against ${apiUrl}\n`)

const child = spawn(
  'hurl',
  [
    '--test',
    '--variable', `api=${apiUrl}`,
    '--variable', `suffix=${suffix}`,
    ...files,
  ],
  { stdio: 'inherit' },
)

child.on('exit', (code) => {
  process.exit(code ?? 1)
})
