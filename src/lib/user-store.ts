import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { hashPassword } from './auth'

export interface AppUser {
  id: string
  name: string
  email: string
  passwordHash: string
  role: 'admin' | 'editor' | 'viewer'
  createdAt: string
}

const FILE = path.join(process.cwd(), 'data', 'users.json')

function read(): AppUser[] {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return [] }
}
function write(list: AppUser[]) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8')
}

export function loadUsers(): AppUser[] { return read() }

export function findUserByEmail(email: string): AppUser | undefined {
  return read().find(u => u.email.toLowerCase() === email.toLowerCase())
}

export function saveUser(user: AppUser) {
  const list = read()
  const idx = list.findIndex(u => u.id === user.id)
  if (idx >= 0) list[idx] = user
  else list.push(user)
  write(list)
}

export function deleteUser(id: string) {
  write(read().filter(u => u.id !== id))
}

// Ensure admin exists on startup
export function ensureAdminUser() {
  const users = read()
  if (!users.find(u => u.role === 'admin')) {
    const adminEmail = process.env.VYNSAP_ADMIN_EMAIL?.trim() || 'admin@vynsap.local'
    const adminPassword = process.env.VYNSAP_ADMIN_PASSWORD?.trim() || 'admin123'
    const admin: AppUser = {
      id: `user-${crypto.randomUUID().slice(0, 8)}`,
      name: 'Admin',
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      role: 'admin',
      createdAt: new Date().toISOString(),
    }
    users.push(admin)
    write(users)
  }
}
