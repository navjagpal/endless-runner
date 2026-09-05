#!/usr/bin/env node
/**
 * Builds every app into dist/<app>/ and copies the landing page to dist/.
 * The deploy workflow publishes dist/ as one GitHub Pages site.
 */
import { rmSync, mkdirSync, cpSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

for (const app of readdirSync(join(root, 'apps'))) {
  if (!existsSync(join(root, 'apps', app, 'package.json'))) continue
  console.log(`\n=== building ${app} ===`)
  execSync('npm run build', { cwd: join(root, 'apps', app), stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } })
}
cpSync(join(root, 'site'), dist, { recursive: true })
console.log('\nsite assembled in dist/')
