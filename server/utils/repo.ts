import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'

type DbLike = {
  prepare: (sql: string) => {
    bind: (...params: any[]) => {
      first: <T = any>() => Promise<T | null>
      run: () => Promise<unknown>
    }
  }
}

type DevUser = {
  id: string
  username: string
  passwordHash: string
  createdAt: string
}

type DevSession = {
  id: string
  userId: string
  expiresAt: string
}

type DevBoard = {
  userId: string
  payload: string
  updatedAt: string
}

type DevDatabase = {
  users: DevUser[]
  sessions: DevSession[]
  boards: DevBoard[]
}

type AuthenticatedUser = {
  id: string
  username: string
}

const DEV_DB_PATH = join(process.cwd(), '.data', 'dev-db.json')

const emptyDevDatabase = (): DevDatabase => ({
  users: [],
  sessions: [],
  boards: []
})

const getCloudflareDb = (event: H3Event): DbLike | null => {
  const binding = (event.context.cloudflare?.env as Record<string, unknown> | undefined)?.DB

  if (!binding || typeof binding !== 'object' || !('prepare' in binding)) {
    return null
  }

  return binding as DbLike
}

const readDevDatabase = async (): Promise<DevDatabase> => {
  try {
    const raw = await readFile(DEV_DB_PATH, 'utf8')
    const parsed = JSON.parse(raw) as Partial<DevDatabase>

    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      boards: Array.isArray(parsed.boards) ? parsed.boards : []
    }
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return emptyDevDatabase()
    }

    throw error
  }
}

const writeDevDatabase = async (database: DevDatabase) => {
  await mkdir(join(process.cwd(), '.data'), { recursive: true })
  await writeFile(DEV_DB_PATH, JSON.stringify(database, null, 2), 'utf8')
}

const withDevDatabase = async <T>(callback: (database: DevDatabase) => Promise<T>) => {
  const database = await readDevDatabase()
  const result = await callback(database)
  await writeDevDatabase(database)
  return result
}

export const getStorageMode = (event: H3Event) => {
  return getCloudflareDb(event) ? 'd1' : 'dev-file'
}

export const findUserByUsername = async (event: H3Event, username: string) => {
  const db = getCloudflareDb(event)

  if (db) {
    return db
      .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
      .bind(username)
      .first<{ id: string; username: string; password_hash: string }>()
  }

  const database = await readDevDatabase()
  const user = database.users.find((item) => item.username === username)

  return user
    ? {
        id: user.id,
        username: user.username,
        password_hash: user.passwordHash
      }
    : null
}

export const createUserWithBoard = async (
  event: H3Event,
  username: string,
  passwordHash: string,
  payload: string
) => {
  const db = getCloudflareDb(event)
  const userId = randomUUID()
  const createdAt = new Date().toISOString()

  if (db) {
    await db
      .prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .bind(userId, username, passwordHash, createdAt)
      .run()

    await db
      .prepare('INSERT INTO boards (user_id, payload, updated_at) VALUES (?, ?, ?)')
      .bind(userId, payload, createdAt)
      .run()
  } else {
    await withDevDatabase(async (database) => {
      database.users.push({
        id: userId,
        username,
        passwordHash,
        createdAt
      })

      database.boards.push({
        userId,
        payload,
        updatedAt: createdAt
      })
    })
  }

  return {
    id: userId,
    username,
    password_hash: passwordHash
  }
}

export const createUserSession = async (event: H3Event, userId: string, expiresAt: string) => {
  const db = getCloudflareDb(event)
  const sessionId = randomUUID()

  if (db) {
    await db
      .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(sessionId, userId, expiresAt)
      .run()
  } else {
    await withDevDatabase(async (database) => {
      database.sessions = database.sessions.filter((item) => item.expiresAt > new Date().toISOString())
      database.sessions.push({
        id: sessionId,
        userId,
        expiresAt
      })
    })
  }

  return sessionId
}

export const getSessionUser = async (event: H3Event, sessionId: string, nowIso: string): Promise<(AuthenticatedUser & { sessionId: string }) | null> => {
  const db = getCloudflareDb(event)

  if (db) {
    const session = await db
      .prepare(`
        SELECT sessions.id, sessions.user_id, users.username
        FROM sessions
        INNER JOIN users ON users.id = sessions.user_id
        WHERE sessions.id = ? AND sessions.expires_at > ?
      `)
      .bind(sessionId, nowIso)
      .first<{ id: string; user_id: string; username: string }>()

    return session
      ? {
          id: session.user_id,
          username: session.username,
          sessionId: session.id
        }
      : null
  }

  return withDevDatabase(async (database) => {
    database.sessions = database.sessions.filter((item) => item.expiresAt > nowIso)
    const session = database.sessions.find((item) => item.id === sessionId)

    if (!session || session.expiresAt <= nowIso) {
      return null
    }

    const user = database.users.find((item) => item.id === session.userId)

    if (!user) {
      return null
    }

    return {
      id: user.id,
      username: user.username,
      sessionId: session.id
    }
  })
}

export const deleteSession = async (event: H3Event, sessionId: string) => {
  const db = getCloudflareDb(event)

  if (db) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
    return
  }

  await withDevDatabase(async (database) => {
    database.sessions = database.sessions.filter((item) => item.id !== sessionId)
  })
}

export const getBoardPayloadByUserId = async (event: H3Event, userId: string) => {
  const db = getCloudflareDb(event)

  if (db) {
    return db
      .prepare('SELECT payload FROM boards WHERE user_id = ?')
      .bind(userId)
      .first<{ payload: string }>()
  }

  const database = await readDevDatabase()
  const board = database.boards.find((item) => item.userId === userId)

  return board
    ? {
        payload: board.payload
      }
    : null
}

export const saveBoardPayload = async (event: H3Event, userId: string, payload: string, updatedAt: string) => {
  const db = getCloudflareDb(event)

  if (db) {
    await db
      .prepare('INSERT OR REPLACE INTO boards (user_id, payload, updated_at) VALUES (?, ?, ?)')
      .bind(userId, payload, updatedAt)
      .run()
    return
  }

  await withDevDatabase(async (database) => {
    const existing = database.boards.find((item) => item.userId === userId)

    if (existing) {
      existing.payload = payload
      existing.updatedAt = updatedAt
      return
    }

    database.boards.push({
      userId,
      payload,
      updatedAt
    })
  })
}
